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
  closedIssues30d?: number | null;
  openPRs?: number | null;
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
  recentCode: 30,
  mergedPRs30d: 18,
  closedIssues30d: 7,
  openPRBacklog: 7,
  openIssueBacklog: 7,
  prResponsiveness: 4,
  issueResponsiveness: 2,
  stars: 17,
  forks: 8,
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
  const openPRs = safeNumber(input.openPRs);
  const mergedPRs30d = safeNumber(input.mergedPRs30d);
  const closedIssues30d = safeNumber(input.closedIssues30d);

  const codeActivityDate = maxDate(input.lastCommitAt, input.pushedAt);
  const codeAgeDays = codeActivityDate ? ageInDays(codeActivityDate, baselines.asOf) : null;

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
      trustWindowedCounts && input.mergedPRs30d != null,
      trustWindowedCounts && input.mergedPRs30d != null
        ? W.mergedPRs30d * saturatingCountScore(mergedPRs30d, 8)
        : 0,
    ),
    makeComponent(
      "closed_issues_30d",
      "Closed issues in last 30 days",
      W.closedIssues30d,
      trustWindowedCounts && input.closedIssues30d != null,
      trustWindowedCounts && input.closedIssues30d != null
        ? W.closedIssues30d * saturatingCountScore(closedIssues30d, 20)
        : 0,
    ),
    makeComponent(
      "open_pr_backlog",
      "Open PR backlog",
      W.openPRBacklog,
      input.openPRs != null,
      W.openPRBacklog * openPRBacklogScore(openPRs),
    ),
    makeComponent(
      "open_issue_backlog",
      "Open issue backlog",
      W.openIssueBacklog,
      input.openIssues != null,
      W.openIssueBacklog * openIssueBacklogScore(openIssues),
    ),
    makeComponent(
      "pr_responsiveness",
      "PR responsiveness",
      W.prResponsiveness,
      input.openPRs != null && trustWindowedCounts && input.mergedPRs30d != null,
      input.openPRs != null && trustWindowedCounts && input.mergedPRs30d != null
        ? W.prResponsiveness * ratioOrPerfectIfNoWork(mergedPRs30d, openPRs)
        : 0,
    ),
    makeComponent(
      "issue_responsiveness",
      "Issue responsiveness",
      W.issueResponsiveness,
      input.openIssues != null && trustWindowedCounts && input.closedIssues30d != null,
      input.openIssues != null && trustWindowedCounts && input.closedIssues30d != null
        ? W.issueResponsiveness * ratioOrPerfectIfNoWork(closedIssues30d, openIssues)
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
      openIssues,
      openPRs,
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

function openPRBacklogScore(openPRs: number): number {
  if (openPRs <= 0) return 1.0;
  if (openPRs <= 2) return 0.95;
  if (openPRs <= 5) return 0.8;
  if (openPRs <= 10) return 0.55;
  if (openPRs <= 25) return 0.3;
  return 0.1;
}

function openIssueBacklogScore(openIssues: number): number {
  if (openIssues <= 1) return 1.0;
  if (openIssues <= 5) return 0.85;
  if (openIssues <= 20) return 0.6;
  if (openIssues <= 50) return 0.35;
  return 0.15;
}

function ratioOrPerfectIfNoWork(completed: number, open: number): number {
  if (completed <= 0 && open <= 0) return 1;
  return clamp(completed / Math.max(1, completed + open), 0, 1);
}

function buildReasons(input: {
  trustWindowedCounts: boolean;
  codeAgeDays: number | null;
  mergedPRs30d: number;
  closedIssues30d: number;
  openIssues: number;
  openPRs: number;
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

  if (input.trustWindowedCounts && input.mergedPRs30d > 0) {
    reasons.push(`${input.mergedPRs30d} merged PR(s) in the last 30 days`);
  }

  if (input.trustWindowedCounts && input.closedIssues30d > 0) {
    reasons.push(`${input.closedIssues30d} issue(s) closed in the last 30 days`);
  }

  if (input.openIssues > 20 || input.openPRs > 10) {
    reasons.push(`Large backlog: ${input.openIssues} open issue(s), ${input.openPRs} open PR(s)`);
  } else if (input.openIssues > 0 || input.openPRs > 0) {
    reasons.push(`Small backlog: ${input.openIssues} open issue(s), ${input.openPRs} open PR(s)`);
  } else {
    reasons.push("No open issue or PR backlog");
  }

  if (input.stars >= 100 || input.forks >= 20) {
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
