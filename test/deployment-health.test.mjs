import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { request } from 'node:http';
import { createBackend } from '../backend/server.mjs';
import { createFrontend } from '../frontend/server.mjs';
import { Pool, state } from './fixtures/health-pg.mjs';
import { commit, digests, listen, stagingEnv } from './fixtures/deployment-contract.mjs';

// Only the pg dependency is replaced. HTTP, proxy, storage selection, health
// decisions and serialization execute the existing application code.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'pg') return { url: new URL('./fixtures/health-pg.mjs', import.meta.url).href, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

async function setup(t, { provider = 'gcp', servedBy } = {}) {
  const env = { ...stagingEnv, APP_VERSION: commit, CLOUD_PROVIDER: provider, ...(servedBy ? { SERVED_BY: servedBy } : {}) };
  const backend = createBackend({ env: { ...env, IMAGE_DIGEST: digests.backend }, logger: () => {} });
  t.after(() => backend.storage.close());
  const be = await listen(t, backend.server);
  const frontend = createFrontend({
    env: { ...env, IMAGE_DIGEST: digests.frontend, API_HOST: '127.0.0.1', API_PORT: String(backend.server.address().port) },
    logger: () => {},
  });
  const fe = await listen(t, frontend.server);
  return { be, fe, backend };
}

for (const provider of ['aws', 'gcp']) {
  test(`FE and proxied BE health expose ${provider} commit/digest/provider diagnostics`, async (t) => {
    state.version = 180003;
    const { fe } = await setup(t, { provider });
    for (const [path, service] of [['/healthz', 'frontend'], ['/api/health', 'backend']]) {
      const response = await fetch(`${fe}${path}`);
      assert.equal(response.status, 200);
      const health = await response.json();
      assert.equal(health.version, commit, `${service}: preserve existing version as full40 SHA`);
      assert.equal(health.commit, commit, `${service}: commit diagnostic is missing`);
      assert.equal(health.digest, digests[service]);
      assert.equal(health.cloudProvider, provider);
      assert.equal(health.servedBy, provider);
      if (service === 'backend') assert.equal(health.storage, 'postgres');
      assert.doesNotMatch(JSON.stringify(health), /fixture-only-never-a-real-secret|PGPASSWORD|postgres(?:ql)?:\/\//);
    }
  });
}

test('SERVED_BY overrides provider fallback in FE and BE health diagnostics', async (t) => {
  state.version = 180003;
  const { fe } = await setup(t, { servedBy: 'gcp-staging-test' });
  for (const path of ['/healthz', '/api/health']) {
    const health = await (await fetch(`${fe}${path}`)).json();
    assert.equal(health.cloudProvider, 'gcp');
    assert.equal(health.servedBy, 'gcp-staging-test');
  }
});

test('BE HTTP health returns a typed actual databaseVersionNum obtained using SHOW', async (t) => {
  state.version = 180003;
  state.queries = [];
  const { fe, be } = await setup(t);
  for (const [base, path] of [[be, '/healthz'], [fe, '/api/health']]) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 200);
    const health = await response.json();
    assert.equal(health.storage, 'postgres');
    assert.equal(health.databaseVersionNum, 180003, 'Existing HTTP health lacks the actual PG18 observation');
    assert.equal(typeof health.databaseVersionNum, 'number');
  }
  assert.ok(state.queries.some((sql) => /\bSHOW\s+server_version_num\b/i.test(sql)), 'An env value is not a DB version observation');
});

for (const version of [160013, 170004, 190001]) {
  test(`staging BE health refuses actual PG${Math.floor(version / 10000)} despite configured PG18`, async (t) => {
    state.version = version;
    const { fe, be } = await setup(t);
    for (const [base, path] of [[be, '/healthz'], [fe, '/api/health']]) {
      const response = await fetch(`${base}${path}`);
      assert.equal(response.status, 503, 'Non-PG18 must not become staging ready');
      assert.notEqual((await response.json()).status, 'ok');
    }
  });
}

// Extend only this file's pg double; no production/storage methods are replaced.
// COUNT uses pg's text bigint result unless the SQL requests an integer cast.
function countFixture(t, { rows = 0, holdDelete = false, deleted = 1 } = {}) {
  state.version = 180003;
  state.queries = [];
  const originalQuery = Pool.prototype.query;
  const originalConnect = Pool.prototype.connect;
  const deleteEntered = Promise.withResolvers();
  const deleteReleased = Promise.withResolvers();
  const fixture = { rows, deleteEntered: deleteEntered.promise, releaseDelete: () => deleteReleased.resolve() };
  Pool.prototype.query = async function (statement, ...args) {
    const sql = typeof statement === 'string' ? statement : statement.text;
    if (/\bcount\s*\(\s*\*\s*\)/i.test(sql) && /\bFROM\s+"?delta_notes"?\s*\.\s*"?notes"?(?:\s|;|$)/i.test(sql)) {
      state.queries.push(sql);
      const alias = /\bAS\s+(?:"([^"]+)"|(\w+))\s+FROM\b/i.exec(sql);
      const column = alias?.[1] ?? alias?.[2]?.toLowerCase() ?? 'count';
      const value = /::\s*(?:integer|int4|int)\b/i.test(sql) ? fixture.rows : String(fixture.rows);
      return { rows: [{ [column]: value }], rowCount: 1 };
    }
    if (/^\s*DELETE\s+FROM\b/i.test(sql)) {
      state.queries.push(sql);
      deleteEntered.resolve();
      if (holdDelete) await deleteReleased.promise;
      return { rows: [], rowCount: deleted };
    }
    return originalQuery.call(this, statement, ...args);
  };
  Pool.prototype.connect = async function () {
    return { query: this.query.bind(this), release() {} };
  };
  t.after(() => {
    deleteReleased.resolve();
    Pool.prototype.query = originalQuery;
    if (originalConnect === undefined) delete Pool.prototype.connect;
    else Pool.prototype.connect = originalConnect;
  });
  return fixture;
}

