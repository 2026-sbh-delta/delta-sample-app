#!/bin/sh
set -eu
# Keep the existing host contract: a password-only secret, never an env file.
PGPASSWORD="$(cat /run/secrets/db_password 2>/dev/null)" || {
  echo '{"status":"error","code":"DB_SECRET_UNAVAILABLE"}' >&2
  exit 1
}
test -n "$PGPASSWORD" || {
  echo '{"status":"error","code":"DB_SECRET_EMPTY"}' >&2
  exit 1
}
export PGPASSWORD

# The host starts the GCP proxy after backend's network namespace exists.
# Wait for loopback TCP only; the server then verifies PG18 and the schema.
if [ "${PGSSLMODE:-}" = disable ]; then
  node --input-type=module <<'NODE'
import { createConnection } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
if (['127.0.0.1', 'localhost', '::1'].includes(process.env.PGHOST)) {
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    ready = await new Promise((resolve) => {
      const socket = createConnection({ host: process.env.PGHOST, port: Number(process.env.PGPORT || 5432) });
      const done = (value) => { socket.destroy(); resolve(value); };
      socket.setTimeout(500);
      socket.once('connect', () => done(true));
      socket.once('error', () => done(false));
      socket.once('timeout', () => done(false));
    });
    if (ready) break;
    await delay(500);
  }
  if (!ready) {
    console.error(JSON.stringify({ status: 'error', code: 'DB_PROXY_UNAVAILABLE' }));
    process.exit(1);
  }
}
NODE
fi
exec "$@"
