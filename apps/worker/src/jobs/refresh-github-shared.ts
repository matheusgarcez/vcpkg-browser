import { getClient, portSourceProvenance, upstreamIssues, upstreamRepositories } from "@pkg/db";
import {
  fetchReadme,
  fetchRepoRefreshSnapshot,
  GitHubQuotaError,
  isGitHubQuotaError,
  toGitHubQuotaError,
} from "@pkg/github";
import { eq } from "drizzle-orm";
import type { GitHubGraphqlArchiveRecord } from "./github-graphql-archive.js";

type GitHubRepositoryRow = typeof upstreamRepositories.$inferSelect;

export type RefreshGitHubRepoArgs = {
  jobName: string;
  runId: number;
  batchNumber: number;
  snapshotAsOf: Date;
  repo: GitHubRepositoryRow;
  readmeSourceMode?: "snapshot" | "latest";
};

export type RefreshGitHubRepoResult = {
  repoId: number;
  portName: string;
  ok: boolean;
  quotaError?: GitHubQuotaError;
  errorMessage?: string;
  archiveRecord?: GitHubGraphqlArchiveRecord;
  readmeFetched: boolean;
  readmeUpdated: boolean;
};

function shouldRefreshReadme(repo: GitHubRepositoryRow, repoUpdatedAt: string): boolean {
  if (!repo.repoUpdatedAt) return true;
  if (repo.repoUpdatedAt !== repoUpdatedAt) return true;
  return !repo.readmeEtag && !repo.readmeMarkdown && !repo.readmeSummary;
}

export function clearedUpstreamMetadata(now: string) {
  return {
    stars: null,
    forks: null,
    openIssues: null,
    totalIssues: null,
    issuesEnabled: null,
    openPrs: null,
    totalPrs: null,
    pullRequestsEnabled: null,
    closedIssues30d: null,
    mergedPrs30d: null,
    defaultBranch: null,
    repoCreatedAt: null,
    repoUpdatedAt: null,
    homepageUrl: null,
    licenseSpdxId: null,
    licenseName: null,
    primaryLanguage: null,
    primaryLanguageColor: null,
    topicsJson: null,
    latestReleaseTag: null,
    latestReleasePublishedAt: null,
    latestReleaseUrl: null,
    latestReleaseIsDraft: null,
    latestReleaseIsPrerelease: null,
    latestTagName: null,
    latestTagPublishedAt: null,
    latestTagUrl: null,
    pushedAt: null,
    lastCommitAt: null,
    archived: null,
    disabled: null,
    readmeMarkdown: null,
    readmeSummary: null,
    repoEtag: null,
    readmeEtag: null,
    issuesEtag: null,
    lastSuccessfulRefreshAt: null,
    lastFailedRefreshAt: null,
    refreshError: null,
    refreshedAt: null,
    updatedAt: now,
  } as const;
}

export async function clearUpstreamMetadataForPort(portName: string, now = new Date().toISOString()) {
  const db = getClient();
  const existing = await db.select({ id: upstreamRepositories.id })
    .from(upstreamRepositories)
    .where(eq(upstreamRepositories.portName, portName))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!existing) return;

  await db.update(upstreamRepositories)
    .set(clearedUpstreamMetadata(now))
    .where(eq(upstreamRepositories.id, existing.id));

  await db.delete(upstreamIssues).where(eq(upstreamIssues.upstreamId, existing.id));
}

