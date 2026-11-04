import { spawn } from 'node:child_process';

const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill('SIGTERM');
}

for (const service of ['backend', 'frontend']) {
  const child = spawn(process.execPath, [
    '--watch', '--env-file-if-exists=.env', 'server.mjs',
  ], { stdio: 'inherit', env: process.env, cwd: new URL(`../${service}/`, import.meta.url) });
  children.push(child);
  child.on('error', (error) => {
    console.error(`${service}: ${error.message}`);
    stop(1);
  });
  child.on('exit', (code, signal) => {
    if (!stopping) stop(code ?? (signal ? 1 : 0));
  });
}
process.once('SIGINT', () => stop());
process.once('SIGTERM', () => stop());
console.log('Delta Notes: http://localhost:3000 (default FE port; override in frontend/.env)');
