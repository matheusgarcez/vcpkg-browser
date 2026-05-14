import { createClient, getClient, getSqlite } from "@pkg/db";
import { jobRuns, httpCache, historicalPortSnapshots, jobLocks } from "@pkg/db";
import { lt, sql } from "drizzle-orm";
import { createJobRun, completeJobRun, failJobRun } from "./helpers.js";
import { isJobInvocation, runJobWithLock, type ClearLockOptions } from "./job-cli.js";
import { loadConfig } from "../config.js";

const config = loadConfig();

async function cleanup() {
  const run = await createJobRun("cleanup");

  try {
    const db = getClient();
    const sqlite = getSqlite();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const oldJobRuns = await db.delete(jobRuns)
      .where(lt(jobRuns.startedAt, thirtyDaysAgo))
      .run();

    const oldCache = await db.delete(httpCache)
      .where(lt(httpCache.fetchedAt, thirtyDaysAgo))
      .run();

    const orphanHistoricalSnapshots = await db.delete(historicalPortSnapshots)
      .where(sql`${historicalPortSnapshots.gitTree} NOT IN (
        SELECT ${sql.raw("git_tree")} FROM port_versions WHERE git_tree IS NOT NULL
      )`)
      .run();

    const staleLocks = await db.delete(jobLocks)
      .where(lt(jobLocks.expiresAt, new Date().toISOString()))
      .run();

    sqlite.exec("PRAGMA optimize");

    await completeJobRun(
      run.id,
      `Cleaned up ${oldJobRuns.changes} job runs, ${oldCache.changes} cache rows, ${orphanHistoricalSnapshots.changes} orphan snapshots, and ${staleLocks.changes} stale locks`,
    );
    console.log("Cleanup complete");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await failJobRun(run.id, msg);
    console.error("Cleanup failed:", err);
    throw err;
  }
}

export type CleanupJobOptions = ClearLockOptions;

export async function runCleanupJob(options: CleanupJobOptions = {}) {
  createClient(config.DATABASE_FILE);
  await runJobWithLock({
    jobName: "cleanup",
    lockTtlMs: 10 * 60 * 1000,
    clearLock: options.clearLock,
    run: async () => {
      await cleanup();
    },
  });
}

if (isJobInvocation(import.meta.url, "cleanup")) {
  await runCleanupJob();
}
