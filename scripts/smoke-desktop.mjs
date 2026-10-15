import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';

const executable = path.resolve('release', 'win-unpacked', 'Cifrador.exe');
const port = 9224;
const child = spawn(executable, [`--remote-debugging-port=${port}`], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
  stdio: 'ignore',
  windowsHide: true,
});

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
      });
    }).on('error', reject);
  });
}

async function findTarget() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const targets = await getJson(`http://127.0.0.1:${port}/json`);
      const appTarget = targets.find((target) =>
        target.type === 'page' && target.url?.startsWith('file:') && target.title,
      );
      if (appTarget?.webSocketDebuggerUrl) return appTarget;
    } catch {
      // O Electron ainda está iniciando.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('O aplicativo não abriu a porta de diagnóstico.');
}

function evaluate(webSocketUrl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(webSocketUrl);
    const timeout = setTimeout(() => reject(new Error('A interface não respondeu a tempo.')), 8_000);
    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: {
          expression: `Promise.all([
            Promise.resolve(window.cifradorDesktop?.isDesktop),
            window.cifradorDesktop?.ai?.request('status', {})
          ]).then(([desktop, ai]) => ({
            desktop,
            ai,
            title: document.title,
            heading: document.querySelector('h1')?.textContent
          }))`,
          awaitPromise: true,
          returnByValue: true,
        },
      }));
    });
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) return;
      clearTimeout(timeout);
      socket.close();
      if (message.result?.exceptionDetails) reject(new Error('A ponte desktop lançou uma exceção.'));
      else resolve(message.result?.result?.value);
    });
    socket.addEventListener('error', () => reject(new Error('Falha ao conectar à interface.')));
  });
}

try {
  const target = await findTarget();
  const result = await evaluate(target.webSocketDebuggerUrl);
  if (result?.desktop !== true || result?.ai?.ok !== true || !result?.heading) {
    throw new Error(`Resultado inválido: ${JSON.stringify(result)}`);
  }
  console.log(JSON.stringify(result, null, 2));
} finally {
  child.kill();
}
