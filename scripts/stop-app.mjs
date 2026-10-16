import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const args = process.argv.slice(2);
const portArg = args.find((a) => a.startsWith('--port='));
const port = Number(portArg ? portArg.split('=')[1] : process.env.PORT || 3000);
const killDesktop = args.includes('--all') || args.includes('--desktop');
const quiet = args.includes('--quiet') || args.includes('--silent');

function log(message) {
  if (!quiet) console.log(message);
}

async function pidsOnPort(targetPort) {
  if (process.platform === 'win32') {
    const { stdout } = await execFileAsync('netstat', ['-ano', '-p', 'TCP']);
    const pids = new Set();
    for (const line of stdout.split('\n')) {
      const match = line.match(new RegExp(`TCP\\s+\\S*:${targetPort}\\s+\\S+\\s+LISTENING\\s+(\\d+)`, 'i'));
      if (match) pids.add(Number(match[1]));
    }
    return [...pids].filter((pid) => pid !== process.pid);
  }
  const { stdout } = await execFileAsync('lsof', ['-ti', `tcp:${targetPort}`]);
  return stdout
    .split('\n')
    .map((line) => Number(line.trim()))
    .filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid);
}

async function killPid(pid, force = false) {
  if (process.platform === 'win32') {
    // No Windows, o taskkill gracioso (WM_CLOSE) não fecha processos de
    // console como o node — sempre usa /F.
    await execFileAsync('taskkill', ['/F', '/PID', String(pid)]);
  } else {
    process.kill(pid, force ? 'SIGKILL' : 'SIGTERM');
  }
}

async function killDesktopProcesses() {
  try {
    if (process.platform === 'win32') {
      await execFileAsync('taskkill', ['/F', '/IM', 'electron.exe']);
    } else {
      await execFileAsync('pkill', ['-f', 'electron']);
    }
    log('Processos do Electron finalizados.');
  } catch {
    log('Nenhum processo do Electron em execução.');
  }
}

export async function stopPort(targetPort = port) {
  let pids = [];
  try {
    pids = await pidsOnPort(targetPort);
  } catch (error) {
    if (!quiet) console.error(`Não foi possível listar a porta ${targetPort}: ${error.message}`);
    return [];
  }
  if (!pids.length) {
    log(`Nada rodando na porta ${targetPort}.`);
    return [];
  }
  for (const pid of pids) {
    try {
      await killPid(pid);
    } catch {
      // Processo pode já ter morrido entre a listagem e o kill.
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
  let remaining = await pidsOnPort(targetPort).catch(() => []);
  if (process.platform !== 'win32') {
    for (const pid of remaining) {
      try {
        await killPid(pid, true);
      } catch {
        // Ignora: o SO pode já ter liberado o PID.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
    remaining = await pidsOnPort(targetPort).catch(() => []);
  }
  const stopped = pids.filter((pid) => !remaining.includes(pid));
  if (stopped.length) log(`Aplicação parada (porta ${targetPort}, PID ${stopped.join(', ')}).`);
  if (remaining.length && !quiet) console.error(`A porta ${targetPort} continua ocupada (PID ${remaining.join(', ')}).`);
  return stopped;
}

const isMain = process.argv[1]?.endsWith('stop-app.mjs');
if (isMain) {
  await stopPort();
  if (killDesktop) await killDesktopProcesses();
}
