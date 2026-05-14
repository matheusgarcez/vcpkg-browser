import { getClient } from "@pkg/db";
import { historicalPortSnapshots, portVersions } from "@pkg/db";
import { InvalidHistoricalTreeError, materializeHistoricalSnapshot } from "@pkg/vcpkg-parser";
import { asc, isNotNull } from "drizzle-orm";
import PQueue from "p-queue";
import { loadConfig } from "../../config.js";

const config = loadConfig();
const SNAPSHOT_MATERIALIZE_CONCURRENCY = 8;

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function createProgressLogger(
  label: string,
  total: number,
  options?: {
    logEvery?: number;
    minIntervalMs?: number;
  },
) {
  const startedAt = Date.now();
  const logEvery = Math.max(1, options?.logEvery ?? (Math.ceil(total / 20) || 1));
  const minIntervalMs = options?.minIntervalMs ?? 5_000;
  let current = 0;
  let lastLoggedAt = startedAt;

  function log(force = false) {
    const now = Date.now();
    if (!force && current < total && current % logEvery !== 0 && now - lastLoggedAt < minIntervalMs) {
      return false;
    }

    const elapsedMs = now - startedAt;
    const percent = total > 0 ? ((current / total) * 100).toFixed(1) : "100.0";
    const avgMsPerItem = current > 0 ? elapsedMs / current : 0;
    const remainingItems = Math.max(0, total - current);
    const etaMs = avgMsPerItem * remainingItems;

    console.log(
      `${label}: ${current}/${total} (${percent}%) elapsed ${formatDuration(elapsedMs)}`
      + (current > 0 && remainingItems > 0 ? ` eta ${formatDuration(etaMs)}` : ""),
    );
    lastLoggedAt = now;
    return true;
  }

  return {
    tick(step = 1) {
      current = Math.min(total, current + step);
      return log(false);
    },
    finish() {
      current = total;
      log(true);
    },
  };
}

type VersionSnapshotRow = {
  portName: string;
  version: string;
  portVersion: number | null;
  gitTree: string | null;
};

export async function materializeHistoricalSnapshotsStep() {
  const db = getClient();
  const versionRows = await db.select({
    portName: portVersions.portName,
    version: portVersions.version,
    portVersion: portVersions.portVersion,
    gitTree: portVersions.gitTree,
  })
    .from(portVersions)
    .where(isNotNull(portVersions.gitTree))
    .orderBy(asc(portVersions.id)) as VersionSnapshotRow[];
  const existingRows = await db.select({ gitTree: historicalPortSnapshots.gitTree })
    .from(historicalPortSnapshots);
  const existingTrees = new Set(existingRows.map((row) => row.gitTree));
  const missingRows = versionRows.filter((row) => row.gitTree && !existingTrees.has(row.gitTree));
  const uniqueMissingRows = Array.from(
    new Map(
      missingRows
        .filter((row): row is VersionSnapshotRow & { gitTree: string } => Boolean(row.gitTree))
        .map((row) => [row.gitTree, row]),
    ).values(),
  );

  if (uniqueMissingRows.length === 0) {
    console.log("Historical snapshots already materialized.");
    return;
  }

  console.log(`Materializing ${uniqueMissingRows.length} historical snapshots...`);
  const progress = createProgressLogger("Historical snapshots materialized", uniqueMissingRows.length, {
    logEvery: 25,
  });
  const queue = new PQueue({ concurrency: SNAPSHOT_MATERIALIZE_CONCURRENCY });

  let inserted = 0;
  let skipped = 0;

  await queue.addAll(uniqueMissingRows.map((row) => async () => {
    try {
      const snapshot = await materializeHistoricalSnapshot(config.VCPKG_REPO_DIR, {
        portName: row.portName,
        version: row.version,
        portVersion: row.portVersion ?? 0,
        gitTree: row.gitTree,
      });

      await db.insert(historicalPortSnapshots).values(snapshot).onConflictDoNothing();
      inserted++;
    } catch (error) {
      if (error instanceof InvalidHistoricalTreeError) {
        skipped++;
        console.warn(`Skipping historical snapshot ${row.portName}@${row.version}#${row.portVersion ?? 0}: ${error.message}`);
      } else {
        throw error;
      }
    }

    progress.tick();
  }));

  progress.finish();

  if (skipped > 0) {
    console.log(`Materialized ${inserted} historical snapshots and skipped ${skipped} invalid trees.`);
    return;
  }

  console.log(`Materialized ${inserted} historical snapshots.`);
}
