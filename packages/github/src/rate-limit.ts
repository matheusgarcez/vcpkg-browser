type HeaderValue = string | number | string[] | undefined;

export class GitHubQuotaError extends Error {
  readonly retryAfterSeconds?: number;
  readonly resetAt?: string;

  constructor(message: string, options?: { retryAfterSeconds?: number; resetAt?: string; cause?: unknown }) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = "GitHubQuotaError";
    this.retryAfterSeconds = options?.retryAfterSeconds;
    this.resetAt = options?.resetAt;
  }
}

function firstHeaderValue(value: HeaderValue): string | undefined {
  if (Array.isArray(value)) return value[0];
  if (typeof value === "number") return String(value);
  return value;
}

export function parseRateLimitHeaders(headers: Record<string, HeaderValue>) {
  const remaining = parseInt(firstHeaderValue(headers["x-ratelimit-remaining"]) ?? "-1", 10);
  const reset = parseInt(firstHeaderValue(headers["x-ratelimit-reset"]) ?? "0", 10);
  const limit = parseInt(firstHeaderValue(headers["x-ratelimit-limit"]) ?? "5000", 10);
  const retryAfter = parseInt(firstHeaderValue(headers["retry-after"]) ?? "0", 10);

  return {
    remaining,
    reset,
    limit,
    retryAfter,
    resetAt: reset > 0 ? new Date(reset * 1000).toISOString() : undefined,
  };
}

export function isGitHubQuotaError(error: unknown): boolean {
  if (error instanceof GitHubQuotaError) return true;
  if (!error || typeof error !== "object") return false;

  const status = "status" in error ? (error as { status?: unknown }).status : undefined;
  const response = "response" in error ? (error as { response?: { headers?: Record<string, HeaderValue> } }).response : undefined;
  const headers = response?.headers ?? ("headers" in error ? (error as { headers?: Record<string, HeaderValue> }).headers : undefined) ?? {};
  const message = "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  const rate = parseRateLimitHeaders(headers);

  return status === 429
    || (status === 403 && rate.remaining === 0)
    || /quota exhausted|rate limit|secondary rate/i.test(message);
}

export function toGitHubQuotaError(error: unknown, requestLabel?: string): GitHubQuotaError {
  if (error instanceof GitHubQuotaError) return error;

  const response = error && typeof error === "object" && "response" in error
    ? (error as { response?: { headers?: Record<string, HeaderValue> } }).response
    : undefined;
  const headers = response?.headers ?? (error && typeof error === "object" && "headers" in error
    ? (error as { headers?: Record<string, HeaderValue> }).headers
    : {}) ?? {};
  const rate = parseRateLimitHeaders(headers);
  const baseMessage = requestLabel
    ? `GitHub API quota exhausted during ${requestLabel}`
    : "GitHub API quota exhausted";
  const detail = rate.resetAt
    ? `${baseMessage}. Retry after reset at ${rate.resetAt}.`
    : `${baseMessage}. Retry after the current rate-limit window resets.`;

  return new GitHubQuotaError(detail, {
    retryAfterSeconds: rate.retryAfter > 0 ? rate.retryAfter : undefined,
    resetAt: rate.resetAt,
    cause: error,
  });
}
