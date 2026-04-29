import { app, BrowserWindow, Notification, shell } from 'electron';
import { createIPCHandler } from 'electron-trpc/main';
import { join } from 'node:path';
import { createRouter } from './router';
import { createSettingsStore } from './settings-store';
import { startStorage, type Storage } from './storage';
import {
  createSystemIntegration,
  DEFAULT_SYSTEM_INTEGRATION_SETTINGS,
  validateSystemIntegrationSettings,
  type SystemIntegration,
} from './system-integration';
import { createTracker, type Tracker } from './tracker';

let storage: Storage | null = null;
let tracker: Tracker | null = null;
let systemIntegration: SystemIntegration | null = null;
let mainWindow: BrowserWindow | null = null;
let firstHideNotified = false;

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
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
}

function emitFirstHideNotification(): void {
  if (firstHideNotified) return;
  firstHideNotified = true;
  new Notification({
    title: 'key-trace',
    body: 'key-trace 已縮到工作列，從工作列圖示重新開啟或按下 Ctrl+Shift+K',
  }).show();
}

function createWindow(showOnReady: boolean): void {
  if (!tracker || !storage || !systemIntegration) {
    throw new Error('createWindow called before storage / tracker / systemIntegration ready');
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
    router: createRouter(tracker, storage, systemIntegration),
    windows: [mainWindow],
  });

  mainWindow.on('ready-to-show', () => {
    if (showOnReady) mainWindow?.show();
  });

  mainWindow.on('close', (event) => {
    if (systemIntegration?.isQuitting()) return;
    event.preventDefault();
    mainWindow?.hide();
    emitFirstHideNotification();
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

// Escape hatch for tests / debugging — production never passes this flag
const bypassSingleInstance = process.argv.includes('--bypass-single-instance');
const lockOk = bypassSingleInstance ? true : app.requestSingleInstanceLock();
if (!lockOk) {
  app.quit();
} else {
  app.on('second-instance', focusMainWindow);

  void app.whenReady().then(async () => {
    try {
      storage = await startStorage();
      tracker = createTracker({}, storage);
      tracker.start();

      const settingsStore = createSettingsStore(
        'system-integration-settings.json',
        DEFAULT_SYSTEM_INTEGRATION_SETTINGS,
        validateSystemIntegrationSettings,
      );
      systemIntegration = createSystemIntegration({
        getMainWindow: () => mainWindow,
        settingsStore,
      });
      systemIntegration.start();

      // 開機被 OS 喚起且 auto-launch 設定為「啟動時隱藏」→ 先建視窗但不顯示
      const showOnReady = !systemIntegration.wasLaunchedAtStartup();
      createWindow(showOnReady);

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow(true);
        else focusMainWindow();
      });
    } catch (err) {
      // 不需要 console.error — throw 後 Electron 會 unhandled rejection 印一次完整 stack
      throw err;
    }
  });

  let cleanedUp = false;
  function cleanup(): void {
    if (cleanedUp) return;
    cleanedUp = true;
    tracker?.stop();
    storage?.stop();
    systemIntegration?.destroy();
  }

  // 不再因 window-all-closed 退出 app；改由 tray 選單「結束」觸發 app.quit()
  // 唯一例外：app 啟動失敗 / 開發中斷的 fallback 不在此處理

  // before-quit 在某些路徑（強制終止 / 系統登出）不會觸發；will-quit 是雙保險。
  // cleanup() 用 cleanedUp guard 確保只跑一次。
  app.on('before-quit', cleanup);
  app.on('will-quit', cleanup);
}
