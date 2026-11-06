import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { createBackend } from '../backend/server.mjs';
import { state } from './fixtures/health-pg.mjs';
import { listen, stagingEnv } from './fixtures/deployment-contract.mjs';

registerHooks({resolve(specifier, context, nextResolve) {
  if (specifier === 'pg') return {url: new URL('./fixtures/health-pg.mjs', import.meta.url).href, shortCircuit: true};
  return nextResolve(specifier, context);
}});

test('staging health reports observed database version, remaining rows and active writes', async t => {
  state.version = 180003;
  const app = createBackend({env: stagingEnv, logger: () => {}});
  t.after(() => app.storage.close());
  const url = await listen(t, app.server);
  const response = await fetch(url + '/api/health');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.databaseVersionNum, 180003);
  assert.equal(body.remainingRows, 0);
  assert.equal(body.activeWrites, 0);
});

test('normal memory app still starts without staging reset requirements', async t => {
  const app = createBackend({env: {APP_ENV: 'aws'}, logger: () => {}});
  const url = await listen(t, app.server);
  const response = await fetch(url + '/api/health');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).storage, 'memory');
});
