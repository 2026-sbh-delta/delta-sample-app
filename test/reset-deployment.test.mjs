import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { access, cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fakeClient, loadReset, stagingEnv } from './fixtures/deployment-contract.mjs';

for (const [name, changes] of [
  ['production', { APP_ENV: 'production' }],
  ['missing APP_ENV', { APP_ENV: undefined }],
  ['local', { APP_ENV: 'local' }],
  ['missing reset allowlist', { APP_RESET_DATABASE: undefined }],
  ['different reset database', { APP_RESET_DATABASE: 'other_staging' }],
  ['production database even if allowlist matches', { PGDATABASE: 'delta_board_production', APP_RESET_DATABASE: 'delta_board_production' }],
  ['memory storage', { STORAGE_BACKEND: 'memory' }],
]) {
  test(`reset rejects ${name} before creating a DB client`, async () => {
    const resetDatabase = await loadReset();
    let created = 0;
    await assert.rejects(async () => resetDatabase({
      env: { ...stagingEnv, ...changes },
      createClient: () => { created += 1; throw new Error('DB must not be contacted'); },
    }));
    assert.equal(created, 0, 'Unsafe reset must fail before a connection is created');
  });
}

test('reset observes PG18 and current_database, prepares schema and verifies zero inside the truncate transaction', async () => {
  const resetDatabase = await loadReset();
  const db = fakeClient();
  const result = await resetDatabase({ env: stagingEnv, createClient: () => db.client });
  assert.equal(result.remaining_rows, 0);
  assert.equal(result.database_version_num, 180003);
  assert.equal(typeof result.remaining_rows, 'number');
  assert.equal(typeof result.database_version_num, 'number');
  const sql = db.sql();
  const index = (pattern) => sql.findIndex((statement) => pattern.test(statement));
  const begin = index(/^\s*BEGIN\b/i);
  const truncate = index(/TRUNCATE\s+(?:TABLE\s+)?(?:"?delta_notes"?)\.(?:"?notes"?)[\s\S]*RESTART\s+IDENTITY/i);
  const count = index(/count\s*\(/i);
  const commit = index(/^\s*COMMIT\b/i);
  assert.ok(index(/\bSHOW\s+server_version_num\b/i) >= 0, 'Version must come from SHOW server_version_num');
  assert.ok(index(/current_database\s*\(/i) >= 0, 'Compare the connected DB identity, not only env strings');
  assert.ok(begin >= 0 && truncate > begin && count > truncate && commit > count, 'BEGIN -> app-only TRUNCATE RESTART IDENTITY -> count -> COMMIT');
  assert.ok(index(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS/i) >= 0, 'First-run schema must be prepared');
  assert.doesNotMatch(sql.join('\n'), /\bCASCADE\b|DROP\s+(?:SCHEMA|DATABASE)/i);
  assert.equal(db.calls.at(-1).kind, 'end');
});

for (const [name, options] of [
  ['actual PG16 despite desired PG18', { version: 160013 }],
  ['actual PG17', { version: 170004 }],
  ['actual PG19', { version: 190001 }],
  ['connected database differs from allowlist', { database: 'delta_board_production' }],
]) {
  test(`reset rejects ${name} without TRUNCATE or schema writes`, async () => {
    const resetDatabase = await loadReset();
    const db = fakeClient(options);
    await assert.rejects(async () => resetDatabase({ env: { ...stagingEnv, PG_MAJOR_VERSION: '18' }, createClient: () => db.client }));
    assert.doesNotMatch(db.sql().join('\n'), /TRUNCATE|CREATE\s+(?:TABLE|SCHEMA)|COMMIT/i);
    assert.equal(db.calls.at(-1).kind, 'end');
  });
}

for (const [name, options] of [
  ['residual rows', { remaining: 1 }],
  ['TRUNCATE error', { failTruncate: true }],
  ['missing count', { remaining: undefined }],
  ['negative count', { remaining: -1 }],
]) {
  test(`reset rolls back ${name} and never reports success`, async () => {
    const resetDatabase = await loadReset();
    // Explicit undefined must not be replaced by the fixture's zero default.
    const db = fakeClient({ ...options, remaining: name === 'missing count' ? null : options.remaining ?? 0 });
    await assert.rejects(async () => resetDatabase({ env: stagingEnv, createClient: () => db.client }));
    assert.ok(db.sql().some((sql) => /^\s*ROLLBACK\b/i.test(sql)));
    assert.ok(!db.sql().some((sql) => /^\s*COMMIT\b/i.test(sql)));
    assert.equal(db.calls.at(-1).kind, 'end');
  });
}

test('reset CLI refuses production with nonzero exit and no secret/SQL details', async () => {
  await loadReset();
  const output = spawnSync(process.execPath, ['backend/scripts/reset-db.mjs'], {
    cwd: new URL('../', import.meta.url), encoding: 'utf8', timeout: 5000,
    env: { PATH: process.env.PATH, ...stagingEnv, APP_ENV: 'production' },
  });
  assert.equal(output.error, undefined);
  assert.notEqual(output.status, 0);
  assert.doesNotMatch(output.stdout + output.stderr, /fixture-only-never-a-real-secret|postgres(?:ql)?:\/\/|TRUNCATE|at file:/i);
  // A safe refusal may use stderr; stdout must never claim remaining_rows:0.
  if (output.stdout.trim()) assert.notEqual(JSON.parse(output.stdout).remaining_rows, 0);
});

test('reset CLI success stdout is one typed JSON result (injected pg, not runtime evidence)', async () => {
  await loadReset();
  const fixture = new URL('./fixtures/health-pg.mjs', import.meta.url).href;
  const hook = `import { registerHooks } from 'node:module';
    registerHooks({ resolve(specifier, context, nextResolve) {
      if (specifier === 'pg') return { url: ${JSON.stringify(fixture)}, shortCircuit: true };
      return nextResolve(specifier, context);
    } });`;
  const output = spawnSync(process.execPath, [
    '--import', `data:text/javascript,${encodeURIComponent(hook)}`, 'backend/scripts/reset-db.mjs',
  ], {
    cwd: new URL('../', import.meta.url), encoding: 'utf8', timeout: 5000,
    env: { PATH: process.env.PATH, ...stagingEnv },
  });
  assert.equal(output.error, undefined);
  assert.equal(output.status, 0, output.stderr);
  const result = JSON.parse(output.stdout);
  assert.equal(result.remaining_rows, 0);
  assert.equal(result.database_version_num, 180003);
  assert.equal(typeof result.remaining_rows, 'number');
  assert.equal(typeof result.database_version_num, 'number');
  assert.doesNotMatch(output.stdout + output.stderr, /fixture-only-never-a-real-secret|postgres(?:ql)?:\/\/|TRUNCATE/i);
});

test('isolated BE dist includes executable reset and the migration SQL', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'delta-reset-build-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const item of ['package.json', 'package-lock.json', 'server.mjs', 'lib', 'scripts', 'migrations']) {
    await cp(new URL(`../backend/${item}`, import.meta.url), join(directory, item), { recursive: true });
  }
  const built = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: directory, encoding: 'utf8', timeout: 30000 });
  assert.equal(built.status, 0, built.stdout + built.stderr);
  assert.ok(await access(join(directory, 'dist/scripts/reset-db.mjs')).then(() => true, () => false), 'BE image build artifact is missing the reset command');
  const sql = await readFile(join(directory, 'dist/migrations/001-notes.sql'), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS delta_notes\.notes/);
  const cli = spawnSync(process.execPath, ['dist/scripts/reset-db.mjs'], {
    cwd: directory, encoding: 'utf8', timeout: 5000,
    env: { PATH: process.env.PATH, ...stagingEnv, APP_ENV: 'production' },
  });
  assert.notEqual(cli.status, 0);
  assert.doesNotMatch(cli.stderr, /ERR_MODULE_NOT_FOUND|Cannot find module/);
});

