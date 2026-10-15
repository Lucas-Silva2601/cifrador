import { spawn, exec } from 'node:child_process';
import http from 'node:http';

const portArg = process.argv.find((a) => a.startsWith('--port='));
const port = Number(portArg ? portArg.split('=')[1] : process.env.PORT || 3000);
const url = `http://localhost:${port}`;
const mode = process.argv[2] === 'start' ? 'start' : 'dev';
const noOpen = process.argv.includes('--no-open');
const serverArgs = mode === 'start' ? ['next', 'start', '--port', String(port)] : ['next', 'dev', '--port', String(port)];

function openBrowser(target) {
  const platform = process.platform;
  const command =
    platform === 'win32' ? `start "" "${target}"` : platform === 'darwin' ? `open "${target}"` : `xdg-open "${target}"`;
  exec(command, (error) => {
    if (error) console.log(`Abra manualmente: ${target}`);
    else console.log(`Navegador aberto em ${target}`);
  });
}

function waitForServer(retries = 60) {
  return new Promise((resolve, reject) => {
    let attempt = 0;
    const tick = () => {
      attempt += 1;
      const request = http.get(url, (response) => {
        response.resume();
        if (response.statusCode && response.statusCode < 500) resolve();
        else if (attempt >= retries) reject(new Error(`Servidor não respondeu em ${url}`));
        else setTimeout(tick, 1000);
      });
      request.on('error', () => {
        if (attempt >= retries) reject(new Error(`Servidor não respondeu em ${url}`));
        else setTimeout(tick, 1000);
      });
    };
    tick();
  });
}

const child = spawn('npx', serverArgs, { stdio: 'inherit', shell: process.platform === 'win32' });

child.on('error', (error) => {
  console.error(`Falha ao iniciar o Next.js: ${error.message}`);
  process.exit(1);
});

try {
  await waitForServer();
  if (!noOpen) openBrowser(url);
  else console.log(`Servidor no ar em ${url}`);
} catch (error) {
  console.error(error.message);
}

function shutdown(signal) {
  child.kill(signal);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
child.on('exit', (code) => process.exit(code ?? 0));
