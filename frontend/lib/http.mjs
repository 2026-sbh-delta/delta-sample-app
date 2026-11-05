import { randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function json(res, status, data, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(JSON.stringify(data));
}

export function fail(res, error) {
  if (res.writableEnded || res.destroyed) return;
  if (res.headersSent) {
    res.destroy();
    return;
  }
  const known = error instanceof HttpError;
  json(res, known ? error.status : 500, {
    error: {
      code: known ? error.code : 'INTERNAL_ERROR',
      message: known ? error.message : '요청을 처리하지 못했어요. 다시 시도해 주세요.',
      requestId: res.getHeader('X-Request-Id'),
    },
  });
}

export function requestContext(req, res, service, logger = console.log) {
  const started = performance.now();
  const requestId = /^[a-zA-Z0-9_-]{1,64}$/.test(req.headers['x-request-id'] ?? '')
    ? req.headers['x-request-id'] : randomUUID();
  res.setHeader('X-Request-Id', requestId);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.on('finish', () => logger(JSON.stringify({
    timestamp: new Date().toISOString(), service, requestId, method: req.method,
    path: req.url.split('?')[0], status: res.statusCode,
    durationMs: Math.round((performance.now() - started) * 100) / 100,
  })));
  return new URL(req.url, 'http://localhost').pathname;
}

export function allow(req, res, methods) {
  if (!methods.includes(req.method)) {
    res.setHeader('Allow', methods.join(', '));
    throw new HttpError(405, 'METHOD_NOT_ALLOWED', '지원하지 않는 요청 방식이에요.');
  }
}

export function isMain(url) {
  return Boolean(process.argv[1]) && url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href;
}

export function start(server, config, service) {
  server.on('error', (error) => {
    console.error(JSON.stringify({ service, event: 'server_error', code: error.code }));
    process.exit(1);
  });
  server.listen(config.port, config.host, () => {
    console.log(JSON.stringify({ service, event: 'listening', port: config.port, version: config.version }));
  });
  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    server.close(() => process.exit(0));
    setTimeout(() => {
      server.closeAllConnections();
      process.exit(1);
    }, 5000).unref();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
