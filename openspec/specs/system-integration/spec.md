# system-integration Specification

## Purpose

TBD - created by archiving change 'add-system-integration'. Update Purpose after archive.

## Requirements

### Requirement: Tray Icon

The system SHALL display a persistent tray icon (Windows notification area / macOS status bar) for the entire lifetime of the application process. The tray icon SHALL exist regardless of whether the main window is shown, hidden, or never created.

#### Scenario: Tray icon appears on application start

- **WHEN** the application reaches the `whenReady` event
- **THEN** the system SHALL create a single `Tray` instance and the icon SHALL be visible in the tray area until application quit

#### Scenario: Tray icon left-click toggles main window visibility

- **WHEN** the user left-clicks the tray icon while the main window is hidden
- **THEN** the system SHALL show and focus the main window

#### Scenario: Tray icon left-click hides visible main window

- **WHEN** the user left-clicks the tray icon while the main window is visible
- **THEN** the system SHALL hide the main window

#### Scenario: Tray icon right-click shows context menu

- **WHEN** the user right-clicks the tray icon
- **THEN** the system SHALL display a context menu with at least the following items: open dashboard, auto-launch toggle, global shortcut toggle, quit


<!-- @trace
source: add-system-integration
updated: 2026-04-29
code:
  - assets/tray-icon.png
  - scripts/e2e-check.mjs
  - src/main/index.ts
  - package.json
  - src/main/settings-store.ts
  - src/main/system-integration.ts
  - src/main/router.ts
  - scripts/generate-tray-icon.mjs
-->

---
### Requirement: Background Mode (Close to Tray)

The system SHALL prevent the application from quitting when the user closes the main window, instead hiding the window and keeping the application running in the background. The application SHALL only quit through the explicit quit action in the tray context menu.

#### Scenario: Closing the main window hides instead of quits

- **WHEN** the user clicks the close button on the main window
- **THEN** the system SHALL prevent the close, hide the main window, and the application SHALL continue running with the tracker collecting events

#### Scenario: Tray quit menu item exits the application

- **WHEN** the user clicks the quit item in the tray context menu
- **THEN** the system SHALL set an internal "quitting" flag, allow window close to proceed, run all `before-quit` and `will-quit` cleanup, and exit

#### Scenario: First close emits a notification

- **WHEN** the user closes the main window for the first time after application start
- **THEN** the system SHALL emit a balloon / desktop notification informing the user that the application is now in the tray


<!-- @trace
source: add-system-integration
updated: 2026-04-29
code:
  - assets/tray-icon.png
  - scripts/e2e-check.mjs
  - src/main/index.ts
  - package.json
  - src/main/settings-store.ts
  - src/main/system-integration.ts
  - src/main/router.ts
  - scripts/generate-tray-icon.mjs
-->

---
### Requirement: Auto-Launch on System Boot

The system SHALL allow the user to enable or disable launching the application automatically when the operating system boots. The default value SHALL be disabled. When enabled, the application SHALL start hidden (no main window) so the user can begin tracking without interruption.

#### Scenario: Default is disabled

- **WHEN** the application starts on a fresh installation with no prior settings
- **THEN** auto-launch SHALL be disabled and `app.getLoginItemSettings().openAtLogin` SHALL be false

#### Scenario: Enabling auto-launch persists to OS and settings file

- **WHEN** the user toggles auto-launch on via the tray menu
- **THEN** the system SHALL call `app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true })` and persist `autoLaunchEnabled = true` in the settings file

#### Scenario: Disabling auto-launch clears OS setting

- **WHEN** the user toggles auto-launch off via the tray menu
- **THEN** the system SHALL call `app.setLoginItemSettings({ openAtLogin: false })` and persist `autoLaunchEnabled = false`

#### Scenario: Tray menu reflects OS-level state

- **WHEN** the user opens the tray context menu
- **THEN** the auto-launch checkbox state SHALL reflect the current `app.getLoginItemSettings().openAtLogin` value, not solely the persisted settings file


<!-- @trace
source: add-system-integration
updated: 2026-04-29
code:
  - assets/tray-icon.png
  - scripts/e2e-check.mjs
  - src/main/index.ts
  - package.json
  - src/main/settings-store.ts
  - src/main/system-integration.ts
  - src/main/router.ts
  - scripts/generate-tray-icon.mjs
-->

---
### Requirement: Background Boot

When auto-launch is enabled, the system SHALL start the application without showing the main window. The tracker SHALL begin collecting events immediately. The user SHALL access the dashboard via tray icon click or global shortcut.

#### Scenario: Auto-launched app does not show main window

- **WHEN** the operating system boots with auto-launch enabled and the application is launched by the OS
- **THEN** the system SHALL not show the main window automatically; the tray icon SHALL be visible; the tracker SHALL be running


