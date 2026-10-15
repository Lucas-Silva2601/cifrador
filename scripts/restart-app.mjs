import { spawn } from 'node:child_process';

import { stopPort } from './stop-app.mjs';

const args = process.argv.slice(2);
const mode = args.includes('start') ? 'start' : 'dev';
const open = args.includes('--open');
const portArg = args.find((a) => a.startsWith('--port='));
const port = Number(portArg ? portArg.split('=')[1] : process.env.PORT || 3000);

await stopPort(port);

const openArgs = [mode, ...(open ? [] : ['--no-open']), ...(portArg ? [portArg] : [])];
const child = spawn('node', ['scripts/open-app.mjs', ...openArgs], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, PORT: String(port) },
});

child.on('error', (error) => {
  console.error(`Falha ao reiniciar: ${error.message}`);
  process.exit(1);
});
child.on('exit', (code) => process.exit(code ?? 0));
