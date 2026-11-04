import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import { createBackend } from '../backend/server.mjs';
import { createFrontend } from '../frontend/server.mjs';
import { commonConfig } from '../backend/lib/config.mjs';
import { frontendConfig } from '../frontend/lib/config.mjs';

async function listen(t, server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

async function setup(t, { endpoint = '/api', cors = '' } = {}) {
  const backend = createBackend({
    env: { API_ENDPOINT: endpoint, APP_ENV: 'test', APP_VERSION: 'be-test', CORS_ORIGINS: cors },
    logger: () => {},
  });
  const beUrl = await listen(t, backend.server);
  const frontend = createFrontend({
    env: {
      API_HOST: '127.0.0.1', API_PORT: String(backend.server.address().port), API_ENDPOINT: endpoint,
      APP_ENV: 'test', APP_VERSION: 'fe-test', APP_NAME: 'Test Notes', PRIVATE_TOKEN: 'never-public',
    },
    logger: () => {},
  });
  const feUrl = await listen(t, frontend.server);
  return { beUrl, feUrl, endpoint };
}

const post = (body) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('FE proxy supports create, list and delete with real backend requests', async (t) => {
  const { feUrl, beUrl } = await setup(t);
  const first = await fetch(`${feUrl}/api/notes`);
  assert.deepEqual(await first.json(), { notes: [] });

  const created = await fetch(`${feUrl}/api/notes`, {
    ...post({ title: '  첫 메모  ', content: '<script>alert(1)</script>' }),
    headers: { 'Content-Type': 'application/json', Origin: feUrl, 'X-Request-Id': 'crud-test' },
  });
  assert.equal(created.status, 201);
  assert.equal(created.headers.get('x-request-id'), 'crud-test');
  const { note } = await created.json();
  assert.equal(note.title, '첫 메모');
  assert.equal(note.content, '<script>alert(1)</script>');
  assert.equal(created.headers.get('location'), `/api/notes/${note.id}`);
  assert.ok(!Number.isNaN(Date.parse(note.createdAt)));

  const listed = await fetch(`${beUrl}/api/notes`);
  assert.deepEqual(await listed.json(), { notes: [note] });
  const removed = await fetch(`${feUrl}/api/notes/${note.id}`, { method: 'DELETE', headers: { Origin: feUrl } });
  assert.equal(removed.status, 204);
  assert.deepEqual(await (await fetch(`${feUrl}/api/notes`)).json(), { notes: [] });
});

test('list returns newest notes first', async (t) => {
  const { beUrl } = await setup(t);
  await fetch(`${beUrl}/api/notes`, post({ title: 'first' }));
  await fetch(`${beUrl}/api/notes`, post({ title: 'second' }));
  const { notes } = await (await fetch(`${beUrl}/api/notes`)).json();
  assert.deepEqual(notes.map((note) => note.title), ['second', 'first']);
});

test('runtime API endpoint and target port change without frontend asset changes', async (t) => {
  const { feUrl, beUrl } = await setup(t, { endpoint: '/v2/demo' });
  const config = await (await fetch(`${feUrl}/runtime-config.json`)).json();
  assert.equal(config.apiEndpoint, '/v2/demo');
  assert.equal((await fetch(`${feUrl}/v2/demo/notes`, post({ title: 'configured' }))).status, 201);
  assert.equal((await fetch(`${beUrl}/v2/demo/notes`)).status, 200);
  assert.equal((await fetch(`${feUrl}/api/notes`)).status, 404);
  assert.equal((await fetch(`${beUrl}/api/notes`)).status, 404);
});

test('runtime config exposes only public fields and disables caching', async (t) => {
  const { feUrl } = await setup(t);
  const response = await fetch(`${feUrl}/runtime-config.json`);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), {
    appName: 'Test Notes', environment: 'test', version: 'fe-test', apiEndpoint: '/api',
  });
});

