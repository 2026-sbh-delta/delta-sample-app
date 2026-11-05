// Operator-only initialization. Credentials are read from stdin, never argv/logs.
import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
import { postgresConfig } from '../lib/storage.mjs';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const settings = JSON.parse(input);
if (!/^[a-z][a-z0-9_]{2,40}$/.test(settings.appUser ?? '') || !settings.appPassword || settings.appPassword.length < 32) {
  throw new Error('A valid appUser and appPassword of at least 32 characters are required');
}
const client = new Client(postgresConfig(process.env));
try {
  await client.connect();
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(17861012)');
  const exists = (await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [settings.appUser])).rowCount > 0;
  const role = '"' + settings.appUser + '"';
  const password = "'" + settings.appPassword.replaceAll("'", "''") + "'";
  await client.query(`${exists ? 'ALTER' : 'CREATE'} ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD ${password}`);
  await client.query(await readFile(new URL('../migrations/001-notes.sql', import.meta.url), 'utf8'));
  await client.query(`GRANT CONNECT ON DATABASE "${process.env.PGDATABASE.replaceAll('"', '""')}" TO ${role}`);
  await client.query(`GRANT USAGE ON SCHEMA delta_notes TO ${role}`);
  await client.query(`GRANT SELECT, INSERT, DELETE ON TABLE delta_notes.notes TO ${role}`);
  await client.query(`GRANT USAGE ON SEQUENCE delta_notes.notes_position_seq TO ${role}`);
  await client.query('COMMIT');
  console.log('Database schema and application role are ready; existing notes were preserved.');
} catch {
  try { await client.query('ROLLBACK'); } catch { /* Connection may be unavailable. */ }
  console.error('Database initialization failed; credentials and SQL were not logged.');
  process.exitCode = 1;
} finally { await client.end(); }
