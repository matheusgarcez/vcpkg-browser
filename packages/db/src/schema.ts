import { sqliteTable, text, integer, primaryKey, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const catalogMeta = sqliteTable("catalog_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const registrySnapshots = sqliteTable("registry_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  commitSha: text("commit_sha").notNull().unique(),
  baselineSha: text("baseline_sha"),
  releaseVersion: text("release_version"),
  releasePublishedAt: text("release_published_at"),
  indexedAt: text("indexed_at").notNull(),
  portsCount: integer("ports_count").notNull(),
  featuresCount: integer("features_count").notNull(),
});

export const ports = sqliteTable("ports", {
  name: text("name").primaryKey(),
  displayName: text("display_name"),
  version: text("version"),
  portVersion: integer("port_version"),
  versionsPath: text("versions_path"),
  description: text("description"),
  homepage: text("homepage"),
  license: text("license"),
  supports: text("supports"),
  usageText: text("usage_text"),
  manifestJson: text("manifest_json").notNull(),
  portfileText: text("portfile_text"),
  sourceUrl: text("source_url"),
  vcpkgTreeSha: text("vcpkg_tree_sha"),
  vcpkgUpdatedAt: text("vcpkg_updated_at"),
  createdInRegistryAt: text("created_in_registry_at"),
  updatedInRegistryAt: text("updated_in_registry_at"),
  registrySnapshotId: integer("registry_snapshot_id").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const portFeatures = sqliteTable("port_features", {
  portName: text("port_name").notNull().references(() => ports.name),
  featureName: text("feature_name").notNull(),
  description: text("description"),
  dependenciesJson: text("dependencies_json"),
  supports: text("supports"),
  defaultFeature: integer("default_feature", { mode: "boolean" }).default(false),
}, (t) => ({
  pk: primaryKey({ columns: [t.portName, t.featureName] }),
}));

export const portDependencies = sqliteTable("port_dependencies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  portName: text("port_name").notNull().references(() => ports.name),
  dependencyName: text("dependency_name").notNull(),
  featuresJson: text("features_json"),
  defaultFeatures: integer("default_features", { mode: "boolean" }),
  platform: text("platform"),
  host: integer("host", { mode: "boolean" }).default(false),
  dependencyType: text("dependency_type"),
  source: text("source").notNull().default("manifest"),
  featureName: text("feature_name"),
});

export const portVersions = sqliteTable("port_versions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  portName: text("port_name").notNull().references(() => ports.name),
  version: text("version").notNull(),
  portVersion: integer("port_version"),
  gitTree: text("git_tree"),
  versionDate: text("version_date"),
  registryCommit: text("registry_commit"),
  publishedAt: text("published_at"),
});

export const portFiles = sqliteTable("port_files", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  portName: text("port_name").notNull().references(() => ports.name),
  fileType: text("file_type").notNull(),
  path: text("path").notNull(),
  content: text("content"),
  sizeBytes: integer("size_bytes"),
  sha256: text("sha256"),
  updatedAt: text("updated_at").notNull(),
});

export const historicalPortSnapshots = sqliteTable("historical_port_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  portName: text("port_name").notNull().references(() => ports.name),
  version: text("version").notNull(),
  portVersion: integer("port_version").notNull().default(0),
  gitTree: text("git_tree").notNull().unique(),
  manifestJson: text("manifest_json").notNull(),
  usageText: text("usage_text"),
  description: text("description"),
  homepage: text("homepage"),
  license: text("license"),
  supports: text("supports"),
  dependenciesJson: text("dependencies_json").notNull(),
  featuresJson: text("features_json").notNull(),
  filesJson: text("files_json").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const tripletSupport = sqliteTable("triplet_support", {
  portName: text("port_name").notNull().references(() => ports.name),
  triplet: text("triplet").notNull(),
  supported: integer("supported", { mode: "boolean" }).notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.portName, t.triplet] }),
}));

export const upstreamRepositories = sqliteTable("upstream_repositories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  portName: text("port_name").notNull().unique().references(() => ports.name),
  provider: text("provider").notNull(),
  owner: text("owner"),
  repo: text("repo"),
  repoUrl: text("repo_url").notNull(),
  detectedFrom: text("detected_from").notNull(),
  confidence: integer("confidence").notNull(),
  stars: integer("stars"),
  forks: integer("forks"),
  openIssues: integer("open_issues"),
  openPrs: integer("open_prs"),
  closedIssues30d: integer("closed_issues_30d"),
  mergedPrs30d: integer("merged_prs_30d"),
  defaultBranch: text("default_branch"),
  repoCreatedAt: text("repo_created_at"),
  repoUpdatedAt: text("repo_updated_at"),
  homepageUrl: text("homepage_url"),
  licenseSpdxId: text("license_spdx_id"),
  licenseName: text("license_name"),
  primaryLanguage: text("primary_language"),
  primaryLanguageColor: text("primary_language_color"),
  topicsJson: text("topics_json"),
  latestReleaseTag: text("latest_release_tag"),
  latestReleasePublishedAt: text("latest_release_published_at"),
  latestReleaseUrl: text("latest_release_url"),
  latestReleaseIsDraft: integer("latest_release_is_draft", { mode: "boolean" }),
  latestReleaseIsPrerelease: integer("latest_release_is_prerelease", { mode: "boolean" }),
  pushedAt: text("pushed_at"),
  lastCommitAt: text("last_commit_at"),
  archived: integer("archived", { mode: "boolean" }),
  disabled: integer("disabled", { mode: "boolean" }),
  readmeMarkdown: text("readme_markdown"),
  readmeSummary: text("readme_summary"),
  repoEtag: text("repo_etag"),
  readmeEtag: text("readme_etag"),
  issuesEtag: text("issues_etag"),
  lastSuccessfulRefreshAt: text("last_successful_refresh_at"),
  lastFailedRefreshAt: text("last_failed_refresh_at"),
  refreshError: text("refresh_error"),
  refreshedAt: text("refreshed_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const upstreamIssues = sqliteTable("upstream_issues", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  upstreamId: integer("upstream_id").notNull().references(() => upstreamRepositories.id),
  providerIssueId: text("provider_issue_id"),
  number: integer("number"),
  title: text("title").notNull(),
  url: text("url").notNull(),
  state: text("state"),
  comments: integer("comments"),
  reactions: integer("reactions"),
  bodyText: text("body_text"),
  labelsJson: text("labels_json"),
  updatedAt: text("updated_at"),
  createdAt: text("created_at"),
  capturedAt: text("captured_at").notNull(),
});

