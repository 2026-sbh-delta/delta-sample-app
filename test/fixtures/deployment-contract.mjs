import assert from 'node:assert/strict';
import { once } from 'node:events';
import { access } from 'node:fs/promises';

export const commit = '1234567890abcdef1234567890abcdef12345678';
export const digests = { frontend: `sha256:${'a'.repeat(64)}`, backend: `sha256:${'b'.repeat(64)}` };
export const stagingEnv = {
  APP_ENV: 'staging', STORAGE_BACKEND: 'postgres',
  PGHOST: '127.0.0.1', PGPORT: '5432', PGDATABASE: 'delta_board_staging',
  PGUSER: 'delta_staging_reset', PGPASSWORD: 'fixture-only-never-a-real-secret', PGSSLMODE: 'disable',
  APP_RESET_DATABASE: 'delta_board_staging',
};

export async function listen(t, server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}`;
}

export async function loadReset() {
  const url = new URL('../../backend/scripts/reset-db.mjs', import.meta.url);
  const exists = await access(url).then(() => true, () => false);
  assert.ok(exists, 'BE must provide backend/scripts/reset-db.mjs (reset capability missing, not an import-resolution failure)');
  const module = await import(url.href);
  assert.equal(typeof module.resetDatabase, 'function', 'Export resetDatabase({ env, createClient }) for independently injected pg clients');
  return module.resetDatabase;
}

// A protocol double, not a SQL engine. Real PostgreSQL tests cover SQL semantics.
export function fakeClient({ database = stagingEnv.PGDATABASE, version = 180003, remaining = 0, failTruncate = false } = {}) {
  const calls = [];
  const client = {
    connect: async () => { calls.push({ kind: 'connect' }); },
    end: async () => { calls.push({ kind: 'end' }); },
    query: async (query, values) => {
      const sql = typeof query === 'string' ? query : query.text;
      calls.push({ kind: 'query', sql, values });
      if (/TRUNCATE/i.test(sql) && failTruncate) throw new Error('fixture-only-never-a-real-secret SQL failure');
      if (/count\s*\(/i.test(sql)) return { rows: [{ remaining_rows: remaining }], rowCount: 1 };
      if (/server_version_num|current_database\s*\(/i.test(sql)) {
        return { rows: [{ server_version_num: String(version), database_version_num: version, database: database, current_database: database }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  };
  return { client, calls, sql: () => calls.filter((call) => call.kind === 'query').map((call) => call.sql) };
}
