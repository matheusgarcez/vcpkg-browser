import { Type, type TSchema } from "@sinclair/typebox";

export const PortSummarySchema = Type.Object({
  name: Type.String(),
  version: Type.String(),
  description: Type.Optional(Type.String()),
  license: Type.Optional(Type.String()),
  supports: Type.Optional(Type.String()),
  updatedAt: Type.Optional(Type.String()),
  createdInRegistryAt: Type.Optional(Type.String()),
  updatedInRegistryAt: Type.Optional(Type.String()),
  featureCount: Type.Optional(Type.Number()),
  dependencyCount: Type.Optional(Type.Number()),
  hostDependencyCount: Type.Optional(Type.Number()),
  patchCount: Type.Optional(Type.Number()),
  packagingRiskScore: Type.Optional(Type.Number()),
  packagingRiskLabel: Type.Optional(Type.String()),
  churn90d: Type.Optional(Type.Number()),
  upstream: Type.Optional(
    Type.Object({
      provider: Type.String(),
      repo: Type.Optional(Type.String()),
      url: Type.String(),
      stars: Type.Optional(Type.Number()),
      lastCommitAt: Type.Optional(Type.String()),
    })
  ),
  maintenance: Type.Object({
    label: Type.String(),
    score: Type.Optional(Type.Number()),
  }),
});

export const PortsResponseSchema = Type.Object({
  items: Type.Array(PortSummarySchema),
  page: Type.Number(),
  pageSize: Type.Number(),
  total: Type.Number(),
});

export const PortsQuerySchema = Type.Object({
  q: Type.Optional(Type.String()),
  sort: Type.Optional(Type.String()),
  dir: Type.Optional(Type.String()),
  page: Type.Optional(Type.String()),
  pageSize: Type.Optional(Type.String()),
});

export const PortNameParamsSchema = Type.Object({
  name: Type.String(),
});

export const DependencySchema = Type.Object({
  name: Type.String(),
  features: Type.Optional(Type.Array(Type.String())),
  defaultFeatures: Type.Optional(Type.Boolean()),
  platform: Type.Optional(Type.String()),
  host: Type.Optional(Type.Boolean()),
  dependencyType: Type.Optional(Type.String()),
});

export const FeatureSchema = Type.Object({
  name: Type.String(),
  description: Type.Optional(Type.String()),
  dependencies: Type.Optional(Type.Array(Type.Any())),
});

export const VersionSchema = Type.Object({
  version: Type.String(),
  portVersion: Type.Optional(Type.Number()),
  gitTree: Type.Optional(Type.String()),
  date: Type.Optional(Type.String()),
});

export const PortFileSchema = Type.Object({
  path: Type.String(),
  content: Type.String(),
});

export const UpstreamSchema = Type.Object({
  provider: Type.String(),
  owner: Type.Optional(Type.String()),
  repo: Type.Optional(Type.String()),
  url: Type.String(),
  stars: Type.Optional(Type.Number()),
  forks: Type.Optional(Type.Number()),
  openIssues: Type.Optional(Type.Number()),
  openPrs: Type.Optional(Type.Number()),
  lastCommitAt: Type.Optional(Type.String()),
  refreshedAt: Type.Optional(Type.String()),
});

export const MaintenanceSchema = Type.Object({
  score: Type.Optional(Type.Number()),
  label: Type.String(),
  reasons: Type.Array(Type.String()),
  confidence: Type.Optional(Type.Number()),
  components: Type.Optional(Type.Array(Type.Any())),
});

export const DependencySummarySchema = Type.Object({
  totalCount: Type.Number(),
  hostCount: Type.Number(),
  targetCount: Type.Number(),
});

export const PatchStatsSchema = Type.Object({
  patchCount: Type.Number(),
  patchBytesTotal: Type.Number(),
  declaredPatchCount: Type.Number(),
  burdenLabel: Type.String(),
  patchFiles: Type.Array(Type.Object({
    path: Type.String(),
    sizeBytes: Type.Optional(Type.Number()),
  })),
  unreferencedPatchFiles: Type.Optional(Type.Array(Type.String())),
  missingPatchFiles: Type.Optional(Type.Array(Type.String())),
});

