import { app, BrowserWindow, ipcMain, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeOllamaAction, getOllamaStatus } from '../api/ollama.js';

const desktopDirectory = path.dirname(fileURLToPath(import.meta.url));
let mainWindow;
let store = {};
let storeFile = '';

function readEnvFile(file) {
  try {
    const entries = {};
    for (const rawLine of fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const separator = line.indexOf('=');
      if (separator < 1) continue;
      const key = line.slice(0, separator).trim();
      let value = line.slice(separator + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      entries[key] = value;
    }
    return entries;
  } catch {
    return {};
  }
}

function getOllamaEnv() {
  const envPath = app.isPackaged
    ? path.join(path.dirname(app.getPath('exe')), '.env')
    : path.join(process.cwd(), '.env');
  const fileEnv = readEnvFile(envPath);
  return {
    OLLAMA_API_KEY: process.env.OLLAMA_API_KEY ?? fileEnv.OLLAMA_API_KEY ?? '',
    OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL ?? fileEnv.OLLAMA_BASE_URL ?? '',
    OLLAMA_MODEL: process.env.OLLAMA_MODEL ?? fileEnv.OLLAMA_MODEL ?? '',
  };
}

function loadStore() {
  storeFile = path.join(app.getPath('userData'), 'dados.json');
  try {
    const parsed = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
    store = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    store = {};
  }
}

function saveStore() {
  fs.mkdirSync(path.dirname(storeFile), { recursive: true });
  fs.writeFileSync(storeFile, JSON.stringify(store, null, 2), 'utf8');
}

function registerIpc() {
  ipcMain.on('storage:get', (event, key) => {
    event.returnValue = typeof key === 'string' && Object.hasOwn(store, key) ? store[key] : null;
  });

  ipcMain.on('storage:set', (event, key, value) => {
    try {
      if (typeof key !== 'string' || key.length > 200 || typeof value !== 'string') {
        throw new Error('Dados locais inválidos.');
      }
      store[key] = value;
      saveStore();
      event.returnValue = true;
    } catch {
      event.returnValue = false;
    }
  });

  ipcMain.handle('ai:request', async (_event, action, body) => {
    try {
      const payload = action === 'status'
        ? getOllamaStatus(getOllamaEnv())
        : await executeOllamaAction(getOllamaEnv(), action, body);
      return { ok: true, payload };
    } catch (error) {
      return {
        ok: false,
        status: Number(error.status) || 500,
        error: error.message || 'Falha ao consultar o Ollama.',
      };
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'Cifrador',
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 680,
    show: false,
    backgroundColor: '#151a17',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(desktopDirectory, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) event.preventDefault();
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.loadFile(path.join(desktopDirectory, '..', 'dist', 'index.html'));
}

app.whenReady().then(() => {
  loadStore();
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
