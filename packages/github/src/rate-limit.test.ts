import { describe, expect, it } from "vitest";
import { GitHubQuotaError, isGitHubQuotaError, parseRateLimitHeaders, toGitHubQuotaError } from "./rate-limit";

describe("rate-limit helpers", () => {
  it("parses retry and reset headers", () => {
    const parsed = parseRateLimitHeaders({
      "x-ratelimit-remaining": "0",
      "x-ratelimit-reset": "1715443200",
      "x-ratelimit-limit": "5000",
      "retry-after": "60",
    });

    expect(parsed).toMatchObject({
      remaining: 0,
      reset: 1715443200,
      limit: 5000,
      retryAfter: 60,
      resetAt: "2024-05-11T16:00:00.000Z",
    });
  });

  it("detects and wraps quota errors", () => {
    const error = {
      status: 403,
      message: "Request quota exhausted for request GET /repos/{owner}/{repo}",
      response: {
        headers: {
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": "1715443200",
        },
      },
    };

    expect(isGitHubQuotaError(error)).toBe(true);

    const wrapped = toGitHubQuotaError(error, "repository metadata");
    expect(wrapped).toBeInstanceOf(GitHubQuotaError);
    expect(wrapped.message).toContain("repository metadata");
    expect(wrapped.resetAt).toBe("2024-05-11T16:00:00.000Z");
  });
});