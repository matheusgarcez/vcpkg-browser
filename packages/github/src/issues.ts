import { getClient } from "./client.js";
import { isGitHubQuotaError, toGitHubQuotaError } from "./rate-limit.js";

export type IssueData = {
  number: number;
  title: string;
  url: string;
  state: string;
  comments: number;
  createdAt: string;
  updatedAt: string;
};

export type IssuesResult = {
  openIssues: number;
  closedIssues30d: number;
  topIssues: IssueData[];
  etag?: string;
  notModified: boolean;
};

export function getResultCount<T>(data: T[], headers: Record<string, string | number | string[] | undefined>): number {
  const linkHeader = Array.isArray(headers.link) ? headers.link[0] : typeof headers.link === "number" ? String(headers.link) : headers.link;
  if (!linkHeader) {
    return data.length;
  }

  const lastPage = linkHeader.match(/[?&]page=(\d+)>;\s*rel="last"/);
  if (lastPage) {
    return Number.parseInt(lastPage[1], 10);
  }

  return data.length;
}

export async function fetchIssues(
  owner: string,
  repo: string,
  etag?: string,
  asOf?: Date
): Promise<IssuesResult> {
  const client = getClient();
  const headers: Record<string, string> = {};
  if (etag) headers["If-None-Match"] = etag;

  const snapshotAsOf = asOf ?? new Date();
  const thirtyDaysAgo = new Date(snapshotAsOf.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const openResult = await client.rest.issues.list({ owner, repo, state: "open", per_page: 1 });
    const closedResult = await client.rest.issues.list({
      owner,
      repo,
      state: "closed",
      since: thirtyDaysAgo,
      per_page: 1,
    });
    const topResult = await client.rest.issues.list({
      owner,
      repo,
      state: "open",
      sort: "comments",
      direction: "desc",
      per_page: 10,
      headers,
    });

    const topIssues: IssueData[] = topResult.data.map((issue) => ({
      number: issue.number,
      title: issue.title,
      url: issue.html_url,
      state: issue.state,
      comments: issue.comments,
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
    }));

    return {
      openIssues: getResultCount(openResult.data, openResult.headers),
      closedIssues30d: getResultCount(closedResult.data, closedResult.headers),
      topIssues,
      etag: topResult.headers.etag as string | undefined,
      notModified: false,
    };
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "status" in err &&
      (err as { status: number }).status === 304
    ) {
      return { openIssues: 0, closedIssues30d: 0, topIssues: [], etag, notModified: true };
    }
    if (isGitHubQuotaError(err)) {
      throw toGitHubQuotaError(err, `issues for ${owner}/${repo}`);
    }
    return { openIssues: 0, closedIssues30d: 0, topIssues: [], notModified: false };
  }
}
