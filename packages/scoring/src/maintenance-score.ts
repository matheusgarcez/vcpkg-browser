import type { MaintenanceComponentDto, MaintenanceDto } from "@pkg/shared";

type DateInput = string | Date | null | undefined;

export type MaintenanceInputs = {
  archived?: boolean | null;
  disabled?: boolean | null;
  lastCommitAt?: DateInput;
  pushedAt?: DateInput;
  refreshedAt?: DateInput;
  lastSuccessfulRefreshAt?: DateInput;
  openIssues?: number | null;
  totalIssues?: number | null;
  issuesEnabled?: boolean | null;
  closedIssues30d?: number | null;
  openPRs?: number | null;
  totalPRs?: number | null;
  pullRequestsEnabled?: boolean | null;
  mergedPRs30d?: number | null;
  stars?: number | null;
  forks?: number | null;
};

export type ScoreBaselines = {
  asOf: Date;
  starsP95: number;
  forksP95: number;
  trustWindowedCounts?: boolean;
};

type StoredMaintenanceDetails = Pick<MaintenanceDto, "reasons" | "confidence" | "components">;

const W = {
  recentCode: 28,
  mergedPRs30d: 18,
  closedIssues30d: 7,
  openPRBacklog: 5,
  openIssueBacklog: 5,
  prResponsiveness: 3,
  issueResponsiveness: 1,
  stars: 17,
  forks: 8,
  projectScale: 8,
} as const;

function makeComponent(
  key: string,
  label: string,
  max: number,
  available: boolean,
  points: number,
): MaintenanceComponentDto {
  return {
    key,
    label,
    max,
    available,
    points: round1(clamp(points, 0, max)),
  };
}

export function buildScoreBaselines(
  repos: MaintenanceInputs[],
  explicitAsOf?: Date,
  options?: { trustWindowedCounts?: boolean },
): ScoreBaselines {
  const dates = repos
    .flatMap((repo) => [
      parseDate(repo.lastSuccessfulRefreshAt),
      parseDate(repo.refreshedAt),
      parseDate(repo.lastCommitAt),
      parseDate(repo.pushedAt),
    ])
    .filter((date): date is Date => Boolean(date));

  const inferredAsOf =
    dates.length > 0
      ? new Date(Math.max(...dates.map((date) => date.getTime())))
      : new Date();

  const stars = repos.map((repo) => safeNumber(repo.stars)).filter((value) => value > 0);
  const forks = repos.map((repo) => safeNumber(repo.forks)).filter((value) => value > 0);

  return {
    asOf: explicitAsOf ?? inferredAsOf,
    starsP95: Math.max(100, percentile(stars, 0.95) ?? 100),
    forksP95: Math.max(20, percentile(forks, 0.95) ?? 20),
    trustWindowedCounts: options?.trustWindowedCounts ?? true,
  };
}

