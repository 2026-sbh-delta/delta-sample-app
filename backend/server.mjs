import { instrument } from './lib/telemetry.mjs';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { createStore } from './lib/store.mjs';
import { commonConfig } from './lib/config.mjs';
import { HttpError, allow, fail, isMain, json, readJson, requestContext, start } from './lib/http.mjs';

export function createBackend({ env = process.env, logger = console.log } = {}) {
  const config = commonConfig(env, 8080);
  const origins = (env.CORS_ORIGINS ?? '').split(',').map((origin) => origin.trim()).filter(Boolean);
  const notes = createStore(env);
  const started = performance.now();

  const server = createServer(instrument(async (req, res) => {
    try {
      const path = requestContext(req, res, 'backend', logger);
      const origin = req.headers.origin;
      if (origin) {
        res.setHeader('Vary', 'Origin');
        if (!origins.includes(origin)) {
          throw new HttpError(403, 'ORIGIN_NOT_ALLOWED', '허용되지 않은 Origin이에요.');
        }
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Request-Id');
      }

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (path === '/healthz' || path === `${config.apiEndpoint}/health`) {
        allow(req, res, ['GET', 'HEAD']);
        await notes.health();
        json(res, 200, {
          status: 'ok',
          service: 'backend',
          environment: config.environment,
          version: config.version,
          instance: hostname(),
          uptimeSeconds: Math.floor((performance.now() - started) / 1000),
          storage: notes.kind,
        });
        return;
      }

      if (path === `${config.apiEndpoint}/notes`) {
        allow(req, res, ['GET', 'POST']);
        if (req.method === 'GET') {
          json(res, 200, { notes: await notes.list() });
          return;
        }

        const body = await readJson(req);
        if (!body || Array.isArray(body) || typeof body !== 'object'
            || typeof body.title !== 'string' || !body.title.trim()
            || body.title.trim().length > 120
            || (body.content !== undefined && typeof body.content !== 'string')
            || (body.content?.length ?? 0) > 2000) {
          throw new HttpError(400, 'INVALID_NOTE', '제목은 1~120자, 내용은 2,000자 이하로 입력해 주세요.');
        }
        const note = {
          id: randomUUID(),
          title: body.title.trim(),
          content: (body.content ?? '').trim(),
          createdAt: new Date().toISOString(),
        };
        await notes.add(note);
        json(res, 201, { note }, { Location: `${config.apiEndpoint}/notes/${note.id}` });
        return;
      }

      if (path.startsWith(`${config.apiEndpoint}/notes/`)) {
        allow(req, res, ['DELETE']);
        const id = path.slice(`${config.apiEndpoint}/notes/`.length);
        if (!await notes.remove(id)) {
          throw new HttpError(404, 'NOTE_NOT_FOUND', '메모를 찾지 못했어요. 목록을 새로고침해 주세요.');
        }
        res.writeHead(204);
        res.end();
        return;
      }

      throw new HttpError(404, 'NOT_FOUND', '요청한 경로를 찾지 못했어요.');
    } catch (error) {
      fail(res, error);
    }
  }, 'backend'));
  server.once('close', () => notes.close());
  server.requestTimeout = 10000;
  return { server, config };
}

if (isMain(import.meta.url)) {
  const { server, config } = createBackend();
  start(server, config, 'backend');
}
