import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import pg from '../backend/node_modules/pg/lib/index.js';
import { createStore } from '../backend/lib/store.mjs';

test('PostgreSQL preserves data across app instances and binds SQL values', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const env = { DATABASE_URL: process.env.TEST_DATABASE_URL };
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
  await pool.query(await readFile(new URL('../backend/schema.sql', import.meta.url), 'utf8'));
  await pool.query('TRUNCATE notes');
  const first = createStore(env);
  const note = { id: '89a1fffe-0316-401b-b874-80d29b5e188a', title: "x'); DROP TABLE notes; --", content: 'persistent', createdAt: new Date().toISOString() };
  await first.add(note); await first.close();
  const second = createStore(env);
  await second.health();
  assert.equal((await second.list())[0].title, note.title);
  assert.equal(await second.remove('invalid-id'), false);
  assert.equal(await second.remove(note.id), true);
  assert.equal((await second.list()).length, 0);
  await second.close(); await pool.end();
});