export const SourceProvenanceSchema = Type.Object({
  provider: Type.String(),
  sourceUrl: Type.Optional(Type.String()),
  normalizedRepoUrl: Type.Optional(Type.String()),
  ref: Type.Optional(Type.String()),
  refKind: Type.Optional(Type.String()),
  quality: Type.String(),
  isExact: Type.Boolean(),
  confidence: Type.Number(),
  detectedFrom: Type.String(),
  reason: Type.String(),
  referenceUrl: Type.Optional(Type.String()),
});

export const RegistryStatsSchema = Type.Object({
  currentVersionPublishedAt: Type.Optional(Type.String()),
  currentVersionAgeDays: Type.Optional(Type.Number()),
  lastChangedAt: Type.Optional(Type.String()),
  lastChangedAgeDays: Type.Optional(Type.Number()),
  churn30d: Type.Number(),
  churn90d: Type.Number(),
  churn365d: Type.Number(),
  sameVersionPortBumps: Type.Optional(Type.Number()),
});

export const PackagingRiskSchema = Type.Object({
  score: Type.Number(),
  label: Type.String(),
  reasons: Type.Array(Type.String()),
  components: Type.Array(Type.Object({
    key: Type.String(),
    label: Type.String(),
    points: Type.Number(),
    max: Type.Number(),
  })),
});

export const PortDetailSchema = Type.Object({
  name: Type.String(),
  displayName: Type.Optional(Type.String()),
  version: Type.String(),
  portVersion: Type.Optional(Type.Number()),
  view: Type.Optional(Type.String()),
  selectedVersion: Type.Optional(Type.Object({
    version: Type.String(),
    portVersion: Type.Optional(Type.Number()),
    gitTree: Type.Optional(Type.String()),
  })),
  description: Type.Optional(Type.String()),
  homepage: Type.Optional(Type.String()),
  license: Type.Optional(Type.String()),
  supports: Type.Optional(Type.String()),
  usage: Type.Optional(Type.String()),
  manifest: Type.Any(),
  versionsPath: Type.Optional(Type.String()),
  vcpkgUpdatedAt: Type.Optional(Type.String()),
  createdInRegistryAt: Type.Optional(Type.String()),
  updatedInRegistryAt: Type.Optional(Type.String()),
  registryCommit: Type.Optional(Type.String()),
  dependencies: Type.Array(DependencySchema),
  dependencySummary: Type.Optional(DependencySummarySchema),
  features: Type.Array(FeatureSchema),
  versions: Type.Array(VersionSchema),
  files: Type.Array(Type.Any()),
  patching: Type.Optional(PatchStatsSchema),
  sourceProvenance: Type.Optional(SourceProvenanceSchema),
  registryStats: Type.Optional(RegistryStatsSchema),
  upstream: Type.Optional(UpstreamSchema),
  maintenance: MaintenanceSchema,
  packagingRisk: Type.Optional(PackagingRiskSchema),
});

export const MetaResponseSchema = Type.Object({
  portsCount: Type.Number(),
  featuresCount: Type.Number(),
  registryCommit: Type.String(),
  registryUpdatedAt: Type.String(),
  lastSuccessfulSyncAt: Type.Optional(Type.String()),
  latestRelease: Type.Optional(
    Type.Object({
      version: Type.String(),
      publishedAt: Type.String(),
    })
  ),
});

export const TripletResponseSchema = Type.Object({
  triplets: Type.Array(
    Type.Object({
      triplet: Type.String(),
      ports: Type.Number(),
    })
  ),
});

export const JobRunSchema = Type.Object({
  id: Type.Number(),
  jobName: Type.String(),
  status: Type.String(),
  startedAt: Type.String(),
  finishedAt: Type.Optional(Type.String()),
  progressCurrent: Type.Number(),
  progressTotal: Type.Number(),
  message: Type.Optional(Type.String()),
  error: Type.Optional(Type.String()),
});

export const JobRunListSchema = Type.Object({
  items: Type.Array(JobRunSchema),
  total: Type.Number(),
});