test('health checks identify services and independently injected versions', async (t) => {
  const { feUrl, beUrl } = await setup(t);
  const fe = await (await fetch(`${feUrl}/healthz`)).json();
  const be = await (await fetch(`${beUrl}/healthz`)).json();
  const proxied = await (await fetch(`${feUrl}/api/health`)).json();
  assert.equal(fe.version, 'fe-test');
  assert.equal(fe.service, 'frontend');
  assert.equal(be.version, 'be-test');
  assert.equal(be.storage, 'memory');
  assert.equal(proxied.environment, 'test');
  assert.equal(proxied.status, 'ok');
  assert.equal((await fetch(`${beUrl}/healthz`, { method: 'HEAD' })).status, 200);
});

test('static assets are served with correct types and source files are unavailable', async (t) => {
  const { feUrl } = await setup(t);
  for (const [path, type] of [['/', 'text/html'], ['/app.js', 'text/javascript'], ['/styles.css', 'text/css'], ['/favicon.svg', 'image/svg+xml']]) {
    const response = await fetch(`${feUrl}${path}`);
    assert.equal(response.status, 200);
    assert.ok(response.headers.get('content-type').startsWith(type));
    assert.match(response.headers.get('content-security-policy'), /script-src 'self'/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  }
  for (const path of ['/server.mjs', '/.env', '/backend/server.mjs', '/shared/config.mjs', '/../../package.json']) {
    assert.equal((await fetch(`${feUrl}${path}`)).status, 404, path);
  }
  const head = await fetch(feUrl, { method: 'HEAD' });
  assert.equal(await head.text(), '');
});

test('invalid note bodies are rejected without creating records', async (t) => {
  const { beUrl } = await setup(t);
  for (const body of [null, [], 'text', {}, { title: ' ' }, { title: 3 }, { title: 'a'.repeat(121) }, { title: 'ok', content: 3 }, { title: 'ok', content: 'a'.repeat(2001) }]) {
    const response = await fetch(`${beUrl}/api/notes`, post(body));
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal((await response.json()).error.code, 'INVALID_NOTE');
  }
  assert.deepEqual(await (await fetch(`${beUrl}/api/notes`)).json(), { notes: [] });
});

test('JSON parsing, content type, and byte limits produce distinct errors', async (t) => {
  const { feUrl } = await setup(t);
  const malformed = await fetch(`${feUrl}/api/notes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error.code, 'INVALID_JSON');
  const wrongType = await fetch(`${feUrl}/api/notes`, { method: 'POST', body: 'plain text' });
  assert.equal(wrongType.status, 415);
  const oversized = await fetch(`${feUrl}/api/notes`, post({ title: 'large', content: '한'.repeat(17000) }));
  assert.equal(oversized.status, 413);
  assert.equal((await oversized.json()).error.code, 'PAYLOAD_TOO_LARGE');
});

test('unsupported methods and missing notes return useful errors', async (t) => {
  const { feUrl } = await setup(t);
  const wrongMethod = await fetch(`${feUrl}/api/notes`, { method: 'PUT' });
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get('allow'), 'GET, POST');
  const missing = await fetch(`${feUrl}/api/notes/no-such-note`, { method: 'DELETE' });
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error.code, 'NOTE_NOT_FOUND');
});

test('backend CORS allows only configured origins including preflight', async (t) => {
  const { beUrl } = await setup(t, { cors: 'https://example.test, https://second.test' });
  const allowed = await fetch(`${beUrl}/api/notes`, { headers: { Origin: 'https://example.test' } });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://example.test');
  const denied = await fetch(`${beUrl}/api/notes`, { headers: { Origin: 'https://untrusted.test' } });
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
  const options = await fetch(`${beUrl}/api/notes`, { method: 'OPTIONS', headers: { Origin: 'https://second.test' } });
  assert.equal(options.status, 204);
  assert.match(options.headers.get('access-control-allow-methods'), /POST/);
});

test('frontend rejects cross-origin mutations before proxying', async (t) => {
  const { feUrl, beUrl } = await setup(t);
  const response = await fetch(`${feUrl}/api/notes`, { ...post({ title: 'blocked' }), headers: { 'Content-Type': 'application/json', Origin: 'https://untrusted.test' } });
  assert.equal(response.status, 403);
  assert.deepEqual(await (await fetch(`${beUrl}/api/notes`)).json(), { notes: [] });
});

test('proxy always uses the configured backend even for absolute-form request URLs', async (t) => {
  const { feUrl } = await setup(t);
  const data = await new Promise((resolve, reject) => {
    const req = request(feUrl, { path: 'http://unreachable.invalid/api/health' }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
    });
    req.on('error', reject);
    req.end();
  });
  assert.equal(data.status, 200);
  assert.equal(data.body.service, 'backend');
});

test('backend connection failure is a sanitized 502 while frontend health remains up', async (t) => {
  const unused = createServer();
  unused.listen(0, '127.0.0.1');
  await once(unused, 'listening');
  const port = unused.address().port;
  await new Promise((resolve) => unused.close(resolve));
  const { server } = createFrontend({ env: { API_HOST: '127.0.0.1', API_PORT: String(port) }, logger: () => {} });
  const url = await listen(t, server);
  const response = await fetch(`${url}/api/notes`);
  assert.equal(response.status, 502);
  const body = await response.text();
  assert.match(body, /API_UNAVAILABLE/);
  assert.doesNotMatch(body, /ECONNREFUSED|127\.0\.0\.1|stack/);
  assert.equal((await fetch(`${url}/healthz`)).status, 200);
});

test('slow backend produces 504 within the configured deadline', async (t) => {
  const slow = createServer(() => {});
  await listen(t, slow);
  const { server } = createFrontend({
    env: { API_HOST: '127.0.0.1', API_PORT: String(slow.address().port), API_TIMEOUT_MS: '40' }, logger: () => {},
  });
  const url = await listen(t, server);
  const response = await fetch(`${url}/api/health`);
  assert.equal(response.status, 504);
  assert.equal((await response.json()).error.code, 'API_TIMEOUT');
});

test('separate backend instances do not share in-memory data', async (t) => {
  const one = await setup(t);
  const two = await setup(t);
  await fetch(`${one.beUrl}/api/notes`, post({ title: 'temporary' }));
  assert.deepEqual(await (await fetch(`${two.beUrl}/api/notes`)).json(), { notes: [] });
});

test('invalid deployment environment values fail on startup', () => {
  for (const port of ['0', '-1', '65536', 'abc', '8080abc', '']) {
    assert.throws(() => commonConfig({ PORT: port }, 8080), /PORT/);
  }
  for (const endpoint of ['/', 'api', '/api?x=1', '/healthz', '/api/../private']) {
    assert.throws(() => commonConfig({ API_ENDPOINT: endpoint }, 8080), /API_ENDPOINT/);
  }
  assert.equal(commonConfig({ API_ENDPOINT: '/v1/demo/' }, 8080).apiEndpoint, '/v1/demo');
  assert.throws(() => frontendConfig({ API_HOST: 'http://backend:8080' }), /API_HOST/);
  assert.throws(() => frontendConfig({ API_PROTOCOL: 'ftp' }), /API_PROTOCOL/);
  assert.throws(() => frontendConfig({ API_TIMEOUT_MS: '0' }), /API_TIMEOUT_MS/);
  assert.equal(frontendConfig({ API_HOST: '[::1]' }).apiOrigin.hostname, '[::1]');
});

test('request logs include correlation and status without request bodies or query strings', async (t) => {
  const logs = [];
  const { server } = createBackend({ env: {}, logger: (line) => logs.push(JSON.parse(line)) });
  const url = await listen(t, server);
  await fetch(`${url}/api/notes?secret=hidden`, { ...post({ title: 'private title' }), headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'log-test' } });
  assert.equal(logs[0].requestId, 'log-test');
  assert.equal(logs[0].status, 201);
  assert.equal(logs[0].path, '/api/notes');
  assert.doesNotMatch(JSON.stringify(logs), /private title|secret|hidden/);
});
