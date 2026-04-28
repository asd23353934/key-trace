/**
 * main 端 storage 橋：spawn utility process、維護 requestId → resolver 的 RPC、
 * 對 main 內部其他模組（tracker / router）暴露 flushBucket / queryTotalToday。
 */

import { app, utilityProcess, type UtilityProcess } from 'electron';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type {
  BucketPayload,
  MainToUtilityMessage,
  TotalsRow,
  UtilityToMainMessage,
} from '../shared/storage-protocol';

export type Storage = {
  flushBucket: (payload: BucketPayload) => void;
  queryTotalToday: () => Promise<TotalsRow>;
  stop: () => void;
};

const RPC_TIMEOUT_MS = 5000;

type PendingResolver = {
  resolve: (value: TotalsRow) => void;
  reject: (reason: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export async function startStorage(): Promise<Storage> {
  const dbPath = join(app.getPath('userData'), 'key-trace.db');
  const utilityModulePath = join(__dirname, 'utility.js');

  const child: UtilityProcess = utilityProcess.fork(utilityModulePath, [], {
    serviceName: 'key-trace-storage',
    env: { ...process.env, KEYTRACE_DB_PATH: dbPath },
  });

  const pending = new Map<string, PendingResolver>();

  await new Promise<void>((resolve, reject) => {
    const onReady = (msg: UtilityToMainMessage) => {
      if (msg.type === 'ready') {
        child.off('message', onReady);
        resolve();
      }
    };
    child.on('message', onReady);
    child.once('exit', (code) => {
      reject(new Error(`utility exited before ready (code=${code})`));
    });
  });

  child.on('message', (msg: UtilityToMainMessage) => {
    if (msg.type === 'queryTotalTodayResult') {
      const p = pending.get(msg.requestId);
      if (!p) return;
      pending.delete(msg.requestId);
      clearTimeout(p.timeout);
      p.resolve(msg.payload);
      return;
    }
    if (msg.type === 'error') {
      const p = pending.get(msg.requestId);
      if (!p) return;
      pending.delete(msg.requestId);
      clearTimeout(p.timeout);
      p.reject(new Error(msg.payload.message));
    }
  });

  function send(msg: MainToUtilityMessage): void {
    child.postMessage(msg);
  }

  function flushBucket(payload: BucketPayload): void {
    send({ type: 'bucket', payload });
  }

  function queryTotalToday(): Promise<TotalsRow> {
    const requestId = randomUUID();
    return new Promise<TotalsRow>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error('queryTotalToday timed out'));
      }, RPC_TIMEOUT_MS);
      pending.set(requestId, { resolve, reject, timeout });
      send({ type: 'queryTotalToday', requestId });
    });
  }

  function stop(): void {
    for (const p of pending.values()) {
      clearTimeout(p.timeout);
      p.reject(new Error('storage stopped'));
    }
    pending.clear();
    child.kill();
  }

  return { flushBucket, queryTotalToday, stop };
}
