import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';

test('OTLP carries a shared FE→BE trace, request histogram and sanitized error', async (t) => {
  const signals = [];
  const receiver = createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    signals.push({ path: req.url, body: JSON.parse(Buffer.concat(chunks)) });
    res.setHeader('Content-Type', 'application/json'); res.end('{}');
  }).listen(0, '127.0.0.1');
  await once(receiver, 'listening'); t.after(() => receiver.close());
  const ports = [];
  for (let i=0;i<2;i++) { const s=createServer().listen(0,'127.0.0.1'); await once(s,'listening'); ports.push(s.address().port); await new Promise(r=>s.close(r)); }
  const children = [];
  for (const [i, comp] of ['backend','frontend'].entries()) {
    const child=spawn(process.execPath,[`${comp}/server.mjs`], { env:{...process.env, PORT:String(ports[i]), API_PORT:String(ports[0]), API_HOST:'127.0.0.1', OTEL_SERVICE_NAME:comp, OTEL_EXPORTER_OTLP_ENDPOINT:`http://127.0.0.1:${receiver.address().port}`, OTEL_METRIC_EXPORT_INTERVAL:'1000'}, stdio:['ignore','pipe','pipe'] });
    children.push(child); t.after(()=>child.kill('SIGTERM'));
    let started=false;
    child.stdout.on('data', c=>{ if(c.toString().includes('listening'))started=true; });
    for(let n=0;n<100&&!started;n++)await delay(50);
    assert.equal(started,true,`${comp} started`);
  }
  assert.equal((await fetch(`http://127.0.0.1:${ports[1]}/api/health`)).status,200);
  children[0].kill('SIGTERM'); const exit = await once(children[0], 'exit'); assert.equal(exit[0],0,JSON.stringify(exit));
  assert.equal((await fetch(`http://127.0.0.1:${ports[1]}/api/health?token=not-exported`)).status,502);
  await delay(5500);
  children[1].kill('SIGTERM'); await once(children[1], 'exit');
  const spans=signals.flatMap(s=>(s.body.resourceSpans||[]).flatMap(r=>r.scopeSpans.flatMap(x=>x.spans)));
  const pair=spans.filter(s=>s.name==='GET /api/health' && s.status?.code!==2);
  assert.ok(pair.length>=2, JSON.stringify(spans.map(s=>({name:s.name,traceId:s.traceId}))));
  assert.equal(pair[0].traceId,pair[1].traceId);
  assert.ok(pair.some(s=>s.parentSpanId===pair.find(x=>x.spanId!==s.spanId)?.spanId));
  assert.ok(signals.some(s=>s.path==='/v1/metrics'));
  assert.ok(signals.some(s=>s.path==='/v1/logs'));
  assert.ok(!JSON.stringify(signals).includes('not-exported'));
});