test('reset clears only the explicitly named real staging database', {skip: process.env.PG_INTEGRATION !== '1'}, async () => {
  const {createRequire} = await import('node:module');
  const {Client} = createRequire(new URL('../backend/package.json', import.meta.url))('pg');
  const {postgresConfig} = await import('../backend/lib/storage.mjs');
  const admin = new Client(postgresConfig({...process.env, PGSSLMODE: 'disable'}));
  await admin.connect();
  const name = 'delta_reset_staging';
  try {
    await admin.query(`CREATE DATABASE ${name}`);
    const resetDatabase = await loadReset();
    const env = {...process.env, APP_ENV: 'staging', STORAGE_BACKEND: 'postgres', PGDATABASE: name, APP_RESET_DATABASE: name, PGSSLMODE: 'disable'};
    const first = await resetDatabase({env});
    assert.equal(first.remaining_rows, 0);
    assert.equal(Math.floor(first.database_version_num / 10000), 18);
    const db = new Client(postgresConfig(env));
    await db.connect();
    try {
      await db.query("INSERT INTO delta_notes.notes(id,title,content,created_at) VALUES ('11111111-1111-4111-8111-111111111111','reset fixture','test',now())");
    } finally {await db.end();}
    assert.equal((await resetDatabase({env})).remaining_rows, 0);
  } finally {
    await admin.query(`DROP DATABASE IF EXISTS ${name}`);
    await admin.end();
  }
});
