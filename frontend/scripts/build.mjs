import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const sources = ['server.mjs', 'lib', 'public'];
let count = 0;
async function check(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = new URL(entry.name, directory);
    if (entry.isDirectory()) await check(new URL(`${entry.name}/`, directory));
    else if (/\.(?:mjs|js)$/.test(entry.name)) {
      const result = spawnSync(process.execPath, ['--check', fileURLToPath(path)], { stdio: 'inherit' });
      if (result.status !== 0) process.exit(result.status ?? 1);
      count += 1;
    }
  }
}
const serverCheck = spawnSync(process.execPath, ['--check', fileURLToPath(new URL('server.mjs', root))], { stdio: 'inherit' });
if (serverCheck.status !== 0) process.exit(serverCheck.status ?? 1);
count += 1;
await check(new URL('lib/', root));
await check(new URL('public/', root));
console.log(`Frontend: checked ${count} JavaScript files.`);
if (!process.argv.includes('--check')) {
  const output = new URL('dist/', root);
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  for (const source of sources) await cp(new URL(source, root), new URL(source, output), { recursive: true });
  console.log('Frontend: built dist/. Run npm run start:built or node dist/server.mjs.');
}
