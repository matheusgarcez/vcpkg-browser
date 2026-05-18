import { createClient, getClient } from "@pkg/db";
import { upstreamRepositories } from "@pkg/db";
import { createGitHubClient } from "@pkg/github";
import { GitHubQuotaError } from "@pkg/github";
import type { RepoRefreshSnapshot } from "@pkg/github";
import { sql } from "drizzle-orm";
import PQueue from "p-queue";
import { createJobRun, completeJobRun, failJobRun, updateJobProgress } from "./helpers.js";
import { appendGitHubGraphqlArchiveBatch, buildGitHubGraphqlArchivePath } from "./github-graphql-archive.js";
import { loadConfig } from "../config.js";
import { computeScoresStep } from "./internal/compute-scores.js";
import { refreshGitHubRepo } from "./refresh-github-shared.js";
import { isJobInvocation, runJobWithLock, type ClearLockOptions } from "./job-cli.js";

const config = loadConfig();
const PROGRESS_LOG_INTERVAL = 5;
const STATUS_LOG_INTERVAL = 10;
const FULL_REFRESH_MAX_AGE_DAYS = 7;

export type RefreshGitHubFullJobOptions = ClearLockOptions & {
  refreshAll?: boolean;
};

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0m";
  const totalMinutes = Math.round(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function describeGraphqlBudgetStatus(args: {
  processed: number;
  totalRemaining: number;
  totalGraphqlCost: number;
  graphqlSnapshots: number;
  latestRateLimit?: {
    cost: number;
    "x-ratelimit-limit": number;
    "x-ratelimit-remaining": number;
    "x-ratelimit-reset": number;
    "x-ratelimit-resource": "graphql";
    "x-ratelimit-used": number;
    resetAt: string;
  };
  startedAt: number;
}): string | null {
  const { processed, totalRemaining, totalGraphqlCost, graphqlSnapshots, latestRateLimit, startedAt } = args;
  if (!latestRateLimit || processed === 0 || graphqlSnapshots === 0) return null;

  const remainingRepos = Math.max(totalRemaining - processed, 0);
  const averageCostPerRepo = totalGraphqlCost / graphqlSnapshots;
  const projectedCostToFinish = Math.ceil(averageCostPerRepo * remainingRepos);
  const projectedRemaining = latestRateLimit["x-ratelimit-remaining"] - projectedCostToFinish;
  const elapsedMs = Date.now() - startedAt;
  const reposPerMinute = elapsedMs > 0 ? processed / (elapsedMs / 60_000) : 0;
  const etaMs = reposPerMinute > 0 ? (remainingRepos / reposPerMinute) * 60_000 : 0;
  const resetMs = Math.max(new Date(latestRateLimit.resetAt).getTime() - Date.now(), 0);

  let forecast = projectedRemaining >= 0 ? "within current budget window" : "likely after current budget window";
  if (projectedRemaining < 0 && averageCostPerRepo > 0 && reposPerMinute > 0) {
    const reposUntilExhaustion = Math.floor(latestRateLimit["x-ratelimit-remaining"] / averageCostPerRepo);
    const exhaustMs = (reposUntilExhaustion / reposPerMinute) * 60_000;
    forecast = `budget exhaustion in ~${reposUntilExhaustion} repos (${formatDuration(exhaustMs)})`;
  }

  return [
    `GraphQL budget: ${latestRateLimit["x-ratelimit-remaining"]}/${latestRateLimit["x-ratelimit-limit"]} remaining (used ${latestRateLimit["x-ratelimit-used"]})`,
    `avg cost ${averageCostPerRepo.toFixed(2)}/repo`,
    `projected need ${projectedCostToFinish}`,
    `ETA ${formatDuration(etaMs)}`,
    `reset ${latestRateLimit.resetAt} (in ${formatDuration(resetMs)})`,
    `forecast: ${forecast}`,
  ].join(" | ");
}

function githubRepoIdentityFilter() {
  return sql`${upstreamRepositories.provider} = 'github'
    AND ${upstreamRepositories.owner} IS NOT NULL
    AND ${upstreamRepositories.repo} IS NOT NULL`;
}

function githubReposNeedingRefresh(cutoffIso: string) {
  return sql`${githubRepoIdentityFilter()}
    AND (
      ${upstreamRepositories.lastSuccessfulRefreshAt} IS NULL
      OR ${upstreamRepositories.lastSuccessfulRefreshAt} < ${cutoffIso}
    )`;
}

function describeRefreshScope(refreshAll: boolean): string {
  return refreshAll
    ? "GitHub repos"
    : `stale GitHub repos older than ${FULL_REFRESH_MAX_AGE_DAYS} days`;
}

async function refreshAllRepos(options: RefreshGitHubFullJobOptions) {
  const refreshAll = Boolean(options.refreshAll);
  const run = await createJobRun("refresh-github-full");
  const snapshotAsOf = new Date(run.startedAt);
  const archivePath = buildGitHubGraphqlArchivePath({
    archiveDir: config.GITHUB_GRAPHQL_ARCHIVE_DIR,
    jobName: "refresh-github-full",
    runId: run.id,
    startedAt: run.startedAt,
  });

  try {
    if (!config.GITHUB_TOKEN) {
      throw new Error("GITHUB_TOKEN is required for `pnpm job -- refresh-github-full`. Add it to .env or your environment before running the job.");
    }

    createGitHubClient(config.GITHUB_TOKEN);
    const db = getClient();
    const cutoffIso = new Date(Date.now() - FULL_REFRESH_MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const reposToRefresh = await db.select()
      .from(upstreamRepositories)
      .where(refreshAll ? githubRepoIdentityFilter() : githubReposNeedingRefresh(cutoffIso))
      .orderBy(
        sql`COALESCE(${upstreamRepositories.lastSuccessfulRefreshAt}, '1970-01-01T00:00:00.000Z') ASC`,
        sql`${upstreamRepositories.id} ASC`,
      );

    const totalRemaining = reposToRefresh.length;

    if (totalRemaining === 0) {
      await completeJobRun(
        run.id,
        refreshAll
          ? "No GitHub repos found to refresh"
          : `All GitHub repos refreshed within ${FULL_REFRESH_MAX_AGE_DAYS} days`,
      );
      if (refreshAll) {
        console.log("GitHub full refresh: no GitHub repos found");
      } else {
        console.log(`GitHub full refresh: nothing older than ${FULL_REFRESH_MAX_AGE_DAYS} days`);
      }
      return;
    }

    console.log(`Refreshing ${totalRemaining} ${describeRefreshScope(refreshAll)} (batch size ${config.GITHUB_FULL_REFRESH_BATCH_SIZE}, concurrency ${config.GITHUB_REFRESH_CONCURRENCY}, ${config.GITHUB_REFRESH_REPOS_PER_MINUTE} repos/min)`);
    await updateJobProgress(run.id, 0, totalRemaining);

    const queue = new PQueue({
      concurrency: config.GITHUB_REFRESH_CONCURRENCY,
      intervalCap: config.GITHUB_REFRESH_REPOS_PER_MINUTE,
      interval: 60_000,
    });

    const startedAt = Date.now();
    let processed = 0;
    let succeeded = 0;
    let batchNumber = 0;
    let totalGraphqlCost = 0;
    let graphqlSnapshots = 0;
    let latestGraphqlRateLimit: RepoRefreshSnapshot["graphqlRateLimit"] | undefined;
    const reportProgress = async () => {
      if (processed === 0) return;
      if (processed % PROGRESS_LOG_INTERVAL !== 0 && processed !== totalRemaining) return;
      await updateJobProgress(run.id, processed, totalRemaining);
      console.log(`GitHub full refresh progress: ${processed}/${totalRemaining}`);

      if (processed % STATUS_LOG_INTERVAL === 0 || processed === totalRemaining) {
        const status = describeGraphqlBudgetStatus({
          processed,
          totalRemaining,
          totalGraphqlCost,
          graphqlSnapshots,
          latestRateLimit: latestGraphqlRateLimit,
          startedAt,
        });
        if (status) {
          console.log(status);
        }
      }
    };

    for (let i = 0; i < reposToRefresh.length; i += config.GITHUB_FULL_REFRESH_BATCH_SIZE) {
      const repos = reposToRefresh.slice(i, i + config.GITHUB_FULL_REFRESH_BATCH_SIZE);

      batchNumber++;
      console.log(`GitHub full refresh batch ${batchNumber}: ${repos.length} ${describeRefreshScope(refreshAll)}`);

      const results = await queue.addAll(
        repos.map((repo) => async () => {
          const result = await refreshGitHubRepo({
            jobName: "refresh-github-full",
            runId: run.id,
            batchNumber,
            snapshotAsOf,
            repo,
            readmeSourceMode: config.GITHUB_README_SOURCE_MODE,
          });

          if (result.archiveRecord) {
            totalGraphqlCost += result.archiveRecord.graphqlRateLimit.cost;
            graphqlSnapshots++;
            latestGraphqlRateLimit = result.archiveRecord.graphqlRateLimit;
          }

          processed++;
          await reportProgress();

          if (!result.ok && result.errorMessage && !result.quotaError) {
            console.error(`Failed to refresh ${repo.portName}: ${result.errorMessage}`);
          }

          return result;
        }),
      );

      const archived = await appendGitHubGraphqlArchiveBatch({
        archivePath,
        records: results.flatMap((result) => result.archiveRecord ? [result.archiveRecord] : []),
      });
      if (archived) {
        console.log(`Archived ${archived.count} GitHub GraphQL snapshots to ${archived.archivePath} (+${archived.gzipBytes} bytes gz)`);
      }

      const quotaFailure = results.find((result) => "quotaError" in result && result.quotaError instanceof GitHubQuotaError);
      const quotaError = quotaFailure && "quotaError" in quotaFailure ? quotaFailure.quotaError : undefined;
      if (quotaError) {
        await updateJobProgress(run.id, processed, totalRemaining);
        console.error(`GitHub full refresh paused at ${processed}/${totalRemaining}: ${quotaError.message}`);
        throw quotaError;
      }

      succeeded += results.filter((result) => result.ok).length;
    }

    await updateJobProgress(run.id, processed, totalRemaining);
    await completeJobRun(
      run.id,
      refreshAll
        ? `Refreshed ${succeeded}/${processed} GitHub repos`
        : `Refreshed ${succeeded}/${processed} stale GitHub repos`,
    );
    console.log(
      refreshAll
        ? `Full refresh complete: ${succeeded}/${processed} GitHub repos`
        : `Full refresh complete: ${succeeded}/${processed} stale GitHub repos`,
    );

    if (processed > 0) {
      await computeScoresStep();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await failJobRun(run.id, msg);
    console.error("Full refresh failed:", err);
    throw err;
  }
}

export async function runRefreshGitHubFullJob(options: RefreshGitHubFullJobOptions = {}) {
  createClient(config.DATABASE_FILE);
  await runJobWithLock({
    jobName: "refresh-github-full",
    lockTtlMs: 60 * 60 * 1000,
    clearLock: options.clearLock,
    run: async () => {
      await refreshAllRepos(options);
    },
  });
}

if (isJobInvocation(import.meta.url, "refresh-github-full")) {
  await runRefreshGitHubFullJob();
}