async function stagingHealth(base, path = '/healthz') {
  const response = await fetch(`${base}${path}`);
  assert.equal(response.status, 200);
  return response.json();
}

function assertActiveWrites(health, minimum) {
  assert.equal(typeof health.activeWrites, 'number', 'staging health activeWrites is missing or not numeric');
  assert.ok(Number.isSafeInteger(health.activeWrites));
  if (minimum === 0) assert.equal(health.activeWrites, 0, 'Completed/failed/aborted writes must release the counter');
  else assert.ok(health.activeWrites >= minimum, 'A pending POST/DELETE must remain visible to health');
}

async function partialPost(t, { backend, be }, body) {
  const received = Promise.withResolvers();
  const closed = Promise.withResolvers();
  backend.server.once('request', (incoming) => {
    incoming.once('data', () => received.resolve());
    incoming.once('close', () => closed.resolve());
  });
  const completed = Promise.withResolvers();
  const outgoing = request(`${be}/api/notes`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  }, (response) => {
    response.resume();
    response.once('end', () => completed.resolve({ status: response.statusCode }));
  });
  outgoing.on('error', (error) => completed.resolve({ error }));
  t.after(() => outgoing.destroy());
  outgoing.write(body.slice(0, 1));
  await Promise.race([
    received.promise,
    completed.promise.then((result) => { throw result.error ?? new Error('POST ended before receiving the partial body'); }),
  ]);
  return { finish: () => outgoing.end(body.slice(1)), abort: () => outgoing.destroy(), completed: completed.promise, closed: closed.promise };
}

test('staging postgres health remainingRows is a typed, fresh COUNT of app notes', async (t) => {
  const fixture = countFixture(t);
  const { fe, be } = await setup(t);
  for (const rows of [7, 2, 0]) {
    fixture.rows = rows;
    for (const [base, path] of [[be, '/healthz'], [fe, '/api/health']]) {
      const before = state.queries.filter((sql) => /\bcount\s*\(/i.test(sql)).length;
      const health = await stagingHealth(base, path);
      assert.equal(health.remainingRows, rows, 'staging postgres health remainingRows must reflect the DB COUNT, not an assumed zero');
      assert.equal(typeof health.remainingRows, 'number');
      assert.ok(Number.isSafeInteger(health.remainingRows));
      assert.ok(state.queries.filter((sql) => /\bcount\s*\(/i.test(sql)).length > before, 'Each observation must query the current DB row count');
    }
  }
});

for (const [name, body, status] of [
  ['successful POST', '{"title":"pending write"}', 201],
  ['failed POST validation', '{"title":""}', 400],
  ['aborted POST', '{"title":"aborted write"}', null],
]) {
  test(`staging activeWrites covers partial request body and returns to zero after ${name}`, { timeout: 5000 }, async (t) => {
    countFixture(t);
    const app = await setup(t);
    const pending = await partialPost(t, app, body);
    assertActiveWrites(await stagingHealth(app.fe, '/api/health'), 1);
    if (status === null) {
      pending.abort();
      await pending.closed;
    } else {
      pending.finish();
      assert.equal((await pending.completed).status, status);
    }
    assertActiveWrites(await stagingHealth(app.be), 0);
    assertActiveWrites(await stagingHealth(app.fe, '/api/health'), 0);
  });
}

for (const [deleted, status] of [[1, 204], [0, 404]]) {
  test(`staging activeWrites includes a pending DELETE and releases it after HTTP ${status}`, { timeout: 5000 }, async (t) => {
    const fixture = countFixture(t, { holdDelete: true, deleted });
    const app = await setup(t);
    const controller = new AbortController();
    t.after(() => controller.abort());
    const completed = fetch(`${app.be}/api/notes/00000000-0000-4000-8000-000000000000`, {
      method: 'DELETE', signal: controller.signal,
    }).then((response) => ({ status: response.status }), (error) => ({ error }));
    await fixture.deleteEntered;
    assertActiveWrites(await stagingHealth(app.fe, '/api/health'), 1);
    fixture.releaseDelete();
    assert.equal((await completed).status, status);
    assertActiveWrites(await stagingHealth(app.be), 0);
  });
}
