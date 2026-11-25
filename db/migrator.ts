import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PoolClient, Queryable } from 'pg';

export interface MigrationFile {
  version: string;
  sql: string;
  checksum: string;
}

export interface AppliedMigrationRecord {
  version: string;
  checksum: string;
  applied_at: string;
}

export function sha256Hex(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/** Loads versioned .sql files sorted lexicographically (e.g. 0001_..., 0002_...). */
export async function loadMigrationFiles(migrationsDir: string): Promise<MigrationFile[]> {
  const entries = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  if (entries.length === 0) throw new Error(`No migration files found in ${migrationsDir}`);
  const result: MigrationFile[] = [];
  for (const name of entries) {
    if (!/^\d{4}_[a-z0-9_]+\.sql$/.test(name)) {
      throw new Error(`Invalid migration filename format: ${name}`);
    }
    const sql = await readFile(join(migrationsDir, name), 'utf8');
    result.push({ version: name, sql, checksum: sha256Hex(sql) });
  }
  return result;
}

export async function ensureMigrationHistoryTable(client: Queryable): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      version text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

export async function getAppliedMigrations(client: Queryable): Promise<AppliedMigrationRecord[]> {
  await ensureMigrationHistoryTable(client);
  const res = await client.query<AppliedMigrationRecord>(
    'SELECT version, checksum, applied_at::text FROM public.schema_migrations ORDER BY version ASC'
  );
  return res.rows;
}

const MIGRATION_ADVISORY_LOCK_KEY = 72819401;

/**
 * Verifies applied history checksums against loaded files and applies pending migrations
 * in per-file transactions under a transaction-scoped PostgreSQL advisory lock
 * (`pg_advisory_xact_lock`, compatible with both direct Postgres and Neon/PgBouncer
 * transaction pooling while preventing concurrent serverless cold-start races).
 * Never uses DROP/TRUNCATE/reset.
 */
export async function applyMigrations(
  client: PoolClient,
  migrations: readonly MigrationFile[]
): Promise<{ applied: string[]; skipped: string[] }> {
  const fileMap = new Map(migrations.map((m) => [m.version, m.checksum]));

  // Phase 1: bootstrap schema_migrations & verify existing checksums under xact lock
  await client.query('BEGIN');
  try {
    await client.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_ADVISORY_LOCK_KEY]);
    await ensureMigrationHistoryTable(client);
    const existing = await getAppliedMigrations(client);
    for (const rec of existing) {
      const expectedChecksum = fileMap.get(rec.version);
      if (!expectedChecksum || expectedChecksum !== rec.checksum) {
        throw new Error(`Migration checksum mismatch or missing file for applied version: ${rec.version}`);
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }

  const applied: string[] = [];
  const skipped: string[] = [];

  // Phase 2: apply each pending migration atomically under xact lock
  for (const m of migrations) {
    await client.query('BEGIN');
    try {
      await client.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_ADVISORY_LOCK_KEY]);
      const check = await client.query<{ checksum: string }>(
        'SELECT checksum FROM public.schema_migrations WHERE version = $1',
        [m.version]
      );
      if (check.rows.length > 0) {
        if (check.rows[0].checksum !== m.checksum) {
          throw new Error(`Migration checksum mismatch or missing file for applied version: ${m.version}`);
        }
        await client.query('COMMIT');
        skipped.push(m.version);
        continue;
      }

      await client.query(m.sql);
      await client.query(
        'INSERT INTO public.schema_migrations (version, checksum) VALUES ($1, $2)',
        [m.version, m.checksum]
      );
      await client.query('COMMIT');
      applied.push(m.version);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  }

  return { applied, skipped };
}
