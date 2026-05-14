import { getClient, getSqlite } from "@pkg/db";
import { jobRuns, jobLocks } from "@pkg/db";
import { eq, sql } from "drizzle-orm";
import crypto from "node:crypto";

export function parentPortMessage(msg: unknown) {
  if (typeof process.send === "function") {
    process.send(msg);
  }
}

export async function createJobRun(jobName: string) {
  const db = getClient();
  const [run] = await db.insert(jobRuns).values({
    jobName,
    status: "running",
    startedAt: new Date().toISOString(),
  }).returning();
  return run;
}

export async function completeJobRun(id: number, message?: string) {
  const db = getClient();
  await db.update(jobRuns)
    .set({
      status: "success",
      finishedAt: new Date().toISOString(),
      message: message ?? "Completed",
    })
    .where(eq(jobRuns.id, id));
}

export async function failJobRun(id: number, error: string) {
  const db = getClient();
  await db.update(jobRuns)
    .set({
      status: "failed",
      finishedAt: new Date().toISOString(),
      errorJson: JSON.stringify({ message: error }),
    })
    .where(eq(jobRuns.id, id));
}

export async function updateJobProgress(id: number, current: number, total: number) {
  const db = getClient();
  await db.update(jobRuns)
    .set({ progressCurrent: current, progressTotal: total })
    .where(eq(jobRuns.id, id));
}

export async function acquireLock(jobName: string, ttlMs: number): Promise<string | null> {
  const lockId = crypto.randomUUID();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  const sqlite = getSqlite();

  const result = sqlite.prepare(`
    INSERT INTO job_locks (job_name, locked_by, locked_at, expires_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(job_name) DO UPDATE SET
      locked_by = excluded.locked_by,
      locked_at = excluded.locked_at,
      expires_at = excluded.expires_at
    WHERE job_locks.expires_at <= ?
  `).run(jobName, lockId, now, expiresAt, now);

  return result.changes > 0 ? lockId : null;
}

export async function releaseLock(jobName: string, lockId: string) {
  const db = getClient();
  await db.delete(jobLocks)
    .where(sql`${jobLocks.jobName} = ${jobName} AND ${jobLocks.lockedBy} = ${lockId}`);
}

export async function clearLock(jobName: string) {
  const db = getClient();
  await db.delete(jobLocks).where(eq(jobLocks.jobName, jobName));
}

export async function withJobLock<T>(jobName: string, ttlMs: number, fn: () => Promise<T>): Promise<T | undefined> {
  const lockId = await acquireLock(jobName, ttlMs);
  if (!lockId) {
    console.log(`Job ${jobName} is already running, skipping`);
    return undefined;
  }

  let released = false;
  const release = async () => {
    if (released) return;
    released = true;
    await releaseLock(jobName, lockId);
  };

  const handleSignal = (signal: NodeJS.Signals) => {
    void release().finally(() => {
      process.exit(signal === "SIGINT" ? 130 : 143);
    });
  };

  process.once("SIGINT", handleSignal);
  process.once("SIGTERM", handleSignal);

  try {
    return await fn();
  } finally {
    process.off("SIGINT", handleSignal);
    process.off("SIGTERM", handleSignal);
    await release();
  }
}
