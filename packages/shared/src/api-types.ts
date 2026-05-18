export type UpstreamProvider = "github" | "gitlab" | "bitbucket" | "sourceforge" | "git" | "url" | "unknown";

export type UpstreamDto = {
  provider: UpstreamProvider;
  owner?: string;
  repo?: string;
  url: string;
  stars?: number;
  forks?: number;
  openIssues?: number;
  openPrs?: number;
  closedIssues30d?: number;
  mergedPrs30d?: number;
  repoCreatedAt?: string;
  homepageUrl?: string;
  licenseSpdxId?: string;
  licenseName?: string;
  primaryLanguage?: string;
  primaryLanguageColor?: string;
  topics?: string[];
  latestReleaseTag?: string;
  latestReleasePublishedAt?: string;
  latestReleaseUrl?: string;
  latestReleaseIsDraft?: boolean;
  latestReleaseIsPrerelease?: boolean;
  latestTagName?: string;
  latestTagPublishedAt?: string;
  latestTagUrl?: string;
  lastCommitAt?: string;
  archived?: boolean;
  disabled?: boolean;
  readmeSummary?: string;
  readmeMarkdown?: string;
  lastSuccessfulRefreshAt?: string;
  lastFailedRefreshAt?: string;
  refreshedAt?: string;
  detectionConfidence?: number;
  detectionWarnings?: string[];
  topIssues?: Array<{
    number: number;
    title: string;
    url: string;
    state: string;
    comments: number;
    reactions?: number;
    createdAt?: string;
    updatedAt: string;
    bodyText?: string;
    labels?: Array<{
      name: string;
      color?: string;
      description?: string;
    }>;
  }>;
};

export type UpstreamDetection = {
  provider: UpstreamProvider;
  url?: string;
  owner?: string;
  repo?: string;
  detectedFrom: string;
  confidence: number;
  warnings: string[];
};

export type MaintenanceComponentDto = {
  key: string;
  label: string;
  max: number;
  points: number;
  available: boolean;
};

export type MaintenanceDto = {
  score?: number;
  label: string;
  reasons: string[];
  confidence?: number;
  components?: MaintenanceComponentDto[];
};

export type PortPatchStatsDto = {
  patchCount: number;
  patchBytesTotal: number;
  declaredPatchCount: number;
  burdenLabel: "none" | "light" | "moderate" | "heavy";
  patchFiles: Array<{
    path: string;
    sizeBytes?: number;
  }>;
  unreferencedPatchFiles?: string[];
  missingPatchFiles?: string[];
};

export type DependencySummaryDto = {
  totalCount: number;
  hostCount: number;
  targetCount: number;
};

export type SourceProvenanceDto = {
  provider: "github" | "gitlab" | "bitbucket" | "sourceforge" | "git" | "url" | "unknown";
  sourceUrl?: string;
  normalizedRepoUrl?: string;
  ref?: string;
  refKind?: "commit" | "tag" | "branch" | "release" | "archive" | "unknown";
  quality:
    | "exact-commit"
    | "exact-tag"
    | "release-asset"
    | "archive-ref"
    | "branch-ref"
    | "url-only"
    | "unknown";
  isExact: boolean;
  confidence: number;
  detectedFrom: string;
  reason: string;
  referenceUrl?: string;
};

export type RegistryStatsDto = {
  currentVersionPublishedAt?: string;
  currentVersionAgeDays?: number;
  lastChangedAt?: string;
  lastChangedAgeDays?: number;
  churn30d: number;
  churn90d: number;
  churn365d: number;
  sameVersionPortBumps?: number;
};

export type PackagingRiskComponentDto = {
  key: string;
  label: string;
  points: number;
  max: number;
};

export type PackagingRiskDto = {
  score: number;
  label: "low" | "moderate" | "high" | "very-high";
  reasons: string[];
  components: PackagingRiskComponentDto[];
};

export type PortSummaryDto = {
  name: string;
  version: string;
  description?: string;
  license?: string;
  supports?: string;
  updatedAt?: string;
  createdInRegistryAt?: string;
  updatedInRegistryAt?: string;
  featureCount?: number;
  dependencyCount?: number;
  hostDependencyCount?: number;
  patchCount?: number;
  packagingRiskScore?: number;
  packagingRiskLabel?: PackagingRiskDto["label"];
  churn90d?: number;
  upstream?: {
    provider: UpstreamProvider;
    repo?: string;
    url: string;
    stars?: number;
    lastCommitAt?: string;
  };
  maintenance: {
    label: string;
    score?: number;
  };
};

