import { _electron as electron } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

const app = await electron.launch({
  args: [projectRoot, '--bypass-single-instance'],
  cwd: projectRoot,
});

const consoleMessages = [];
app.on('window', (win) => {
  win.on('console', (msg) => {
    consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
  });
  win.on('pageerror', (err) => {
    consoleMessages.push(`[pageerror] ${err.message}`);
  });
});

const window = await app.firstWindow();
window.on('console', (msg) => consoleMessages.push(`[${msg.type()}] ${msg.text()}`));
window.on('pageerror', (err) => consoleMessages.push(`[pageerror] ${err.message}`));

await window.waitForLoadState('domcontentloaded');

// 等卡片渲染（dashboard 至少 6 個 rounded-lg 卡片）— 比寫死 setTimeout 穩
await window.waitForFunction(
  () => document.querySelectorAll('[class*="rounded-lg"]').length >= 6,
  { timeout: 10000 },
);

const screenshotPath = resolve(projectRoot, 'tmp-e2e-screenshot.png');
await window.screenshot({ path: screenshotPath });

const state = await window.evaluate(() => ({
  title: document.title,
  text: document.body.innerText,
  rootChildren: document.getElementById('root')?.children.length ?? -1,
  hasElectronTRPC: typeof window.electronTRPC,
  electronTRPCKeys:
    window.electronTRPC && typeof window.electronTRPC === 'object'
      ? Object.keys(window.electronTRPC)
      : null,
  cardTexts: Array.from(document.querySelectorAll('[class*="rounded-lg"]')).map(
    (el) => el.textContent?.replace(/\s+/g, ' ').trim(),
  ),
}));

console.log('STATE:');
console.log(JSON.stringify(state, null, 2));

// Try direct electronTRPC calls covering all current namespaces
const ipcTest = await window.evaluate(async () => {
  const received = [];
  const cleanup = window.electronTRPC.onMessage((msg) => {
    received.push(msg);
  });
  for (const op of [
    { id: 1, type: 'query', path: 'tracker.stats' },
    { id: 2, type: 'query', path: 'historical.totalToday' },
    { id: 3, type: 'query', path: 'system.getSettings' },
  ]) {
    window.electronTRPC.sendMessage({
      method: 'request',
      operation: { ...op, input: undefined },
    });
  }
  await new Promise((r) => setTimeout(r, 1500));
  if (typeof cleanup === 'function') cleanup();
  return { received };
});
console.log('\nDIRECT IPC TEST:');
console.log(JSON.stringify(ipcTest, null, 2));
console.log('\nCONSOLE:');
for (const m of consoleMessages) console.log(' ', m);
console.log('\nScreenshot saved to:', screenshotPath);

await app.close();
