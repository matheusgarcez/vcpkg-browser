export const VCPKG_REPO_URL = "https://github.com/microsoft/vcpkg";

export const VCPKG_DEFAULT_BRANCH = "master";

export const DEFAULT_PAGE_SIZE = 30;

export const MAX_PAGE_SIZE = 100;

export const POPULAR_CUTOFF_STARS = 100;

export const RECENT_DAYS = 30;

export const MAINTENANCE_LABELS = {
  ACTIVE: "active",
  HEALTHY: "healthy",
  MODERATE: "moderate",
  STALE: "stale",
  INACTIVE: "inactive",
  ARCHIVED: "archived",
  UNKNOWN_UPSTREAM: "unknown-upstream",
} as const;

export const UPSTREAM_CONFIDENCE = {
  EXPLICIT_GITHUB_REPO: 100,
  EXPLICIT_PROVIDER_URL: 90,
  HOMEPAGE_IS_REPO: 70,
  HOMEPAGE_REDIRECT: 40,
  NONE: 0,
} as const;

export const JOB_NAMES = {
  SYNC_VCPKG: "sync-vcpkg",
  REFRESH_GITHUB_HOT: "refresh-github-hot",
  REFRESH_GITHUB_FULL: "refresh-github-full",
  MAINTENANCE: "maintenance",
  CLEANUP: "cleanup",
} as const;
