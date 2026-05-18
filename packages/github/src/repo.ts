import { getClient } from "./client.js";
import type { Endpoints } from "@octokit/types";
import { isGitHubQuotaError, toGitHubQuotaError } from "./rate-limit.js";

type RepoResponse = Endpoints["GET /repos/{owner}/{repo}"]["response"]["data"];

export type RepoMetadata = {
  stars: number;
  forks: number;
  openIssues: number;
  openPrs: number;
  mergedPrs30d: number;
  defaultBranch: string;
  repoCreatedAt: string;
  repoUpdatedAt: string;
  homepageUrl: string;
  licenseSpdxId: string;
  licenseName: string;
  primaryLanguage: string;
  primaryLanguageColor: string;
  topics: string[];
  latestReleaseTag: string;
  latestReleasePublishedAt: string;
  latestReleaseUrl: string;
  latestReleaseIsDraft: boolean;
  latestReleaseIsPrerelease: boolean;
  latestTagName: string;
  latestTagPublishedAt: string;
  latestTagUrl: string;
  pushedAt: string;
  lastCommitAt: string;
  archived: boolean;
  disabled: boolean;
  etag?: string;
};

export type RepoRefreshSnapshot = {
  repo: RepoMetadata;
  rawGraphqlResponse: RepoSnapshotResponse;
  graphqlRateLimit: {
    cost: number;
    "x-ratelimit-limit": number;
    "x-ratelimit-remaining": number;
    "x-ratelimit-reset": number;
    "x-ratelimit-resource": "graphql";
    "x-ratelimit-used": number;
    resetAt: string;
  };
  issues: {
    openIssues: number;
    closedIssues30d: number;
    topIssues: Array<{
      providerIssueId: string;
      number: number;
      title: string;
      url: string;
      state: string;
      comments: number;
      reactions: number;
      bodyText: string;
      labels: Array<{
        name: string;
        color: string;
        description: string;
      }>;
      createdAt: string;
      updatedAt: string;
    }>;
  };
};

type RepoSnapshotResponse = {
  mergedPullRequests30d: { issueCount: number };
  rateLimit: {
    cost: number;
    limit: number;
    remaining: number;
    used: number;
    resetAt: string;
  };
  repository: {
    stargazerCount: number;
    forkCount: number;
    createdAt: string;
    updatedAt: string;
    homepageUrl: string | null;
    licenseInfo: {
      spdxId: string | null;
      name: string;
    } | null;
    primaryLanguage: {
      name: string;
      color: string | null;
    } | null;
    repositoryTopics: {
      nodes: Array<{
        topic: {
          name: string;
        } | null;
      } | null>;
    };
    latestRelease: {
      tagName: string;
      publishedAt: string | null;
      url: string;
      isDraft: boolean;
      isPrerelease: boolean;
    } | null;
    latestTagRef: {
      nodes: Array<{
        name: string;
        target: {
          __typename: string;
          committedDate?: string | null;
          oid?: string | null;
          tagger?: {
            date: string | null;
          } | null;
          target?: {
            __typename: string;
            committedDate?: string | null;
            oid?: string | null;
          } | null;
        } | null;
      } | null>;
    };
    defaultBranchRef: { name: string } | null;
    defaultBranchTarget: {
      committedDate: string;
    } | null;
    pushedAt: string | null;
    isArchived: boolean;
    isDisabled: boolean;
    openIssues: { totalCount: number };
    openPullRequests: { totalCount: number };
    closedIssues30d: { totalCount: number };
    topIssues: {
      nodes: Array<{
        id: string;
        number: number;
        title: string;
        url: string;
        state: string;
        comments: { totalCount: number };
        reactionGroups: Array<{
          users: {
            totalCount: number;
          };
        }>;
        bodyText: string;
        labels: {
          nodes: Array<{
            name: string;
            color: string;
            description: string | null;
          } | null>;
        };
        createdAt: string;
        updatedAt: string;
      }>;
    };
  } | null;
};

