import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const serverCheck = spawnSync(process.execPath, ['--check', fileURLToPath(new URL('server.mjs', root))], { stdio: 'inherit' });
if (serverCheck.status !== 0) process.exit(serverCheck.status ?? 1);
let count = 1;
for (const file of await readdir(new URL('lib/', root))) {
  if (!file.endsWith('.mjs')) continue;
  const result = spawnSync(process.execPath, ['--check', fileURLToPath(new URL(`lib/${file}`, root))], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
  count += 1;
}
console.log(`Backend: checked ${count} JavaScript files.`);
if (!process.argv.includes('--check')) {
  const output = new URL('dist/', root);
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  for (const source of ['server.mjs', 'lib', 'package.json', 'package-lock.json']) {
    await cp(new URL(source, root), new URL(source, output), { recursive: true });
  }
  console.log('Backend: built dist/. Run npm run start:built or node dist/server.mjs.');
}