export type PortSummaryListDto = {
  items: PortSummaryDto[];
  page: number;
  pageSize: number;
  total: number;
};

export type DependencyDto = {
  name: string;
  features?: string[];
  defaultFeatures?: boolean;
  platform?: string;
  host?: boolean;
  dependencyType?: string;
  source?: string;
  featureName?: string;
};

export type DependencyRefDto = Omit<DependencyDto, "source" | "featureName">;

export type FeatureDto = {
  name: string;
  description?: string;
  dependencies?: DependencyRefDto[];
  supports?: string;
  defaultFeature?: boolean;
};

export type VersionDto = {
  version: string;
  portVersion?: number;
  gitTree?: string;
  date?: string;
  registryCommit?: string;
  publishedAt?: string;
};

export type PortFileDto = {
  id: number;
  fileType: string;
  path: string;
  content?: string;
  sizeBytes?: number;
  updatedAt: string;
};

export type PortDetailDto = {
  name: string;
  displayName?: string;
  version: string;
  portVersion?: number;
  view?: "current" | "historical";
  selectedVersion?: {
    version: string;
    portVersion?: number;
    gitTree?: string;
  };
  description?: string;
  homepage?: string;
  license?: string;
  supports?: string;
  usage?: string;
  manifest: unknown;
  versionsPath?: string;
  vcpkgUpdatedAt?: string;
  createdInRegistryAt?: string;
  updatedInRegistryAt?: string;
  registryCommit?: string;
  dependencies: DependencyDto[];
  dependencySummary?: DependencySummaryDto;
  features: FeatureDto[];
  versions: VersionDto[];
  files: PortFileDto[];
  patching?: PortPatchStatsDto;
  sourceProvenance?: SourceProvenanceDto;
  registryStats?: RegistryStatsDto;
  upstream?: UpstreamDto;
  maintenance: MaintenanceDto;
  packagingRisk?: PackagingRiskDto;
};

export type MetaResponse = {
  portsCount: number;
  featuresCount: number;
  registryCommit: string;
  registryUpdatedAt: string;
  latestRelease?: {
    version: string;
    publishedAt: string;
  };
  lastSuccessfulSyncAt?: string;
};

export type TripletItemDto = {
  triplet: string;
  ports: number;
};

export type TripletResponse = {
  triplets: TripletItemDto[];
};

export type ReleaseDto = {
  version: string;
  publishedAt: string;
  commitSha: string;
  portsCount: number;
  updatedPortsCount?: number;
  addedPortsCount?: number;
};

export type ReleaseListDto = {
  releases: ReleaseDto[];
};

export type SearchFilter =
  | { field: "repository"; op: "eq"; value: string }
  | { field: "stars"; op: "gt" | "gte" | "lt" | "lte"; value: number }
  | { field: "score"; op: "gt" | "gte" | "lt" | "lte"; value: number }
  | { field: "maintained"; op: "eq"; value: string }
  | { field: "license"; op: "eq"; value: string }
  | { field: "supports"; op: "eq"; value: string }
  | { field: "dependency"; op: "eq"; value: string }
  | { field: "feature"; op: "eq"; value: string }
  | { field: "has"; op: "eq"; value: "upstream" | "usage" | "features" | "host-deps" }
  | { field: "no"; op: "eq"; value: "upstream" }
  | { field: "risk"; op: "gt" | "gte" | "lt" | "lte"; value: number }
  | { field: "updated"; op: "gt" | "gte" | "lt" | "lte"; value: string };

export type SearchSort =
  | "relevance"
  | "name"
  | "recently-added"
  | "recently-updated"
  | "stars"
  | "score"
  | "packaging-risk"
  | "churn"
  | "last-upstream-commit"
  | "dependency-count"
  | "feature-count";

export type SearchSortDirection = "asc" | "desc";

export type SearchQuery = {
  text?: string;
  filters: SearchFilter[];
  sort?: SearchSort;
  sortDirection?: SearchSortDirection;
  page: number;
  pageSize: number;
};

export type JobRunDto = {
  id: number;
  jobName: string;
  status: "running" | "success" | "failed" | "cancelled";
  startedAt: string;
  finishedAt?: string;
  progressCurrent: number;
  progressTotal: number;
  message?: string;
  error?: string;
};

export type JobRunListDto = {
  items: JobRunDto[];
  total: number;
};

export type ApiError = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};