export async function fetchRepoMetadata(
  owner: string,
  repo: string,
  etag?: string
): Promise<{ data: RepoMetadata | null; etag?: string; notModified: boolean }> {
  const client = getClient();
  const headers: Record<string, string> = {};
  if (etag) headers["If-None-Match"] = etag;

  try {
    const response = await client.rest.repos.get({
      owner,
      repo,
      headers,
    });

    const d = response.data as RepoResponse;
    return {
      data: {
        stars: d.stargazers_count ?? 0,
        forks: d.forks_count ?? 0,
        openIssues: d.open_issues_count ?? 0,
        openPrs: 0,
        mergedPrs30d: 0,
        defaultBranch: d.default_branch ?? "main",
        repoCreatedAt: d.created_at ?? "",
        repoUpdatedAt: d.updated_at ?? d.pushed_at ?? "",
        homepageUrl: d.homepage ?? "",
        licenseSpdxId: d.license?.spdx_id ?? "",
        licenseName: d.license?.name ?? "",
        primaryLanguage: d.language ?? "",
        primaryLanguageColor: "",
        topics: Array.isArray((d as { topics?: string[] }).topics) ? (d as { topics?: string[] }).topics ?? [] : [],
        latestReleaseTag: "",
        latestReleasePublishedAt: "",
        latestReleaseUrl: "",
        latestReleaseIsDraft: false,
        latestReleaseIsPrerelease: false,
        latestTagName: "",
        latestTagPublishedAt: "",
        latestTagUrl: "",
        pushedAt: d.pushed_at ?? "",
        lastCommitAt: d.pushed_at ?? "",
        archived: d.archived ?? false,
        disabled: d.disabled ?? false,
      },
      etag: response.headers.etag as string | undefined,
      notModified: false,
    };
  } catch (err: unknown) {
    if (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 304) {
      return { data: null, etag, notModified: true };
    }
    if (isGitHubQuotaError(err)) {
      throw toGitHubQuotaError(err, `repository metadata for ${owner}/${repo}`);
    }
    throw err;
  }
}

export async function fetchRepoRefreshSnapshot(
  owner: string,
  repo: string,
  asOf?: Date
): Promise<RepoRefreshSnapshot> {
  const client = getClient();
  const snapshotAsOf = asOf ?? new Date();
  const since = new Date(snapshotAsOf.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const response = await client.graphql<RepoSnapshotResponse>(
      `
        query RepoRefreshSnapshot($owner: String!, $repo: String!, $since: DateTime!) {
          rateLimit {
            cost
            limit
            remaining
            used
            resetAt
          }
          mergedPullRequests30d: search(query: "repo:${owner}/${repo} is:pr is:merged merged:>=${since}", type: ISSUE) {
            issueCount
          }
          repository(owner: $owner, name: $repo) {
            stargazerCount
            forkCount
            createdAt
            updatedAt
            homepageUrl
            licenseInfo {
              spdxId
              name
            }
            primaryLanguage {
              name
              color
            }
            repositoryTopics(first: 10) {
              nodes {
                topic {
                  name
                }
              }
            }
            latestRelease {
              tagName
              publishedAt
              url
              isDraft
              isPrerelease
            }
            latestTagRef: refs(refPrefix: "refs/tags/", first: 1, orderBy: { field: TAG_COMMIT_DATE, direction: DESC }) {
              nodes {
                name
                target {
                  __typename
                  ... on Commit {
                    committedDate
                    oid
                  }
                  ... on Tag {
                    tagger {
                      date
                    }
                    target {
                      __typename
                      ... on Commit {
                        committedDate
                        oid
                      }
                    }
                  }
                }
              }
            }
            defaultBranchRef {
              name
              target {
                ... on Commit {
                  committedDate
                }
              }
            }
            defaultBranchTarget: defaultBranchRef {
              target {
                ... on Commit {
                  committedDate
                }
              }
            }
            pushedAt
            isArchived
            isDisabled
            openIssues: issues(states: OPEN) {
              totalCount
            }
            openPullRequests: pullRequests(states: OPEN) {
              totalCount
            }
            closedIssues30d: issues(states: CLOSED, filterBy: { since: $since }) {
              totalCount
            }
            topIssues: issues(first: 10, states: OPEN, orderBy: { field: COMMENTS, direction: DESC }) {
              nodes {
                id
                number
                title
                url
                state
                comments {
                  totalCount
                }
                reactionGroups {
                  users {
                    totalCount
                  }
                }
                bodyText
                labels(first: 10) {
                  nodes {
                    name
                    color
                    description
                  }
                }
                createdAt
                updatedAt
              }
            }
          }
        }
      `,
      { owner, repo, since }
    );

    if (!response.repository) {
      throw new Error(`Repository ${owner}/${repo} not found`);
    }

    const latestTagNode = response.repository.latestTagRef.nodes.find((node) => !!node?.name) ?? null;
    const latestTagName = latestTagNode?.name ?? "";
    const latestTagPublishedAt = resolveLatestTagPublishedAt(latestTagNode) ?? "";
    const latestTagUrl = latestTagName
      ? `https://github.com/${owner}/${repo}/tree/${encodeURIComponent(latestTagName)}`
      : "";

    const latestReleaseTag = response.repository.latestRelease?.tagName ?? "";
    const latestReleasePublishedAt = response.repository.latestRelease?.publishedAt ?? "";
    const latestReleaseUrl = response.repository.latestRelease?.url ?? "";
    const latestReleaseIsDraft = response.repository.latestRelease?.isDraft ?? false;
    const latestReleaseIsPrerelease = response.repository.latestRelease?.isPrerelease ?? false;

    return {
      repo: {
        stars: response.repository.stargazerCount ?? 0,
        forks: response.repository.forkCount ?? 0,
        openIssues: response.repository.openIssues.totalCount ?? 0,
        openPrs: response.repository.openPullRequests.totalCount ?? 0,
        mergedPrs30d: response.mergedPullRequests30d.issueCount ?? 0,
        defaultBranch: response.repository.defaultBranchRef?.name ?? "main",
        repoCreatedAt: response.repository.createdAt ?? "",
        repoUpdatedAt: response.repository.updatedAt ?? response.repository.pushedAt ?? "",
        homepageUrl: response.repository.homepageUrl ?? "",
        licenseSpdxId: response.repository.licenseInfo?.spdxId ?? "",
        licenseName: response.repository.licenseInfo?.name ?? "",
        primaryLanguage: response.repository.primaryLanguage?.name ?? "",
        primaryLanguageColor: response.repository.primaryLanguage?.color ?? "",
        topics: response.repository.repositoryTopics.nodes.flatMap((node) => node?.topic?.name ? [node.topic.name] : []),
        latestReleaseTag,
        latestReleasePublishedAt,
        latestReleaseUrl,
        latestReleaseIsDraft,
        latestReleaseIsPrerelease,
        latestTagName,
        latestTagPublishedAt,
        latestTagUrl,
        pushedAt: response.repository.pushedAt ?? "",
        lastCommitAt: response.repository.defaultBranchTarget?.committedDate ?? response.repository.pushedAt ?? "",
        archived: response.repository.isArchived ?? false,
        disabled: response.repository.isDisabled ?? false,
      },
      rawGraphqlResponse: response,
      graphqlRateLimit: {
        cost: response.rateLimit.cost ?? 0,
        "x-ratelimit-limit": response.rateLimit.limit ?? 0,
        "x-ratelimit-remaining": response.rateLimit.remaining ?? 0,
        "x-ratelimit-reset": Math.floor(new Date(response.rateLimit.resetAt).getTime() / 1000),
        "x-ratelimit-resource": "graphql",
        "x-ratelimit-used": response.rateLimit.used ?? 0,
        resetAt: response.rateLimit.resetAt,
      },
      issues: {
        openIssues: response.repository.openIssues.totalCount ?? 0,
        closedIssues30d: response.repository.closedIssues30d.totalCount ?? 0,
        topIssues: response.repository.topIssues.nodes.map((issue) => ({
          providerIssueId: issue.id,
          number: issue.number,
          title: issue.title,
          url: issue.url,
          state: issue.state.toLowerCase(),
          comments: issue.comments.totalCount,
          reactions: issue.reactionGroups.reduce((sum, group) => sum + (group.users.totalCount ?? 0), 0),
          bodyText: issue.bodyText ?? "",
          labels: issue.labels.nodes.flatMap((label) => label ? [{
            name: label.name,
            color: label.color,
            description: label.description ?? "",
          }] : []),
          createdAt: issue.createdAt,
          updatedAt: issue.updatedAt,
        })),
      },
    };
  } catch (err: unknown) {
    if (isGitHubQuotaError(err)) {
      throw toGitHubQuotaError(err, `repository snapshot for ${owner}/${repo}`);
    }
    throw err;
  }
}

