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

/**
 * Verifies applied history checksums against loaded files and applies pending migrations
 * in per-file transactions. Never uses DROP/TRUNCATE/reset; mid-DDL failure rolls back cleanly.
 */
export async function applyMigrations(
  client: PoolClient,
  migrations: readonly MigrationFile[]
): Promise<{ applied: string[]; skipped: string[] }> {
  await ensureMigrationHistoryTable(client);
  const existing = await getAppliedMigrations(client);
  const existingMap = new Map(existing.map((r) => [r.version, r.checksum]));

  // Verify no applied migration is missing from files or tampered with
  const fileMap = new Map(migrations.map((m) => [m.version, m.checksum]));
  for (const rec of existing) {
    const expectedChecksum = fileMap.get(rec.version);
    if (!expectedChecksum || expectedChecksum !== rec.checksum) {
      throw new Error(`Migration checksum mismatch or missing file for applied version: ${rec.version}`);
    }
  }

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const m of migrations) {
    if (existingMap.has(m.version)) {
      skipped.push(m.version);
      continue;
    }
    await client.query('BEGIN');
    try {
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