export async function refreshGitHubRepo(args: RefreshGitHubRepoArgs): Promise<RefreshGitHubRepoResult> {
  const db = getClient();
  const { batchNumber, jobName, repo, runId, snapshotAsOf } = args;
  const readmeSourceMode = args.readmeSourceMode ?? "snapshot";
  let archiveRecord: GitHubGraphqlArchiveRecord | undefined;

  try {
    const owner = repo.owner!;
    const repoName = repo.repo!;
    const snapshot = await fetchRepoRefreshSnapshot(owner, repoName, snapshotAsOf);

    archiveRecord = {
      schemaVersion: 1,
      jobName,
      runId,
      batchNumber,
      snapshotAsOf: snapshotAsOf.toISOString(),
      capturedAt: new Date().toISOString(),
      upstreamId: repo.id,
      portName: repo.portName,
      owner,
      repo: repoName,
      status: "success",
      graphqlRateLimit: snapshot.graphqlRateLimit,
      rawGraphqlResponse: snapshot.rawGraphqlResponse,
    };

    const readmeNeeded = shouldRefreshReadme(repo, snapshot.repo.repoUpdatedAt);
    const readmeRef = readmeSourceMode === "snapshot"
      ? await resolveSnapshotReadmeRef(repo.portName)
      : undefined;
    const readmeResult = readmeNeeded
      ? await fetchReadme(owner, repoName, repo.readmeEtag ?? undefined, readmeRef)
      : null;

    const refreshedAt = new Date().toISOString();
    const updates: Record<string, unknown> = {
      refreshedAt,
      updatedAt: refreshedAt,
      stars: snapshot.repo.stars,
      forks: snapshot.repo.forks,
      openIssues: snapshot.issues.openIssues,
      totalIssues: snapshot.repo.totalIssues,
      issuesEnabled: snapshot.repo.issuesEnabled,
      openPrs: snapshot.repo.openPrs,
      totalPrs: snapshot.repo.totalPrs,
      pullRequestsEnabled: snapshot.repo.pullRequestsEnabled,
      closedIssues30d: snapshot.issues.closedIssues30d,
      mergedPrs30d: snapshot.repo.mergedPrs30d,
      defaultBranch: snapshot.repo.defaultBranch,
      repoCreatedAt: snapshot.repo.repoCreatedAt || null,
      repoUpdatedAt: snapshot.repo.repoUpdatedAt || null,
      homepageUrl: snapshot.repo.homepageUrl || null,
      licenseSpdxId: snapshot.repo.licenseSpdxId || null,
      licenseName: snapshot.repo.licenseName || null,
      primaryLanguage: snapshot.repo.primaryLanguage || null,
      primaryLanguageColor: snapshot.repo.primaryLanguageColor || null,
      topicsJson: JSON.stringify(snapshot.repo.topics),
      latestReleaseTag: snapshot.repo.latestReleaseTag || null,
      latestReleasePublishedAt: snapshot.repo.latestReleasePublishedAt || null,
      latestReleaseUrl: snapshot.repo.latestReleaseUrl || null,
      latestReleaseIsDraft: snapshot.repo.latestReleaseTag ? snapshot.repo.latestReleaseIsDraft : null,
      latestReleaseIsPrerelease: snapshot.repo.latestReleaseTag ? snapshot.repo.latestReleaseIsPrerelease : null,
      latestTagName: snapshot.repo.latestTagName || null,
      latestTagPublishedAt: snapshot.repo.latestTagPublishedAt || null,
      latestTagUrl: snapshot.repo.latestTagUrl || null,
      pushedAt: snapshot.repo.pushedAt,
      lastCommitAt: snapshot.repo.lastCommitAt,
      archived: snapshot.repo.archived,
      disabled: snapshot.repo.disabled,
      lastSuccessfulRefreshAt: refreshedAt,
      lastFailedRefreshAt: null,
      refreshError: null,
    };

    let readmeUpdated = false;
    if (readmeResult && !readmeResult.notModified) {
      updates.readmeMarkdown = readmeResult.content || null;
      updates.readmeSummary = readmeResult.content?.slice(0, 500) ?? null;
      updates.readmeEtag = readmeResult.etag ?? null;
      readmeUpdated = true;
    }

    await db.update(upstreamRepositories)
      .set(updates)
      .where(eq(upstreamRepositories.id, repo.id));

    await db.delete(upstreamIssues).where(eq(upstreamIssues.upstreamId, repo.id));
    if (snapshot.issues.topIssues.length > 0) {
      await db.insert(upstreamIssues).values(snapshot.issues.topIssues.map((issue) => ({
        upstreamId: repo.id,
        providerIssueId: issue.providerIssueId,
        number: issue.number,
        title: issue.title,
        url: issue.url,
        state: issue.state,
        comments: issue.comments,
        reactions: issue.reactions,
        bodyText: issue.bodyText || null,
        labelsJson: JSON.stringify(issue.labels),
        createdAt: issue.createdAt,
        updatedAt: issue.updatedAt,
        capturedAt: refreshedAt,
      })));
    }

    return {
      repoId: repo.id,
      portName: repo.portName,
      ok: true,
      archiveRecord,
      readmeFetched: readmeNeeded,
      readmeUpdated,
    };
  } catch (err) {
    if (isGitHubQuotaError(err)) {
      const quotaError = toGitHubQuotaError(err, `refreshing ${repo.portName}`);
      return {
        repoId: repo.id,
        portName: repo.portName,
        ok: false,
        quotaError,
        errorMessage: quotaError.message,
        archiveRecord,
        readmeFetched: false,
        readmeUpdated: false,
      };
    }

    const failedAt = new Date().toISOString();
    if (archiveRecord) {
      archiveRecord = {
        ...archiveRecord,
        status: "processing-failed",
        error: err instanceof Error ? err.message : String(err),
      };
    }
    await db.update(upstreamRepositories)
      .set({
        lastFailedRefreshAt: failedAt,
        refreshError: err instanceof Error ? err.message : String(err),
        updatedAt: failedAt,
      })
      .where(eq(upstreamRepositories.id, repo.id));

    return {
      repoId: repo.id,
      portName: repo.portName,
      ok: false,
      errorMessage: err instanceof Error ? err.message : String(err),
      archiveRecord,
      readmeFetched: false,
      readmeUpdated: false,
    };
  }
}

async function resolveSnapshotReadmeRef(portName: string): Promise<string | undefined> {
  const db = getClient();
  const row = await db
    .select({
      ref: portSourceProvenance.ref,
      refKind: portSourceProvenance.refKind,
      provider: portSourceProvenance.provider,
    })
    .from(portSourceProvenance)
    .where(eq(portSourceProvenance.portName, portName))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!row || row.provider !== "github" || !row.ref) return undefined;
  if (!isReadmeResolvableRefKind(row.refKind)) return undefined;
  return row.ref;
}

function isReadmeResolvableRefKind(refKind: string | null): boolean {
  return refKind === "commit" || refKind === "tag" || refKind === "branch" || refKind === "release";
}
