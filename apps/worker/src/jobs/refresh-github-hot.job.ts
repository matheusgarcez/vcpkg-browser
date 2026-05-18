import { createClient, getClient } from "@pkg/db";
import { upstreamRepositories } from "@pkg/db";
import { createGitHubClient } from "@pkg/github";
import { GitHubQuotaError } from "@pkg/github";
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

async function refreshHotRepos() {
  const run = await createJobRun("refresh-github-hot");
  const snapshotAsOf = new Date(run.startedAt);
  const archivePath = buildGitHubGraphqlArchivePath({
    archiveDir: config.GITHUB_GRAPHQL_ARCHIVE_DIR,
    jobName: "refresh-github-hot",
    runId: run.id,
    startedAt: run.startedAt,
  });

  try {
    if (!config.GITHUB_TOKEN) {
      throw new Error("GITHUB_TOKEN is required for `pnpm job -- refresh-github-hot`. Add it to .env or your environment before running the job.");
    }

    createGitHubClient(config.GITHUB_TOKEN);
    const db = getClient();

    const hotRepos = await db.select()
      .from(upstreamRepositories)
      .where(
        sql`${upstreamRepositories.provider} = 'github'
            AND ${upstreamRepositories.owner} IS NOT NULL
            AND ${upstreamRepositories.repo} IS NOT NULL
            AND (
              ${upstreamRepositories.stars} >= 100
              OR ${upstreamRepositories.refreshedAt} IS NULL
              OR ${upstreamRepositories.refreshedAt} < datetime('now', '-12 hours')
            )`
      )
      .orderBy(sql`COALESCE(${upstreamRepositories.stars}, 0) DESC`)
      .limit(50);

    console.log(`Refreshing ${hotRepos.length} hot repos`);
    await updateJobProgress(run.id, 0, hotRepos.length);

    const queue = new PQueue({
      concurrency: config.GITHUB_REFRESH_CONCURRENCY,
      intervalCap: config.GITHUB_REFRESH_REPOS_PER_MINUTE,
      interval: 60_000,
    });

    console.log(`GitHub hot refresh settings: concurrency ${config.GITHUB_REFRESH_CONCURRENCY}, ${config.GITHUB_REFRESH_REPOS_PER_MINUTE} repos/min`);

    let processed = 0;
    const reportProgress = async () => {
      if (processed === 0) return;
      if (processed % PROGRESS_LOG_INTERVAL !== 0 && processed !== hotRepos.length) return;
      await updateJobProgress(run.id, processed, hotRepos.length);
      console.log(`GitHub hot refresh progress: ${processed}/${hotRepos.length}`);
    };

    const results = await queue.addAll(
      hotRepos.map((repo) => async () => {
        const result = await refreshGitHubRepo({
          jobName: "refresh-github-hot",
          runId: run.id,
          batchNumber: 1,
          snapshotAsOf,
          repo,
          readmeSourceMode: config.GITHUB_README_SOURCE_MODE,
        });

        processed++;
        await reportProgress();

        if (!result.ok && result.errorMessage && !result.quotaError) {
          console.error(`Failed to refresh ${repo.portName}: ${result.errorMessage}`);
        }

        return result;
      })
    );

    const archived = await appendGitHubGraphqlArchiveBatch({
      archivePath,
      records: results.flatMap((result) => result.archiveRecord ? [result.archiveRecord] : []),
    });
    if (archived) {
      console.log(`Archived ${archived.count} GitHub GraphQL snapshots to ${archived.archivePath} (+${archived.gzipBytes} bytes gz)`);
    }

    const quotaFailure = results.find((r) => "quotaError" in r && r.quotaError instanceof GitHubQuotaError);
    const quotaError = quotaFailure && "quotaError" in quotaFailure ? quotaFailure.quotaError : undefined;
    if (quotaError) {
      await updateJobProgress(run.id, processed, hotRepos.length);
      console.error(`GitHub hot refresh paused at ${processed}/${hotRepos.length}: ${quotaError.message}`);
      throw quotaError;
    }

    const succeeded = results.filter((r) => r.ok).length;
    await updateJobProgress(run.id, processed, hotRepos.length);
    await completeJobRun(run.id, `Refreshed ${succeeded}/${hotRepos.length} hot repos`);
    console.log(`Hot refresh complete: ${succeeded}/${hotRepos.length}`);

    if (processed > 0) {
      await computeScoresStep();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await failJobRun(run.id, msg);
    console.error("Hot refresh failed:", err);
    throw err;
  }
}

export type RefreshGitHubHotJobOptions = ClearLockOptions;

export async function runRefreshGitHubHotJob(options: RefreshGitHubHotJobOptions = {}) {
  createClient(config.DATABASE_FILE);
  await runJobWithLock({
    jobName: "refresh-github-hot",
    lockTtlMs: 30 * 60 * 1000,
    clearLock: options.clearLock,
    run: async () => {
      await refreshHotRepos();
    },
  });
}

if (isJobInvocation(import.meta.url, "refresh-github-hot")) {
  await runRefreshGitHubHotJob();
}