export function computeMaintenanceScore(
  input: MaintenanceInputs,
  baselines: ScoreBaselines,
): MaintenanceDto {
  if (input.archived) {
    return {
      score: 0,
      label: "archived",
      confidence: 100,
      components: [],
      reasons: ["Repository is archived"],
    };
  }

  if (input.disabled) {
    return {
      score: 0,
      label: "inactive",
      confidence: 100,
      components: [],
      reasons: ["Repository is disabled"],
    };
  }

  const trustWindowedCounts = baselines.trustWindowedCounts ?? true;
  const stars = safeNumber(input.stars);
  const forks = safeNumber(input.forks);
  const openIssues = safeNumber(input.openIssues);
  const totalIssues = safeNumber(input.totalIssues);
  const openPRs = safeNumber(input.openPRs);
  const totalPRs = safeNumber(input.totalPRs);
  const mergedPRs30d = safeNumber(input.mergedPRs30d);
  const closedIssues30d = safeNumber(input.closedIssues30d);
  const issueWorkflowNeutralReason = getWorkflowNeutralReason({
    enabled: input.issuesEnabled,
    total: input.totalIssues,
    open: input.openIssues,
    completed30d: input.closedIssues30d,
  });
  const prWorkflowNeutralReason = getWorkflowNeutralReason({
    enabled: input.pullRequestsEnabled,
    total: input.totalPRs,
    open: input.openPRs,
    completed30d: input.mergedPRs30d,
  });
  const issueSignalsApplicable = issueWorkflowNeutralReason == null;
  const prSignalsApplicable = prWorkflowNeutralReason == null;

  const codeActivityDate = maxDate(input.lastCommitAt, input.pushedAt);
  const codeAgeDays = codeActivityDate ? ageInDays(codeActivityDate, baselines.asOf) : null;
  const scaleEligible = qualifiesForScaleBonus({
    codeAgeDays,
    mergedPRs30d,
    closedIssues30d,
  });
  const projectScalePoints = scaleEligible ? W.projectScale * projectScaleScore(stars, forks) : 0;

  const components: MaintenanceComponentDto[] = [
    makeComponent(
      "recent_code",
      "Recent code activity",
      W.recentCode,
      Boolean(codeActivityDate),
      codeAgeDays == null ? 0 : W.recentCode * recencyScore(codeAgeDays),
    ),
    makeComponent(
      "merged_prs_30d",
      "Merged PRs in last 30 days",
      W.mergedPRs30d,
      !prSignalsApplicable || (trustWindowedCounts && input.mergedPRs30d != null),
      trustWindowedCounts && input.mergedPRs30d != null && prSignalsApplicable
        ? W.mergedPRs30d * saturatingCountScore(mergedPRs30d, 8)
        : !prSignalsApplicable
          ? W.mergedPRs30d * 0.5
        : 0,
    ),
    makeComponent(
      "closed_issues_30d",
      "Closed issues in last 30 days",
      W.closedIssues30d,
      !issueSignalsApplicable || (trustWindowedCounts && input.closedIssues30d != null),
      trustWindowedCounts && input.closedIssues30d != null && issueSignalsApplicable
        ? W.closedIssues30d * saturatingCountScore(closedIssues30d, 20)
        : !issueSignalsApplicable
          ? W.closedIssues30d * 0.5
        : 0,
    ),
    makeComponent(
      "open_pr_backlog",
      "Open PR backlog",
      W.openPRBacklog,
      !prSignalsApplicable || input.openPRs != null,
      prSignalsApplicable
        ? W.openPRBacklog * backlogScore({
        open: openPRs,
        total: input.totalPRs != null ? totalPRs : null,
        completed30d: trustWindowedCounts && input.mergedPRs30d != null ? mergedPRs30d : null,
        absoluteScore: absoluteOpenPRBacklogScore,
        })
        : W.openPRBacklog * 0.5,
    ),
    makeComponent(
      "open_issue_backlog",
      "Open issue backlog",
      W.openIssueBacklog,
      !issueSignalsApplicable || input.openIssues != null,
      issueSignalsApplicable
        ? W.openIssueBacklog * backlogScore({
        open: openIssues,
        total: input.totalIssues != null ? totalIssues : null,
        completed30d: trustWindowedCounts && input.closedIssues30d != null ? closedIssues30d : null,
        absoluteScore: absoluteOpenIssueBacklogScore,
        })
        : W.openIssueBacklog * 0.5,
    ),
    makeComponent(
      "pr_responsiveness",
      "PR responsiveness",
      W.prResponsiveness,
      !prSignalsApplicable
      || (input.openPRs != null && trustWindowedCounts && input.mergedPRs30d != null),
      input.openPRs != null && trustWindowedCounts && input.mergedPRs30d != null && prSignalsApplicable
        ? W.prResponsiveness * responsivenessScore(mergedPRs30d, openPRs, 8)
        : !prSignalsApplicable
          ? W.prResponsiveness * 0.5
        : 0,
    ),
    makeComponent(
      "issue_responsiveness",
      "Issue responsiveness",
      W.issueResponsiveness,
      !issueSignalsApplicable
      || (input.openIssues != null && trustWindowedCounts && input.closedIssues30d != null),
      input.openIssues != null && trustWindowedCounts && input.closedIssues30d != null && issueSignalsApplicable
        ? W.issueResponsiveness * responsivenessScore(closedIssues30d, openIssues, 20)
        : !issueSignalsApplicable
          ? W.issueResponsiveness * 0.5
        : 0,
    ),
    makeComponent(
      "stars",
      "Stars",
      W.stars,
      input.stars != null,
      W.stars * logAdoptionScore(stars, baselines.starsP95),
    ),
    makeComponent(
      "forks",
      "Forks",
      W.forks,
      input.forks != null,
      W.forks * logAdoptionScore(forks, baselines.forksP95),
    ),
    makeComponent(
      "project_scale",
      "Project scale",
      W.projectScale,
      input.stars != null || input.forks != null,
      projectScalePoints,
    ),
  ];

  let score = components.reduce((sum, component) => sum + component.points, 0);
  const availableWeight = components.reduce(
    (sum, component) => sum + (component.available ? component.max : 0),
    0,
  );

  const confidence = Math.round(clamp(availableWeight, 0, 100));

  if (confidence < 70) {
    score = Math.min(score, 69);
  }
  if (confidence < 50) {
    score = Math.min(score, 47);
  }

  const roundedScore = Math.round(clamp(score, 0, 100));

  return {
    score: roundedScore,
    label: labelForScore(roundedScore),
    confidence,
    components,
    reasons: buildReasons({
      trustWindowedCounts,
      codeAgeDays,
      mergedPRs30d,
      closedIssues30d,
      issueWorkflowNeutralReason,
      openIssues,
      openPRs,
      prWorkflowNeutralReason,
      projectScalePoints,
      stars,
      forks,
    }),
  };
}