function resolveLatestTagPublishedAt(
  tagNode: NonNullable<RepoSnapshotResponse["repository"]>["latestTagRef"]["nodes"][number] | null,
): string | undefined {
  const target = tagNode?.target;
  if (!target) return undefined;

  if (target.__typename === "Commit" && target.committedDate) {
    return target.committedDate;
  }

  if (target.__typename === "Tag") {
    if (target.tagger?.date) {
      return target.tagger.date;
    }

    const nested = target.target;
    if (nested?.__typename === "Commit" && nested.committedDate) {
      return nested.committedDate;
    }
  }

  return undefined;
}

export async function fetchRepoPrs(
  owner: string,
  repo: string,
  asOf?: Date
): Promise<{ openPrs: number; mergedPrs30d: number }> {
  const client = getClient();

  const [openPrs, mergedPrs] = await Promise.all([
    client.rest.pulls.list({ owner, repo, state: "open", per_page: 1 }),
    client.rest.pulls.list({
      owner,
      repo,
      state: "closed",
      sort: "updated",
      direction: "desc",
      per_page: 1,
    }),
  ]);

  const snapshotAsOf = asOf ?? new Date();
  const thirtyDaysAgo = new Date(snapshotAsOf.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  let mergedPrs30d = 0;
  if (mergedPrs.data.length > 0) {
    const merged = await client.rest.pulls.list({
      owner,
      repo,
      state: "closed",
      sort: "updated",
      direction: "desc",
      per_page: 100,
    });
    mergedPrs30d = merged.data.filter(
      (pr) => pr.merged_at && pr.merged_at >= thirtyDaysAgo
    ).length;
  }

  return {
    openPrs: openPrs.data.length === 0 ? 0 : (await client.rest.pulls.list({ owner, repo, state: "open", per_page: 1 })).data.length,
    mergedPrs30d,
  };
}