export const maintenanceScores = sqliteTable("maintenance_scores", {
  portName: text("port_name").primaryKey().references(() => ports.name),
  score: integer("score"),
  label: text("label").notNull(),
  recencyScore: integer("recency_score"),
  issueScore: integer("issue_score"),
  prScore: integer("pr_score"),
  backlogScore: integer("backlog_score"),
  popularityScore: integer("popularity_score"),
  vcpkgScore: integer("vcpkg_score"),
  reasonJson: text("reason_json").notNull(),
  computedAt: text("computed_at").notNull(),
});

export const portPatchStats = sqliteTable("port_patch_stats", {
  portName: text("port_name").primaryKey().references(() => ports.name),
  patchCount: integer("patch_count").notNull(),
  patchBytesTotal: integer("patch_bytes_total").notNull(),
  declaredPatchCount: integer("declared_patch_count").notNull(),
  burdenLabel: text("burden_label").notNull(),
  patchFilesJson: text("patch_files_json").notNull(),
  unreferencedPatchFilesJson: text("unreferenced_patch_files_json"),
  missingPatchFilesJson: text("missing_patch_files_json"),
  updatedAt: text("updated_at").notNull(),
});

export const portSourceProvenance = sqliteTable("port_source_provenance", {
  portName: text("port_name").primaryKey().references(() => ports.name),
  provider: text("provider").notNull(),
  sourceUrl: text("source_url"),
  normalizedRepoUrl: text("normalized_repo_url"),
  ref: text("ref"),
  refKind: text("ref_kind"),
  quality: text("quality").notNull(),
  isExact: integer("is_exact", { mode: "boolean" }).notNull(),
  confidence: integer("confidence").notNull(),
  detectedFrom: text("detected_from").notNull(),
  reason: text("reason").notNull(),
  referenceUrl: text("reference_url"),
  updatedAt: text("updated_at").notNull(),
});

export const portRegistryStats = sqliteTable("port_registry_stats", {
  portName: text("port_name").primaryKey().references(() => ports.name),
  currentVersionPublishedAt: text("current_version_published_at"),
  lastChangedAt: text("last_changed_at"),
  churn30d: integer("churn_30d").notNull(),
  churn90d: integer("churn_90d").notNull(),
  churn365d: integer("churn_365d").notNull(),
  sameVersionPortBumps: integer("same_version_port_bumps"),
  updatedAt: text("updated_at").notNull(),
}, (table) => ({
  churn90dIdx: index("idx_port_registry_stats_churn_90d_port_name").on(table.churn90d, table.portName),
}));

export const packagingRiskScores = sqliteTable("packaging_risk_scores", {
  portName: text("port_name").primaryKey().references(() => ports.name),
  score: integer("score").notNull(),
  label: text("label").notNull(),
  reasonsJson: text("reasons_json").notNull(),
  componentsJson: text("components_json").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => ({
  scoreIdx: index("idx_packaging_risk_scores_score_port_name").on(table.score, table.portName),
}));

export const jobRuns = sqliteTable("job_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobName: text("job_name").notNull(),
  status: text("status").notNull(),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
  progressCurrent: integer("progress_current").default(0),
  progressTotal: integer("progress_total").default(0),
  message: text("message"),
  errorJson: text("error_json"),
});

export const jobState = sqliteTable("job_state", {
  jobName: text("job_name").primaryKey(),
  cursorJson: text("cursor_json").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const jobLocks = sqliteTable("job_locks", {
  jobName: text("job_name").primaryKey(),
  lockedBy: text("locked_by").notNull(),
  lockedAt: text("locked_at").notNull(),
  expiresAt: text("expires_at").notNull(),
});

export const httpCache = sqliteTable("http_cache", {
  cacheKey: text("cache_key").primaryKey(),
  etag: text("etag"),
  lastModified: text("last_modified"),
  status: integer("status"),
  bodyJson: text("body_json"),
  fetchedAt: text("fetched_at").notNull(),
});

export const ENABLE_WAL = sql`PRAGMA journal_mode = WAL`;
export const SET_BUSY_TIMEOUT = sql`PRAGMA busy_timeout = 5000`;
export const SET_FOREIGN_KEYS = sql`PRAGMA foreign_keys = ON`;
export const SET_SYNC_NORMAL = sql`PRAGMA synchronous = NORMAL`;
