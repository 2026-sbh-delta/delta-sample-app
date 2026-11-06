import { readFile } from 'node:fs/promises';
import { postgresConfig, postgresVersion } from '../lib/storage.mjs';
import { isMain } from '../lib/http.mjs';

// A staging-only operator command, never a server startup migration.
export async function resetDatabase({ env = process.env, createClient } = {}) {
  let client;
  let transaction = false;
  try {
    const name = env.PGDATABASE;
    if (env.APP_ENV !== 'staging' || env.STORAGE_BACKEND !== 'postgres'
        || !/^[a-z][a-z0-9_]{0,62}$/.test(name ?? '')
        || !/(?:^|_)staging(?:_|$)/.test(name)
        || /(?:^|_)(?:prod|production)(?:_|$)/.test(name)
        || env.APP_RESET_DATABASE !== name) throw new Error('Reset refused');

    const config = postgresConfig(env);
    const factory = createClient ?? (async (options) => new (await import('pg')).Client(options));
    client = await factory(config);
    await client.connect();
    const database = (await client.query('SELECT current_database() AS database')).rows[0]?.database;
    const version = await postgresVersion(client);
    if (database !== name || Math.floor(version / 10000) !== 18) throw new Error('Reset refused');

    await client.query('BEGIN');
    transaction = true;
    await client.query('SELECT pg_advisory_xact_lock(17861012)');
    await client.query('SELECT pg_advisory_xact_lock(17861011)');
    await client.query(await readFile(new URL('../migrations/001-notes.sql', import.meta.url), 'utf8'));
    await client.query('TRUNCATE TABLE delta_notes.notes RESTART IDENTITY');
    const remaining = (await client.query('SELECT count(*)::integer AS remaining_rows FROM delta_notes.notes')).rows[0]?.remaining_rows;
    if (!/^\d+$/.test(String(remaining)) || Number(remaining) !== 0) throw new Error('Reset verification failed');
    await client.query('COMMIT');
    transaction = false;
    return { remaining_rows: 0, database_version_num: version };
  } catch {
    if (transaction) {
      try { await client.query('ROLLBACK'); } catch { /* Preserve a safe failure. */ }
    }
    throw new Error('Database reset refused or failed');
  } finally {
    if (client) {
      try { await client.end(); } catch { throw new Error('Database reset connection cleanup failed'); }
    }
  }
}

if (isMain(import.meta.url)) {
  try {
    console.log(JSON.stringify(await resetDatabase()));
  } catch {
    console.error(JSON.stringify({ status: 'error', code: 'DATABASE_RESET_FAILED' }));
    process.exitCode = 1;
  }
}
