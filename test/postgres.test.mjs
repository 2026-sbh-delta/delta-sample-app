import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { createBackend } from '../backend/server.mjs';
import { postgresConfig } from '../backend/lib/storage.mjs';

test('postgres mode requires explicit credentials and verified remote TLS', () => {
  assert.throws(() => createBackend({ env: { STORAGE_BACKEND: 'unknown' } }), /STORAGE_BACKEND/);
  assert.throws(() => createBackend({ env: { STORAGE_BACKEND: 'postgres' } }), /PGHOST/);
  const env = { PGHOST: 'database.example.com', PGDATABASE: 'notes', PGUSER: 'app', PGPASSWORD: 'test' };
  assert.throws(() => postgresConfig({ ...env, PGSSLMODE: 'disable' }), /only for a local/);
  assert.throws(() => postgresConfig({ ...env, PGSSLMODE: 'require' }), /verify-full/);
  assert.throws(() => postgresConfig(env), /PGSSLROOTCERT/);
  assert.throws(() => postgresConfig({ ...env, PGPORT: 'invalid' }), /PGPORT/);
});

test('actual PostgreSQL API, process restart, least privilege, concurrency and database failure', {
  skip: process.env.PG_INTEGRATION !== '1', timeout: 60000,
}, async (t) => {
  assert.ok(['127.0.0.1', 'localhost'].includes(process.env.PGHOST), 'Integration tests require an isolated local DB');
  const { Client } = createRequire(new URL('../backend/package.json', import.meta.url))('pg');
  const adminEnv = { ...process.env, PGSSLMODE: 'disable' };
  const admin = new Client(postgresConfig(adminEnv));
  await admin.connect();
  t.after(() => admin.end());
  const appUser = 'delta_notes_test';
  const appPassword = 'integration-only-password-not-a-secret-0001';
  const initialized = spawnSync(process.execPath, ['backend/scripts/provision-db.mjs'], {
    cwd: new URL('../', import.meta.url), env: adminEnv, encoding: 'utf8',
    input: JSON.stringify({ appUser, appPassword }),
  });
  assert.equal(initialized.status, 0, initialized.stdout + initialized.stderr);
  await admin.query('TRUNCATE delta_notes.notes');
  const appEnv = { ...adminEnv, STORAGE_BACKEND: 'postgres', PGUSER: appUser, PGPASSWORD: appPassword, HOST: '127.0.0.1' };
  const processes = new Set();
  async function stop(child) {
    if (child.exitCode !== null) return;
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
    processes.delete(child);
  }
  t.after(async () => { for (const child of processes) await stop(child); });
  async function start(entry = 'backend/server.mjs') {
    const reservation = createServer();
    reservation.listen(0, '127.0.0.1');
    await once(reservation, 'listening');
    const port = reservation.address().port;
    await new Promise((resolve) => reservation.close(resolve));
    const child = spawn(process.execPath, [entry], {
      cwd: new URL('../', import.meta.url), env: { ...appEnv, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    processes.add(child);
    let output = '';
    child.stdout.on('data', (part) => { output += part; });
    child.stderr.on('data', (part) => { output += part; });
    const url = `http://127.0.0.1:${port}`;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (child.exitCode !== null) throw new Error(`Backend failed to start: ${output}`);
      try { if ((await fetch(`${url}/healthz`)).ok) return { child, url }; } catch { /* Wait for the listener. */ }
      await delay(50);
    }
    throw new Error('Backend did not become ready');
  }
  let app = await start();
  const create = (title = 'persist me') => fetch(`${app.url}/api/notes`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, content: 'retained' }),
  });
  await t.test('parameterized CRUD and complete BE process restart retain notes', async () => {
    const title = "'); DROP TABLE delta_notes.notes; --";
    const response = await create(title);
    assert.equal(response.status, 201);
    const { note } = await response.json();
    await stop(app.child);
    app = await start();
    const health = await (await fetch(`${app.url}/api/health`)).json();
    assert.equal(health.storage, 'postgres');
    assert.equal((await (await fetch(`${app.url}/api/notes`)).json()).notes[0].title, title);
    assert.equal((await fetch(`${app.url}/api/notes/not-a-uuid`, { method: 'DELETE' })).status, 404);
    assert.equal((await fetch(`${app.url}/api/notes/${note.id}`, { method: 'DELETE' })).status, 204);
    assert.equal((await (await fetch(`${app.url}/api/notes`)).json()).notes.length, 0);
  });
  await t.test('application role can use notes but cannot change schema', async () => {
    const client = new Client(postgresConfig(appEnv));
    await client.connect();
    try { await assert.rejects(client.query('CREATE TABLE delta_notes.forbidden (id integer)'), { code: '42501' }); }
    finally { await client.end(); }
  });
  await t.test('two concurrent creates cannot exceed 1000 notes', async () => {
    await admin.query("INSERT INTO delta_notes.notes (id,title,content,created_at) SELECT gen_random_uuid(),'seed','',now() FROM generate_series(1,999)");
    const responses = await Promise.all([create('first'), create('second')]);
    assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
    assert.equal((await admin.query('SELECT count(*)::integer AS count FROM delta_notes.notes')).rows[0].count, 1000);
    await admin.query('TRUNCATE delta_notes.notes');
  });
  await t.test('DB failure returns 503 and never silently falls back to memory', async () => {
    await admin.query('ALTER TABLE delta_notes.notes RENAME TO notes_offline');
    try {
      const response = await fetch(`${app.url}/api/health`);
      assert.equal(response.status, 503);
      const text = await response.text();
      assert.ok(text.includes('STORAGE_UNAVAILABLE'));
      assert.ok(!text.includes('notes_offline') && !text.includes(appPassword));
    } finally { await admin.query('ALTER TABLE delta_notes.notes_offline RENAME TO notes'); }
    assert.equal((await fetch(`${app.url}/healthz`)).status, 200);
  });
  await t.test('independent production artifact connects to PostgreSQL without the source tree', async () => {
    const built = spawnSync('npm', ['--prefix', 'backend', 'run', 'build'], { cwd: new URL('../', import.meta.url), encoding: 'utf8' });
    assert.equal(built.status, 0, built.stdout + built.stderr);
    const artifact = await mkdtemp(join(tmpdir(), 'delta-postgres-artifact-'));
    try {
      await cp(new URL('../backend/dist/', import.meta.url), artifact, { recursive: true });
      const installed = spawnSync('npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: artifact, encoding: 'utf8' });
      assert.equal(installed.status, 0, installed.stdout + installed.stderr);
      const isolated = await start(join(artifact, 'server.mjs'));
      assert.equal((await (await fetch(`${isolated.url}/api/health`)).json()).storage, 'postgres');
      await stop(isolated.child);
    } finally { await rm(artifact, { recursive: true, force: true }); }
  });
  await t.test('TLS verifies the certificate host and negotiates encrypted PostgreSQL', {
    skip: !process.env.PGTLS_TEST_CERT,
  }, async () => {
    const tlsEnv = { ...appEnv, PGSSLMODE: 'verify-full', PGSSLROOTCERT: process.env.PGTLS_TEST_CERT, PGTLS_SERVERNAME: 'localhost' };
    const client = new Client(postgresConfig(tlsEnv));
    await client.connect();
    try { assert.equal((await client.query('SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()')).rows[0].ssl, true); }
    finally { await client.end(); }
    const wrongHost = new Client(postgresConfig({ ...tlsEnv, PGTLS_SERVERNAME: 'wrong.example.com' }));
    try { await assert.rejects(wrongHost.connect(), /Hostname|certificate|altname/i); }
    finally { await wrongHost.end(); }
  });
});