export function getNoUpstreamScore(): MaintenanceDto {
  return {
    score: undefined,
    label: "unknown-upstream",
    confidence: 0,
    components: [],
    reasons: [
      "No upstream repository detected",
      "Using vcpkg metadata only",
    ],
  };
}

export function serializeMaintenanceDetails(score: MaintenanceDto): string {
  return JSON.stringify({
    reasons: score.reasons ?? [],
    confidence: typeof score.confidence === "number" ? score.confidence : null,
    components: score.components ?? [],
  });
}

export function parseMaintenanceDetails(raw?: string | null): StoredMaintenanceDetails {
  if (!raw) {
    return { reasons: [], confidence: undefined, components: [] };
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (Array.isArray(parsed)) {
      return {
        reasons: parsed.filter((value): value is string => typeof value === "string"),
        confidence: undefined,
        components: [],
      };
    }

    if (parsed && typeof parsed === "object") {
      const value = parsed as {
        reasons?: unknown;
        confidence?: unknown;
        components?: unknown;
      };

      return {
        reasons: Array.isArray(value.reasons)
          ? value.reasons.filter((item): item is string => typeof item === "string")
          : [],
        confidence: typeof value.confidence === "number" && Number.isFinite(value.confidence)
          ? value.confidence
          : undefined,
        components: Array.isArray(value.components)
          ? value.components.flatMap((component) => normalizeComponent(component) ?? [])
          : [],
      };
    }
  } catch {
    // Ignore malformed rows and fall back to an empty explanation.
  }

  return { reasons: [], confidence: undefined, components: [] };
}

function labelForScore(score: number): string {
  if (score >= 70) return "active";
  if (score >= 48) return "healthy";
  if (score >= 30) return "moderate";
  if (score >= 12) return "stale";
  return "inactive";
}

function recencyScore(ageDays: number): number {
  const days = Math.max(0, ageDays);

  if (days <= 14) return 1.0;
  if (days <= 45) return 0.9;
  if (days <= 90) return 0.75;
  if (days <= 180) return 0.55;
  if (days <= 365) return 0.3;
  if (days <= 730) return 0.12;
  return 0;
}

function saturatingCountScore(value: number, saturationPoint: number): number {
  if (value <= 0) return 0;
  return clamp(Math.log1p(value) / Math.log1p(Math.max(1, saturationPoint)), 0, 1);
}

function logAdoptionScore(value: number, p95: number): number {
  if (value <= 0) return 0;
  return clamp(Math.log1p(value) / Math.log1p(Math.max(1, p95)), 0, 1);
}

function absoluteOpenPRBacklogScore(openPRs: number): number {
  if (openPRs <= 0) return 1.0;
  if (openPRs <= 2) return 0.95;
  if (openPRs <= 5) return 0.8;
  if (openPRs <= 10) return 0.55;
  if (openPRs <= 25) return 0.3;
  return 0.1;
}

