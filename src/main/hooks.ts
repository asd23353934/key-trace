/**
 * 鍵鼠 hook 隱私 wrapper。本檔是 src/main 內 **唯一** 可 import `uiohook-napi` 的位置。
 *
 * 隱私不變式（PR review 必檢，違反即擋）：
 *   1. 永不從 keyboard event 讀 `keychar` / `keyChar`（按鍵內容）
 *   2. 永不把 raw event 物件 leak 給呼叫端；只回傳次數信號或座標差
 *   3. 鍵盤對外只給 `keycode`（heatmap 統計用），不給字元
 *
 * 加新 hook 時開新 helper，簽章寫死成回呼最小集合，不要 leak event。
 */

import { uIOhook } from 'uiohook-napi';

export type MouseDelta = { dx: number; dy: number };

export type HookHandlers = {
  onKey?: (keycode: number) => void;
  onMouseClick?: () => void;
  onMouseMove?: (delta: MouseDelta) => void;
  onWheel?: () => void;
};

let started = false;

export function startHooks(handlers: HookHandlers): void {
  if (started) return;
  started = true;

  let lastMouse: { x: number; y: number } | null = null;

  if (handlers.onKey) {
    const onKey = handlers.onKey;
    uIOhook.on('keydown', (e) => {
      onKey(e.keycode);
    });
  }
  if (handlers.onMouseClick) {
    const onMouseClick = handlers.onMouseClick;
    uIOhook.on('mousedown', () => {
      onMouseClick();
    });
  }
  if (handlers.onMouseMove) {
    const onMouseMove = handlers.onMouseMove;
    uIOhook.on('mousemove', (e) => {
      if (lastMouse) {
        onMouseMove({ dx: e.x - lastMouse.x, dy: e.y - lastMouse.y });
      }
      lastMouse = { x: e.x, y: e.y };
    });
  }
  if (handlers.onWheel) {
    const onWheel = handlers.onWheel;
    uIOhook.on('wheel', () => {
      onWheel();
    });
  }

  uIOhook.start();
}

export function stopHooks(): void {
  if (!started) return;
  started = false;
  uIOhook.removeAllListeners();
  uIOhook.stop();
}
