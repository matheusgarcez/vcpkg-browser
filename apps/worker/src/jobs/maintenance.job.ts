import { createClient, getClient } from "@pkg/db";
import { ports, registrySnapshots } from "@pkg/db";
import { sql } from "drizzle-orm";
import { completeJobRun, createJobRun, failJobRun } from "./helpers.js";
import { computePackagingSignalsStep } from "./internal/compute-packaging-signals.js";
import { computePortHistoryDatesStep } from "./internal/port-history-dates.js";
import { computeScoresStep } from "./internal/compute-scores.js";
import { materializeHistoricalSnapshotsStep } from "./internal/materialize-historical-snapshots.js";
import { rebuildSearchIndexStep } from "./internal/rebuild-search.js";
import { isJobInvocation, runJobWithLock, type ClearLockOptions } from "./job-cli.js";
import { ensureRepo } from "./sync-vcpkg.job.js";
import { loadConfig } from "../config.js";

const config = loadConfig();

export type MaintenanceScope = "catalog" | "upstream";

export type MaintenanceJobOptions = ClearLockOptions & {
  scope?: MaintenanceScope;
};

async function maintenance(scope: MaintenanceScope) {
  const run = await createJobRun("maintenance");

  try {
    const db = getClient();

    if (scope === "catalog") {
      const latestSnapshot = await db.select({
        commitSha: registrySnapshots.commitSha,
      })
        .from(registrySnapshots)
        .orderBy(sql`${registrySnapshots.id} DESC`)
        .limit(1)
        .then((rows) => rows[0] ?? null);

      if (!latestSnapshot?.commitSha) {
        throw new Error("No registry snapshot found. Run sync-vcpkg before catalog maintenance.");
      }

      await ensureRepo();

      const portNames = await db.select({ name: ports.name }).from(ports).then((rows) => rows.map((row) => row.name));
      await computePortHistoryDatesStep({
        commitSha: latestSnapshot.commitSha,
        portNames,
      });
      await computePackagingSignalsStep();
      await rebuildSearchIndexStep();
      await materializeHistoricalSnapshotsStep();
    }

    await computeScoresStep();

    await completeJobRun(
      run.id,
      scope === "catalog"
        ? "Recomputed catalog maintenance data and scores"
        : "Recomputed upstream maintenance scores",
    );
    console.log(
      scope === "catalog"
        ? "Catalog maintenance complete."
        : "Upstream maintenance complete.",
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await failJobRun(run.id, msg);
    console.error("Maintenance failed:", err);
    throw err;
  }
}

export async function runMaintenanceJob(options: MaintenanceJobOptions = {}) {
  createClient(config.DATABASE_FILE);
  await runJobWithLock({
    jobName: "maintenance",
    lockTtlMs: 12 * 60 * 60 * 1000,
    clearLock: options.clearLock,
    run: async () => {
      await maintenance(options.scope ?? "catalog");
    },
  });
}

if (isJobInvocation(import.meta.url, "maintenance")) {
  await runMaintenanceJob();
}
