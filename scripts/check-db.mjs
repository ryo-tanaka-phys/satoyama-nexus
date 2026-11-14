import pg from 'pg';
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');
const client = new pg.Client({connectionString, connectionTimeoutMillis:10000});
try {
  await client.connect();
  const result = await client.query("SELECT PostGIS_Version() AS version, ST_Distance(ST_SetSRID(ST_MakePoint(135,35),4326)::geography, ST_SetSRID(ST_MakePoint(135,35),4326)::geography) AS distance");
  if (!result.rows[0].version || Number(result.rows[0].distance) !== 0) throw new Error('PostGIS smoke check failed');
  console.log('PostgreSQL connection and PostGIS geography check passed');
} catch { console.error('Database check failed; check local connection and PostGIS initialization.'); process.exitCode = 1; }
finally { await client.end(); }
