import {
  app,
  globalShortcut,
  Menu,
  nativeImage,
  Tray,
  type BrowserWindow,
} from 'electron';
import { join } from 'node:path';
import type { SettingsStore } from './settings-store';

export type SystemIntegrationSettings = {
  autoLaunchEnabled: boolean;
  globalShortcutEnabled: boolean;
};

export const DEFAULT_SYSTEM_INTEGRATION_SETTINGS: SystemIntegrationSettings = {
  autoLaunchEnabled: false,
  globalShortcutEnabled: true,
};

export function validateSystemIntegrationSettings(
  raw: unknown,
): SystemIntegrationSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    autoLaunchEnabled:
      typeof r['autoLaunchEnabled'] === 'boolean'
        ? r['autoLaunchEnabled']
        : DEFAULT_SYSTEM_INTEGRATION_SETTINGS.autoLaunchEnabled,
    globalShortcutEnabled:
      typeof r['globalShortcutEnabled'] === 'boolean'
        ? r['globalShortcutEnabled']
        : DEFAULT_SYSTEM_INTEGRATION_SETTINGS.globalShortcutEnabled,
  };
}

const GLOBAL_SHORTCUT_ACCELERATOR = 'CommandOrControl+Shift+K';
const STARTUP_ARG = '--launched-at-startup';

export type SystemIntegrationDeps = {
  getMainWindow: () => BrowserWindow | null;
  settingsStore: SettingsStore<SystemIntegrationSettings>;
};

export type SystemIntegration = {
  start: () => void;
  destroy: () => void;
  isQuitting: () => boolean;
  quit: () => void;
  getSettings: () => SystemIntegrationSettings;
  updateSettings: (s: SystemIntegrationSettings) => SystemIntegrationSettings;
  wasLaunchedAtStartup: () => boolean;
  toggleMainWindow: () => void;
};

export function createSystemIntegration(
  deps: SystemIntegrationDeps,
): SystemIntegration {
  let tray: Tray | null = null;
  let isQuittingFlag = false;

  function applyAutoLaunch(enabled: boolean): void {
    if (process.platform === 'darwin') {
      app.setLoginItemSettings(
        enabled ? { openAtLogin: true, openAsHidden: true } : { openAtLogin: false },
      );
    } else {
      app.setLoginItemSettings({
        openAtLogin: enabled,
        args: enabled ? [STARTUP_ARG] : [],
      });
    }
  }

  function applyGlobalShortcut(enabled: boolean): void {
    if (enabled) {
      const ok = globalShortcut.register(GLOBAL_SHORTCUT_ACCELERATOR, toggleMainWindow);
      if (!ok) {
        console.warn(
          `[system] global shortcut ${GLOBAL_SHORTCUT_ACCELERATOR} register failed (likely conflict with another app)`,
        );
      }
    } else {
      globalShortcut.unregister(GLOBAL_SHORTCUT_ACCELERATOR);
    }
  }

  function toggleMainWindow(): void {
    const win = deps.getMainWindow();
    if (!win) return;
    if (win.isVisible() && win.isFocused()) {
      win.hide();
    } else {
      if (!win.isVisible()) win.show();
      win.focus();
    }
  }

  function showMainWindow(): void {
    const win = deps.getMainWindow();
    if (!win) return;
    if (!win.isVisible()) win.show();
    win.focus();
  }

  function buildContextMenu(): Menu {
    // 即時讀盤而非用閉包 snapshot — 防 OS state（auto-launch）與 store state（global shortcut）漂移
    const stored = deps.settingsStore.get();
    const osAutoLaunch = app.getLoginItemSettings().openAtLogin;
    return Menu.buildFromTemplate([
      { label: '顯示 dashboard', click: showMainWindow },
      { type: 'separator' },
      {
        label: '開機自啟',
        type: 'checkbox',
        checked: osAutoLaunch,
        click: () => {
          const fresh = deps.settingsStore.get();
          updateSettings({
            ...fresh,
            autoLaunchEnabled: !app.getLoginItemSettings().openAtLogin,
          });
        },
      },
      {
        label: `全域熱鍵 (${GLOBAL_SHORTCUT_ACCELERATOR})`,
        type: 'checkbox',
        checked: stored.globalShortcutEnabled,
        click: () => {
          const fresh = deps.settingsStore.get();
          updateSettings({
            ...fresh,
            globalShortcutEnabled: !fresh.globalShortcutEnabled,
          });
        },
      },
      { type: 'separator' },
      { label: '結束', click: quit },
    ]);
  }

  function refreshContextMenu(): void {
    if (tray) tray.setContextMenu(buildContextMenu());
  }

  function createTray(): void {
    const iconPath = join(app.getAppPath(), 'assets', 'tray-icon.png');
    const icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) {
      console.warn(`[system] tray icon empty (path=${iconPath}); using fallback`);
    }
    try {
      tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
    } catch (err) {
      console.error('[system] failed to create Tray:', err);
      return;
    }
    tray.setToolTip('key-trace');
    tray.on('click', toggleMainWindow);
    // setContextMenu 跨 Win + macOS 都可：右鍵 / icon click 系統各自正確處理
    tray.setContextMenu(buildContextMenu());
    // Win 仍接 right-click 即時重建選單，反映 OS state（macOS 上此事件不觸發，依賴 setContextMenu 預設）
    tray.on('right-click', () => {
      tray?.setContextMenu(buildContextMenu());
    });
  }

  function start(): void {
    const settings = deps.settingsStore.get();
    applyAutoLaunch(settings.autoLaunchEnabled);
    applyGlobalShortcut(settings.globalShortcutEnabled);
    createTray();
  }

  function getSettings(): SystemIntegrationSettings {
    const stored = deps.settingsStore.get();
    return {
      // OS 為 auto-launch source of truth；renderer 看到的是真實狀態
      autoLaunchEnabled: app.getLoginItemSettings().openAtLogin,
      globalShortcutEnabled: stored.globalShortcutEnabled,
    };
  }

  function updateSettings(s: SystemIntegrationSettings): SystemIntegrationSettings {
    const validated = validateSystemIntegrationSettings(s);
    deps.settingsStore.set(validated);
    applyAutoLaunch(validated.autoLaunchEnabled);
    applyGlobalShortcut(validated.globalShortcutEnabled);
    refreshContextMenu();
    return getSettings();
  }

  function quit(): void {
    isQuittingFlag = true;
    app.quit();
  }

  function wasLaunchedAtStartup(): boolean {
    if (process.platform === 'darwin') {
      return Boolean(app.getLoginItemSettings().wasOpenedAsHidden);
    }
    return process.argv.includes(STARTUP_ARG);
  }

  function destroy(): void {
    globalShortcut.unregisterAll();
    if (tray) {
      tray.destroy();
      tray = null;
    }
  }

  return {
    start,
    destroy,
    isQuitting: () => isQuittingFlag,
    quit,
    getSettings,
    updateSettings,
    wasLaunchedAtStartup,
    toggleMainWindow,
  };
}
