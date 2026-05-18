import { getClient } from "./client.js";
import { isGitHubQuotaError, toGitHubQuotaError } from "./rate-limit.js";

export type ReadmeResult = {
  content: string;
  etag?: string;
  notModified: boolean;
};

export async function fetchReadme(
  owner: string,
  repo: string,
  etag?: string,
  ref?: string,
): Promise<ReadmeResult> {
  const client = getClient();
  const headers: Record<string, string> = {};
  if (etag) headers["If-None-Match"] = etag;

  try {
    const response = await client.rest.repos.getReadme({
      owner,
      repo,
      ref,
      mediaType: { format: "raw" },
      headers,
    });

    return {
      content: response.data as unknown as string,
      etag: response.headers.etag as string | undefined,
      notModified: false,
    };
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "status" in err &&
      (err as { status: number }).status === 304
    ) {
      return { content: "", etag, notModified: true };
    }
    if (isGitHubQuotaError(err)) {
      const sourceLabel = ref ? `${owner}/${repo}@${ref}` : `${owner}/${repo}`;
      throw toGitHubQuotaError(err, `README for ${sourceLabel}`);
    }
    return { content: "", notModified: false };
  }
}