<!-- @trace
source: add-system-integration
updated: 2026-04-29
code:
  - assets/tray-icon.png
  - scripts/e2e-check.mjs
  - src/main/index.ts
  - package.json
  - src/main/settings-store.ts
  - src/main/system-integration.ts
  - src/main/router.ts
  - scripts/generate-tray-icon.mjs
-->

---
### Requirement: Global Shortcut

The system SHALL register a global keyboard shortcut, default `CommandOrControl+Shift+K`, that toggles main window visibility from anywhere in the operating system. The user SHALL be able to enable or disable this shortcut via the tray menu. Default SHALL be enabled.

#### Scenario: Default shortcut is registered on launch

- **WHEN** the application starts with `globalShortcutEnabled = true`
- **THEN** the system SHALL call `globalShortcut.register('CommandOrControl+Shift+K', ...)` and the handler SHALL toggle main window visibility

#### Scenario: Pressing the shortcut toggles main window

- **WHEN** the global shortcut is registered and the user presses `CommandOrControl+Shift+K` while any application has focus
- **THEN** the system SHALL show the main window if hidden, or hide it if visible

#### Scenario: Disabling the shortcut unregisters it

- **WHEN** the user toggles the shortcut off via the tray menu
- **THEN** the system SHALL call `globalShortcut.unregister('CommandOrControl+Shift+K')` and the shortcut SHALL no longer trigger

#### Scenario: Registration failure is logged but does not crash

- **WHEN** another application has already claimed `CommandOrControl+Shift+K` and `globalShortcut.register` returns false
- **THEN** the system SHALL log a warning and persist `globalShortcutEnabled = true` in the settings file; no error SHALL be thrown to the user


<!-- @trace
source: add-system-integration
updated: 2026-04-29
code:
  - assets/tray-icon.png
  - scripts/e2e-check.mjs
  - src/main/index.ts
  - package.json
  - src/main/settings-store.ts
  - src/main/system-integration.ts
  - src/main/router.ts
  - scripts/generate-tray-icon.mjs
-->

---
### Requirement: Settings Persistence

The system SHALL persist the user's preferences for auto-launch and global shortcut in a JSON file under the application user-data directory. Settings SHALL be read on every application start and applied to OS state and shortcut registration.

#### Scenario: Settings file path

- **WHEN** the system needs to persist or read settings
- **THEN** the system SHALL use the file `system-integration-settings.json` under `app.getPath('userData')`

#### Scenario: Default values when file is absent or invalid

- **WHEN** the settings file is absent or its content fails JSON parse / validation
- **THEN** the system SHALL use defaults `{ autoLaunchEnabled: false, globalShortcutEnabled: true }` and continue starting

#### Scenario: Settings applied at startup

- **WHEN** the application reaches `whenReady`
- **THEN** the system SHALL read the settings file and SHALL call `app.setLoginItemSettings` with the persisted `openAtLogin` value AND register or skip the global shortcut according to `globalShortcutEnabled`


<!-- @trace
source: add-system-integration
updated: 2026-04-29
code:
  - assets/tray-icon.png
  - scripts/e2e-check.mjs
  - src/main/index.ts
  - package.json
  - src/main/settings-store.ts
  - src/main/system-integration.ts
  - src/main/router.ts
  - scripts/generate-tray-icon.mjs
-->

---
### Requirement: tRPC API Surface

The system SHALL expose a `system` namespace via the existing tRPC router with `getSettings` query and `updateSettings` mutation, allowing future renderer settings UI to drive the same state that the tray menu drives.

#### Scenario: getSettings returns current values

- **WHEN** the renderer queries `system.getSettings`
- **THEN** the system SHALL return `{ autoLaunchEnabled: boolean, globalShortcutEnabled: boolean }` reflecting the current persisted state and OS reconciliation

#### Scenario: updateSettings applies and persists

- **WHEN** the renderer calls `system.updateSettings` with a valid input
- **THEN** the system SHALL apply the new values (call `setLoginItemSettings` and register / unregister the global shortcut as needed) and persist the new values to the settings file

#### Scenario: updateSettings rejects invalid input

- **WHEN** the renderer calls `system.updateSettings` with input that fails the validation schema
- **THEN** the system SHALL throw a `TRPCError` with code `BAD_REQUEST` and SHALL not modify any state

<!-- @trace
source: add-system-integration
updated: 2026-04-29
code:
  - assets/tray-icon.png
  - scripts/e2e-check.mjs
  - src/main/index.ts
  - package.json
  - src/main/settings-store.ts
  - src/main/system-integration.ts
  - src/main/router.ts
  - scripts/generate-tray-icon.mjs
-->