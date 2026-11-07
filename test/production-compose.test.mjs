import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { commit, digests } from './fixtures/deployment-contract.mjs';

const root = new URL('../', import.meta.url);
const file = new URL('../compose.production.yaml', import.meta.url);
const envFile = new URL('./fixtures/compose.production.env', import.meta.url);
const composeVersion = spawnSync('docker', ['compose', 'version'], { encoding: 'utf8', timeout: 10000 });
const noCompose = composeVersion.status !== 0;

async function render(overrides = {}) {
  assert.ok(await access(file).then(() => true, () => false), 'Production deployment input compose.production.yaml is absent; local compose.yaml cannot replace it');
  return spawnSync('docker', ['compose', '--env-file', fileURLToPath(envFile), '-f', fileURLToPath(file), 'config', '--format', 'json'], {
    cwd: root, encoding: 'utf8', timeout: 10000,
    // Deliberately exclude ambient application secrets and COMPOSE_FILE.
    env: { PATH: process.env.PATH, HOME: process.env.HOME, ...overrides },
  });
}

for (const [provider, driver] of [['gcp', 'gcplogs'], ['aws', 'awslogs']]) {
  test(`production Compose ${provider}: immutable pair, private BE, BE-only file secrets and ${driver}`, { skip: noCompose }, async () => {
    const rendered = await render({ CLOUD_PROVIDER: provider, LOG_DRIVER: driver });
    assert.equal(rendered.status, 0, rendered.stderr);
    const config = JSON.parse(rendered.stdout);
    assert.ok(config.services.backend && config.services.frontend, 'Both app services are required');
    for (const service of ['frontend', 'backend']) {
      const value = config.services[service];
      assert.ok(!Object.hasOwn(value, 'build'), `${service}: no production build`);
      assert.match(value.image, /^[^\s@]+@sha256:[a-f0-9]{64}$/);
      assert.ok(value.image.endsWith(`@${digests[service]}`));
      assert.equal(value.environment.APP_ENV, 'production');
      assert.equal(value.environment.APP_VERSION, commit);
      assert.equal(value.environment.CLOUD_PROVIDER, provider);
      assert.equal(value.logging.driver, driver);
      assert.ok(!Object.hasOwn(value.environment, 'APP_RESET_DATABASE'), 'Reset must not be configured in production');
      assert.ok(!value.env_file?.length, 'Avoid materializing secret env-file values in compose config');
      assert.doesNotMatch(JSON.stringify(value.environment), /PGPASSWORD|DATABASE_URL/);
      assert.ok(!['host', 'service:backend'].includes(value.network_mode));
    }
    const { backend, frontend } = config.services;
    assert.ok(!backend.ports?.length, 'BE must not publish a host port');
    assert.equal(backend.environment.STORAGE_BACKEND, 'postgres');
    assert.equal(frontend.environment.API_HOST, 'backend');
    assert.ok(frontend.ports?.length > 0, 'FE is the ingress');
    assert.ok(!frontend.secrets?.length, 'FE must not receive DB secrets');
    assert.ok(backend.secrets?.length > 0, 'BE must receive a mounted secret file');
    for (const secret of backend.secrets) {
      const declaration = config.secrets[secret.source];
      assert.ok(declaration?.file, 'Secret must come from a BE-only file');
      assert.equal(declaration.file, '/tmp/delta-contract-only/backend.env');
    }
    assert.ok(!(frontend.volumes ?? []).some((volume) => volume.source === '/tmp/delta-contract-only/backend.env'), 'FE cannot mount the BE secret file');
    if (provider === 'gcp') {
      for (const value of [frontend, backend]) assert.equal(value.logging.options['gcp-project'], 'term2-delta');
    } else {
      for (const value of [frontend, backend]) {
        assert.equal(value.logging.options['awslogs-region'], 'ap-northeast-2');
        assert.match(value.logging.options['awslogs-group'], /^\/delta\/workload\//);
      }
    }
  });
}

for (const missing of ['FE_IMAGE', 'BE_IMAGE']) {
  test(`production Compose rejects absent ${missing} instead of using a local tag`, { skip: noCompose }, async () => {
    const output = await render({ [missing]: '' });
    assert.notEqual(output.status, 0);
    assert.match(output.stderr, new RegExp(missing));
  });
}
