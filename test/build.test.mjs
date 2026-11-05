import assert from 'node:assert/strict';
import { cp, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';

for (const service of ['frontend', 'backend']) {
  test(`${service} builds in isolation and its artifact runs without the source tree`, async (t) => {
    const source = await mkdtemp(join(tmpdir(), `delta-${service}-source-`));
    const artifact = await mkdtemp(join(tmpdir(), `delta-${service}-artifact-`));
    t.after(async () => {
      await rm(source, { recursive: true, force: true });
      await rm(artifact, { recursive: true, force: true });
    });
    const files = ['package.json', 'server.mjs', 'lib', 'scripts'];
    if (service === 'backend') files.push('package-lock.json');
    if (service === 'frontend') files.push('public');
    for (const file of files) {
      await cp(new URL(`../${service}/${file}`, import.meta.url), join(source, file), { recursive: true });
    }
    await writeFile(join(source, '.env'), 'PRIVATE_TOKEN=must-not-ship\n');
    const result = spawnSync(process.execPath, ['scripts/build.mjs'], {
      cwd: source, encoding: 'utf8',
      env: { ...process.env, APP_ENV: 'build-only', APP_VERSION: 'build-only-version' },
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.ok(!(await readdir(join(source, 'dist'))).includes('.env'));
    await cp(join(source, 'dist'), artifact, { recursive: true });
    await rm(source, { recursive: true, force: true });

    const module = await import(pathToFileURL(join(artifact, 'server.mjs')).href);
    const create = service === 'frontend' ? module.createFrontend : module.createBackend;
    const { server } = create({
      env: { APP_ENV: 'artifact-test', APP_VERSION: 'runtime-version', API_ENDPOINT: '/isolated/api' },
      logger: () => {},
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections();
    }));
    const url = `http://127.0.0.1:${server.address().port}`;
    const health = await (await fetch(`${url}/healthz`)).json();
    assert.equal(health.version, 'runtime-version');
    assert.equal(health.service, service);
    if (service === 'frontend') {
      assert.equal((await fetch(url)).status, 200);
      assert.equal((await fetch(`${url}/app.js`)).status, 200);
      const config = await (await fetch(`${url}/runtime-config.json`)).json();
      assert.equal(config.environment, 'artifact-test');
      assert.equal(config.apiEndpoint, '/isolated/api');
    } else {
      const created = await fetch(`${url}/isolated/api/notes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'isolated build' }),
      });
      assert.equal(created.status, 201);
    }
  });
}
