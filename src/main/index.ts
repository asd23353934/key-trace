import { app, BrowserWindow, shell } from 'electron';
import { createIPCHandler } from 'electron-trpc/main';
import { join } from 'node:path';
import { createRouter } from './router';
import { startStorage, type Storage } from './storage';
import { createTracker, type Tracker } from './tracker';

let storage: Storage | null = null;
let tracker: Tracker | null = null;
let mainWindow: BrowserWindow | null = null;

const ALLOWED_EXTERNAL_SCHEMES = new Set(['https:', 'http:', 'mailto:']);

function isAllowedExternalUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    return ALLOWED_EXTERNAL_SCHEMES.has(u.protocol);
  } catch {
    return false;
  }
}

function isAllowedRendererUrl(rawUrl: string): boolean {
  // dev：electron-vite renderer 走 http://localhost:<port>；prod：file:// 載入打包後 index.html。
  try {
    const u = new URL(rawUrl);
    if (u.protocol === 'file:') return true;
    const devUrl = process.env['ELECTRON_RENDERER_URL'];
    if (devUrl) {
      const dev = new URL(devUrl);
      return u.origin === dev.origin;
    }
    return false;
  } catch {
    return false;
  }
}

function focusMainWindow(): void {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

function createWindow(): void {
  if (!tracker || !storage) {
    throw new Error('createWindow called before storage / tracker ready');
  }
  mainWindow = new BrowserWindow({
    width: 960,
    height: 720,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  createIPCHandler({
    router: createRouter(tracker, storage),
    windows: [mainWindow],
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    if (!isAllowedRendererUrl(navigationUrl)) {
      event.preventDefault();
    }
  });
  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', focusMainWindow);

  void app.whenReady().then(async () => {
    storage = await startStorage();
    tracker = createTracker({}, storage);
    tracker.start();

    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    tracker?.stop();
    storage?.stop();
  });
  // before-quit 在某些路徑（強制終止 / 系統登出）不會觸發，will-quit 是雙保險
  app.on('will-quit', () => {
    tracker?.stop();
    storage?.stop();
  });
}