function absoluteOpenIssueBacklogScore(openIssues: number): number {
  if (openIssues <= 1) return 1.0;
  if (openIssues <= 5) return 0.85;
  if (openIssues <= 20) return 0.6;
  if (openIssues <= 50) return 0.35;
  return 0.15;
}

function backlogScore(input: {
  open: number;
  total: number | null;
  completed30d: number | null;
  absoluteScore: (open: number) => number;
}): number {
  const absolute = input.absoluteScore(input.open);
  const hasTotal = input.total != null;
  const hasThroughput = input.completed30d != null;

  if (!hasTotal && !hasThroughput) return absolute;

  const scores: Array<{ score: number; weight: number }> = [{ score: absolute, weight: 0.35 }];

  if (hasTotal) {
    scores.push({
      score: resolvedShareScore(input.open, input.total ?? 0),
      weight: hasThroughput ? 0.2 : 0.65,
    });
  }

  if (hasThroughput) {
    scores.push({
      score: backlogPressureScore(input.open, input.completed30d ?? 0),
      weight: hasTotal ? 0.45 : 0.65,
    });
  }

  return weightedAverage(scores);
}

function backlogPressureScore(open: number, completed30d: number): number {
  if (open <= 0) return 1;
  if (completed30d <= 0) return 0.05;

  const monthsOfBacklog = open / completed30d;
  return clamp(1 - (Math.log1p(monthsOfBacklog) / Math.log1p(12)), 0.05, 1);
}

function getWorkflowNeutralReason(input: {
  enabled: boolean | null | undefined;
  total: number | null | undefined;
  open: number | null | undefined;
  completed30d: number | null | undefined;
}): "disabled" | "unused" | null {
  if (input.enabled === false) return "disabled";

  if (input.total == null) return null;

  return safeNumber(input.total) > 0
    || safeNumber(input.open) > 0
    || safeNumber(input.completed30d) > 0
    ? null
    : "unused";
}

function resolvedShareScore(open: number, total: number): number {
  if (open <= 0) return 1;

  const totalWork = Math.max(open, total);
  if (totalWork <= 0) return 0;

  const openShare = clamp(open / totalWork, 0, 1);

  if (openShare <= 0.02) return 1.0;
  if (openShare <= 0.05) return 0.95;
  if (openShare <= 0.1) return 0.85;
  if (openShare <= 0.2) return 0.7;
  if (openShare <= 0.35) return 0.5;
  if (openShare <= 0.5) return 0.3;
  return 0.1;
}

function ratioOrPerfectIfNoWork(completed: number, open: number): number {
  if (completed <= 0 && open <= 0) return 1;
  return clamp(completed / Math.max(1, completed + open), 0, 1);
}

function responsivenessScore(completed30d: number, open: number, saturationPoint: number): number {
  const resolutionRatio = ratioOrPerfectIfNoWork(completed30d, open);
  const throughputScore = completed30d > 0 ? saturatingCountScore(completed30d, saturationPoint) : 0;
  return clamp((resolutionRatio * 0.7) + (throughputScore * 0.3), 0, 1);
}

function qualifiesForScaleBonus(input: {
  codeAgeDays: number | null;
  mergedPRs30d: number;
  closedIssues30d: number;
}): boolean {
  return (input.codeAgeDays != null && input.codeAgeDays <= 90)
    || input.mergedPRs30d > 0
    || input.closedIssues30d > 0;
}

function projectScaleScore(stars: number, forks: number): number {
  const starScore =
    stars >= 50_000 ? 1
      : stars >= 20_000 ? 0.8
        : stars >= 10_000 ? 0.6
          : 0;

  const forkScore =
    forks >= 10_000 ? 1
      : forks >= 5_000 ? 0.8
        : forks >= 2_500 ? 0.6
          : 0;

  return clamp((starScore * 0.75) + (forkScore * 0.25), 0, 1);
}

function weightedAverage(scores: Array<{ score: number; weight: number }>): number {
  const totalWeight = scores.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) return 0;

  const weightedSum = scores.reduce((sum, entry) => sum + (entry.score * entry.weight), 0);
  return clamp(weightedSum / totalWeight, 0, 1);
}

