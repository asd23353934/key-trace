import { app, utilityProcess, type UtilityProcess } from 'electron';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type {
  BucketPayload,
  MainToUtilityMessage,
  TodayTotals,
  UtilityToMainMessage,
} from '../shared/storage-protocol';

export type Storage = {
  flushBucket: (payload: BucketPayload) => void;
  queryTotalToday: () => Promise<TodayTotals>;
  stop: () => void;
};

const RPC_TIMEOUT_MS = 5000;

type PendingResolver = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export async function startStorage(): Promise<Storage> {
  const dbPath = join(app.getPath('userData'), 'key-trace.db');
  // utility entry 由 electron-vite 的 main rollupOptions.input 一起 build 到 out/main/，
  // 與本檔的 out/main/index.js 同目錄。重構時不要把 src/utility 移出此 build group。
  const utilityModulePath = join(__dirname, 'utility.js');

  const child: UtilityProcess = utilityProcess.fork(utilityModulePath, [], {
    serviceName: 'key-trace-storage',
    env: { ...process.env, KEYTRACE_DB_PATH: dbPath },
  });

  const pending = new Map<string, PendingResolver>();
  let alive = false;

  await new Promise<void>((resolve, reject) => {
    const onReady = (msg: UtilityToMainMessage) => {
      if (msg.type === 'ready') {
        child.off('message', onReady);
        alive = true;
        resolve();
      }
    };
    child.on('message', onReady);
    child.once('exit', (code) => {
      if (!alive) reject(new Error(`utility exited before ready (code=${code})`));
    });
  });

  child.on('exit', (code) => {
    alive = false;
    console.error(`[storage] utility exited unexpectedly (code=${code})`);
    for (const p of pending.values()) {
      clearTimeout(p.timeout);
      p.reject(new Error(`utility exited (code=${code})`));
    }
    pending.clear();
  });

  function settlePending(requestId: string, value: unknown): void {
    const p = pending.get(requestId);
    if (!p) return;
    pending.delete(requestId);
    clearTimeout(p.timeout);
    p.resolve(value);
  }

  function rejectPending(requestId: string, err: Error): void {
    const p = pending.get(requestId);
    if (!p) return;
    pending.delete(requestId);
    clearTimeout(p.timeout);
    p.reject(err);
  }

  child.on('message', (msg: UtilityToMainMessage) => {
    if (msg.type === 'queryTotalTodayResult') {
      settlePending(msg.requestId, msg.payload);
      return;
    }
    if (msg.type === 'error') {
      rejectPending(msg.requestId, new Error(msg.payload.message));
    }
  });

  function send(msg: MainToUtilityMessage): void {
    child.postMessage(msg);
  }

  function rpcQuery<T>(
    makeMessage: (requestId: string) => MainToUtilityMessage,
  ): Promise<T> {
    if (!alive) return Promise.reject(new Error('storage: utility process is dead'));
    const requestId = randomUUID();
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error('rpc query timed out'));
      }, RPC_TIMEOUT_MS);
      pending.set(requestId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout,
      });
      send(makeMessage(requestId));
    });
  }

  function flushBucket(payload: BucketPayload): void {
    if (!alive) return;
    send({ type: 'bucket', payload });
  }

  function queryTotalToday(): Promise<TodayTotals> {
    return rpcQuery<TodayTotals>((requestId) => ({
      type: 'queryTotalToday',
      requestId,
    }));
  }

  function stop(): void {
    for (const p of pending.values()) {
      clearTimeout(p.timeout);
      p.reject(new Error('storage stopped'));
    }
    pending.clear();
    if (alive) {
      alive = false;
      child.kill();
    }
  }

  return {
    flushBucket,
    queryTotalToday,
    stop,
  };
}
