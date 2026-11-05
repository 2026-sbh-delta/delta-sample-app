// Read deployment configuration at process startup, independently of the backend.
import { cloudProvider } from './provider.mjs';

export function integer(env, name, fallback, max = 65535) {
  const value = env[name] ?? String(fallback);
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > max) {
    throw new Error(`${name} must be an integer between 1 and ${max}`);
  }
  return Number(value);
}

export function commonConfig(env, defaultPort) {
  if (['staging', 'production'].includes(env.APP_ENV) && !/^[a-f0-9]{40}$/.test(env.APP_VERSION ?? '')) {
    throw new Error('APP_VERSION must be a full40 commit SHA in staging and production');
  }
  const apiEndpoint = (env.API_ENDPOINT ?? '/api').replace(/\/+$/, '');
  if (!/^\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(apiEndpoint)
      || apiEndpoint === '/healthz') {
    throw new Error('API_ENDPOINT must be a path such as /api or /v1/api');
  }
  return {
    host: env.HOST ?? '0.0.0.0',
    port: integer(env, 'PORT', defaultPort),
    apiEndpoint,
    environment: env.APP_ENV ?? 'local',
    version: env.APP_VERSION ?? 'dev',
  };
}

export function frontendConfig(env) {
  const config = commonConfig(env, 3000);
  const provider = cloudProvider(env);
  const apiProtocol = env.API_PROTOCOL ?? 'http';
  const apiHost = env.API_HOST ?? '127.0.0.1';
  if (!['http', 'https'].includes(apiProtocol)) {
    throw new Error('API_PROTOCOL must be http or https');
  }
  if (!/^(?:[a-zA-Z0-9_.-]+|\[[a-fA-F0-9:]+\])$/.test(apiHost)) {
    throw new Error('API_HOST must be a hostname or IP address without a scheme or port');
  }
  return {
    ...config,
    appName: env.APP_NAME ?? 'Delta Board',
    cloudProvider: provider,
    servedBy: env.SERVED_BY || provider,
    digest: env.IMAGE_DIGEST ?? '',
    apiOrigin: new URL(`${apiProtocol}://${apiHost}:${integer(env, 'API_PORT', 8080)}`),
    apiTimeoutMs: integer(env, 'API_TIMEOUT_MS', 5000, 120000),
  };
}
