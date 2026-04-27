const { app, BrowserWindow, dialog } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const waitOn = require('wait-on');

const APP_NAME = 'SafeSight';
const APP_ID = 'com.safesight.desktop';
const FRONTEND_URL = 'http://127.0.0.1:5173';
const FRONTEND_READY_RESOURCE = 'http-get://127.0.0.1:5173';
const BACKEND_HOST = '127.0.0.1';
const BACKEND_PORT = 8000;
const BACKEND_READY_RESOURCE = `http-get://${BACKEND_HOST}:${BACKEND_PORT}/docs`;
const STARTUP_TIMEOUT_MS = 60000;

let backendProcess = null;
let frontendProcess = null;
let mainWindow = null;
let isShuttingDown = false;

function getBackendDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'backend');
  }

  return path.join(path.resolve(__dirname, '..', '..'), 'backend');
}

function getFrontendDir() {
  return path.resolve(__dirname, '..');
}

function getPackagedIndexFile() {
  return path.join(__dirname, '..', 'dist', 'index.html');
}

function getAppIconPath() {
  if (app.isPackaged) {
    return path.join(__dirname, '..', 'dist', 'safesight_logo_all_white.png');
  }

  return path.join(getFrontendDir(), 'public', 'safesight_logo_all_white.png');
}

function toText(value) {
  return String(value || '').trim();
}

function pipeLogs(child, label) {
  child.stdout.on('data', (chunk) => {
    const text = toText(chunk.toString());
    if (text) {
      process.stdout.write(`[${label}] ${text}\n`);
    }
  });

  child.stderr.on('data', (chunk) => {
    const text = toText(chunk.toString());
    if (text) {
      process.stderr.write(`[${label}] ${text}\n`);
    }
  });
}

async function waitForResource(resource, timeout = STARTUP_TIMEOUT_MS) {
  await waitOn({
    resources: [resource],
    timeout,
    interval: 300,
    window: 1000,
    tcpTimeout: 1000,
  });
}

async function isServiceRunning(resource) {
  try {
    await waitForResource(resource, 1200);
    return true;
  } catch {
    return false;
  }
}

function startBackend() {
  const backendDir = getBackendDir();
  const pythonExe = path.join(backendDir, '.venv', 'Scripts', 'python.exe');

  if (!fs.existsSync(pythonExe)) {
    throw new Error(`Backend runtime was not found at ${pythonExe}. Run install.bat first.`);
  }

  const backendArgs = [
    '-m',
    'uvicorn',
    'main:app',
    '--host',
    BACKEND_HOST,
    '--port',
    String(BACKEND_PORT),
  ];

  backendProcess = spawn(pythonExe, backendArgs, {
    cwd: backendDir,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  pipeLogs(backendProcess, 'backend');

  backendProcess.on('exit', (code) => {
    if (!isShuttingDown) {
      process.stderr.write(`[backend] exited with code ${code}\n`);
    }
    backendProcess = null;
  });
}

function startFrontend() {
  const frontendDir = getFrontendDir();
  const isWindows = process.platform === 'win32';
  const frontendCommand = isWindows ? 'cmd.exe' : 'npm';
  const frontendArgs = isWindows
    ? ['/d', '/s', '/c', 'npm run dev -- --host 127.0.0.1 --port 5173 --strictPort']
    : [
        'run',
        'dev',
        '--',
        '--host',
        '127.0.0.1',
        '--port',
        '5173',
        '--strictPort',
      ];

  frontendProcess = spawn(frontendCommand, frontendArgs, {
    cwd: frontendDir,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  pipeLogs(frontendProcess, 'frontend');

  frontendProcess.on('exit', (code) => {
    if (!isShuttingDown) {
      process.stderr.write(`[frontend] exited with code ${code}\n`);
    }
    frontendProcess = null;
  });
}

async function ensureBackendReady() {
  if (await isServiceRunning(BACKEND_READY_RESOURCE)) {
    return;
  }

  startBackend();
  await waitForResource(BACKEND_READY_RESOURCE);
}

async function ensureFrontendReady() {
  if (await isServiceRunning(FRONTEND_READY_RESOURCE)) {
    return;
  }

  startFrontend();
  await waitForResource(FRONTEND_READY_RESOURCE);
}

function createMainWindow() {
  const iconPath = getAppIconPath();

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 680,
    title: APP_NAME,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    if (mainWindow) {
      mainWindow.show();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function killChildProcess(child) {
  return new Promise((resolve) => {
    if (!child || !child.pid) {
      resolve();
      return;
    }

    if (process.platform === 'win32') {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });

      killer.on('exit', () => resolve());
      killer.on('error', () => resolve());
      return;
    }

    child.kill('SIGTERM');
    resolve();
  });
}

async function shutdownServices() {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  await Promise.all([killChildProcess(frontendProcess), killChildProcess(backendProcess)]);
  frontendProcess = null;
  backendProcess = null;
}

async function bootstrap() {
  await ensureBackendReady();
  createMainWindow();

  if (app.isPackaged) {
    const indexFile = getPackagedIndexFile();
    if (!fs.existsSync(indexFile)) {
      throw new Error(`Built frontend was not found at ${indexFile}. Run npm run build before packaging.`);
    }
    await mainWindow.loadFile(indexFile);
    return;
  }

  await ensureFrontendReady();
  await mainWindow.loadURL(FRONTEND_URL);
}

async function showStartupError(error) {
  const message = error instanceof Error ? error.message : String(error);
  await dialog.showMessageBox({
    type: 'error',
    title: `${APP_NAME} Desktop`,
    message: `${APP_NAME} could not start.`,
    detail: message,
  });
}

app.whenReady().then(async () => {
  app.setName(APP_NAME);
  app.setAppUserModelId(APP_ID);

  try {
    await bootstrap();
  } catch (error) {
    process.stderr.write(`${String(error)}\n`);
    await showStartupError(error);
    await shutdownServices();
    app.quit();
  }
});

app.on('before-quit', () => {
  void shutdownServices();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    try {
      await bootstrap();
    } catch (error) {
      process.stderr.write(`${String(error)}\n`);
      await showStartupError(error);
      app.quit();
    }
  }
});