function buildReasons(input: {
  trustWindowedCounts: boolean;
  codeAgeDays: number | null;
  mergedPRs30d: number;
  closedIssues30d: number;
  issueWorkflowNeutralReason: "disabled" | "unused" | null;
  openIssues: number;
  openPRs: number;
  prWorkflowNeutralReason: "disabled" | "unused" | null;
  projectScalePoints: number;
  stars: number;
  forks: number;
}): string[] {
  const reasons: string[] = [];

  if (input.codeAgeDays != null) {
    if (input.codeAgeDays <= 14) {
      reasons.push("Very recent code activity");
    } else if (input.codeAgeDays <= 90) {
      reasons.push("Recent code activity");
    } else if (input.codeAgeDays > 365) {
      reasons.push("No recent code activity");
    }
  }

  if (input.prWorkflowNeutralReason === "disabled") {
    reasons.push("PR score neutral: GitHub pull requests disabled");
  } else if (input.prWorkflowNeutralReason === "unused") {
    reasons.push("PR score neutral: GitHub pull requests not used");
  } else if (input.trustWindowedCounts && input.mergedPRs30d > 0) {
    reasons.push(`${input.mergedPRs30d} merged PR(s) in the last 30 days`);
  }

  if (input.issueWorkflowNeutralReason === "disabled") {
    reasons.push("Issue score neutral: GitHub Issues disabled");
  } else if (input.issueWorkflowNeutralReason === "unused") {
    reasons.push("Issue score neutral: GitHub Issues not used");
  } else if (input.trustWindowedCounts && input.closedIssues30d > 0) {
    reasons.push(`${input.closedIssues30d} issue(s) closed in the last 30 days`);
  }

  if (input.openIssues > 20 || input.openPRs > 10) {
    reasons.push(`Large backlog: ${input.openIssues} open issue(s), ${input.openPRs} open PR(s)`);
  } else if (input.openIssues > 0 || input.openPRs > 0) {
    reasons.push(`Small backlog: ${input.openIssues} open issue(s), ${input.openPRs} open PR(s)`);
  } else {
    reasons.push("No open issue or PR backlog");
  }

  if (input.projectScalePoints >= W.projectScale * 0.75) {
    reasons.push("Exceptional adoption footprint");
  } else if (input.stars >= 100 || input.forks >= 20) {
    reasons.push("Established adoption footprint");
  } else if (input.stars > 0 || input.forks > 0) {
    reasons.push(`Small adoption footprint: ${input.stars} stars, ${input.forks} forks`);
  } else {
    reasons.push("No adoption data available");
  }

  return reasons;
}

function normalizeComponent(value: unknown): MaintenanceComponentDto | undefined {
  if (!value || typeof value !== "object") return undefined;

  const component = value as {
    key?: unknown;
    label?: unknown;
    max?: unknown;
    points?: unknown;
    available?: unknown;
  };

  if (
    typeof component.key !== "string" ||
    typeof component.label !== "string" ||
    typeof component.max !== "number" ||
    typeof component.points !== "number" ||
    typeof component.available !== "boolean"
  ) {
    return undefined;
  }

  return {
    key: component.key,
    label: component.label,
    max: component.max,
    points: component.points,
    available: component.available,
  };
}

function safeNumber(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function parseDate(value: DateInput): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value;
  }

  const trimmed = value.trim();
  const isoDateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (isoDateOnly) {
    const [, year, month, day] = isoDateOnly;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  }

  const ddmmyyyy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (ddmmyyyy) {
    const [, day, month, year] = ddmmyyyy;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function maxDate(...values: DateInput[]): Date | undefined {
  const dates = values.map(parseDate).filter((value): value is Date => Boolean(value));
  if (dates.length === 0) return undefined;
  return new Date(Math.max(...dates.map((date) => date.getTime())));
}

function ageInDays(date: Date, asOf: Date): number {
  const ms = asOf.getTime() - date.getTime();
  return Math.max(0, ms / 86_400_000);
}

function percentile(values: number[], q: number): number | undefined {
  const xs = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (xs.length === 0) return undefined;

  const pos = (xs.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);

  if (lo === hi) return xs[lo];

  const weight = pos - lo;
  return xs[lo] * (1 - weight) + xs[hi] * weight;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
