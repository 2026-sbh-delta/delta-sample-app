import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { readFile } from 'node:fs/promises';
import { frontendConfig } from './lib/config.mjs';
import { HttpError, allow, fail, isMain, json, requestContext, start } from './lib/http.mjs';

const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
]);

function proxy(req, res, config) {
  if (req.headers.origin) {
    let sameOrigin = false;
    try {
      sameOrigin = new URL(req.headers.origin).host === req.headers.host;
    } catch { /* An invalid Origin is rejected below. */ }
    if (!sameOrigin) {
      throw new HttpError(403, 'ORIGIN_NOT_ALLOWED', '허용되지 않은 Origin이에요.');
    }
  }
  const request = config.apiOrigin.protocol === 'https:' ? httpsRequest : httpRequest;
  const headers = { 'X-Request-Id': res.getHeader('X-Request-Id') };
  for (const name of ['content-type', 'accept', 'content-length']) {
    if (req.headers[name]) headers[name] = req.headers[name];
  }
  const incomingUrl = new URL(req.url, 'http://localhost');
  const target = new URL(config.apiOrigin);
  target.pathname = incomingUrl.pathname;
  target.search = incomingUrl.search;
  const upstream = request(target, {
    method: req.method,
    headers,
  }, (response) => {
    res.writeHead(response.statusCode, {
      'Content-Type': response.headers['content-type'] ?? 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...(response.headers.allow ? { Allow: response.headers.allow } : {}),
      ...(response.headers.location ? { Location: response.headers.location } : {}),
    });
    response.on('error', () => res.destroy());
    response.pipe(res);
  });
  const timeout = setTimeout(() => upstream.destroy(
    new HttpError(504, 'API_TIMEOUT', 'API 응답이 늦어지고 있어요. 잠시 후 다시 시도해 주세요.'),
  ), config.apiTimeoutMs);
  upstream.on('error', (error) => {
    fail(res, error instanceof HttpError ? error
      : new HttpError(502, 'API_UNAVAILABLE', 'API에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.'));
  });
  res.on('close', () => {
    clearTimeout(timeout);
    upstream.destroy();
  });
  req.on('aborted', () => upstream.destroy());
  req.pipe(upstream);
}

export function createFrontend({ env = process.env, logger = console.log } = {}) {
  const config = frontendConfig(env);
  const server = createServer(async (req, res) => {
    try {
      const path = requestContext(req, res, 'frontend', logger);
      res.setHeader('Referrer-Policy', 'same-origin');
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; object-src 'none'");

      if (path === config.apiEndpoint || path.startsWith(`${config.apiEndpoint}/`)) {
        proxy(req, res, config);
        return;
      }
      allow(req, res, ['GET', 'HEAD']);
      if (path === '/healthz') {
        json(res, 200, { status: 'ok', service: 'frontend', version: config.version });
        return;
      }
      if (path === '/runtime-config.json') {
        json(res, 200, {
          appName: config.appName,
          environment: config.environment,
          version: config.version,
          apiEndpoint: config.apiEndpoint,
        });
        return;
      }
      const asset = assets.get(path);
      if (!asset) throw new HttpError(404, 'NOT_FOUND', '요청한 경로를 찾지 못했어요.');
      const contents = await readFile(new URL(`./public/${asset[0]}`, import.meta.url));
      res.writeHead(200, { 'Content-Type': asset[1], 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : contents);
    } catch (error) {
      fail(res, error);
    }
  });
  server.requestTimeout = 10000;
  return { server, config };
}

if (isMain(import.meta.url)) {
  const { server, config } = createFrontend();
  start(server, config, 'frontend');
}
