import type { PackagingRiskComponentDto, PackagingRiskDto, PortPatchStatsDto, SourceProvenanceDto } from "@pkg/shared";

export type PackagingRiskInputs = {
  patching?: Pick<PortPatchStatsDto, "patchCount" | "burdenLabel"> | null;
  sourceProvenance?: Pick<SourceProvenanceDto, "quality"> | null;
  dependencyCount?: number | null;
  hostDependencyCount?: number | null;
  churn90d?: number | null;
};

type StoredPackagingRiskDetails = Pick<PackagingRiskDto, "reasons" | "components">;

const PATCH_POINTS: Record<NonNullable<PackagingRiskInputs["patching"]>["burdenLabel"], number> = {
  none: 0,
  light: 8,
  moderate: 18,
  heavy: 30,
};

const PROVENANCE_POINTS: Record<NonNullable<PackagingRiskInputs["sourceProvenance"]>["quality"], number> = {
  "exact-commit": 0,
  "exact-tag": 0,
  "release-asset": 4,
  "archive-ref": 8,
  "branch-ref": 18,
  "url-only": 22,
  unknown: 15,
};

export function computePackagingRisk(input: PackagingRiskInputs): PackagingRiskDto {
  const dependencyCount = safeNumber(input.dependencyCount);
  const hostDependencyCount = safeNumber(input.hostDependencyCount);
  const churn90d = safeNumber(input.churn90d);
  const patchCount = safeNumber(input.patching?.patchCount);
  const burdenLabel = input.patching?.burdenLabel ?? "none";
  const sourceQuality = input.sourceProvenance?.quality ?? "unknown";

  const components: PackagingRiskComponentDto[] = [
    makeComponent("patch_burden", "Patch burden", PATCH_POINTS[burdenLabel], 30),
    makeComponent("source_provenance", "Source tracking", PROVENANCE_POINTS[sourceQuality], 25),
    makeComponent("dependency_complexity", "Dependency complexity", dependencyComplexityPoints(dependencyCount), 15),
    makeComponent("host_dependency_complexity", "Host dependency complexity", hostDependencyPoints(hostDependencyCount), 10),
    makeComponent("change_churn", "Registry churn (90d)", churnPoints(churn90d), 10),
    makeComponent("metadata_penalty", "Metadata / legacy penalties", 0, 10),
  ];

  const score = Math.max(0, Math.min(100, Math.round(components.reduce((sum, component) => sum + component.points, 0))));

  return {
    score,
    label: labelForScore(score),
    reasons: buildReasons({
      patchCount,
      burdenLabel,
      sourceQuality,
      hostDependencyCount,
      churn90d,
      dependencyCount,
      components,
    }),
    components,
  };
}

export function serializePackagingRiskDetails(score: PackagingRiskDto): { reasonsJson: string; componentsJson: string } {
  return {
    reasonsJson: JSON.stringify(score.reasons ?? []),
    componentsJson: JSON.stringify(score.components ?? []),
  };
}

export function parsePackagingRiskDetails(
  reasonsJson?: string | null,
  componentsJson?: string | null,
): StoredPackagingRiskDetails {
  return {
    reasons: parseStringArray(reasonsJson),
    components: parseComponents(componentsJson),
  };
}

function buildReasons(args: {
  patchCount: number;
  burdenLabel: NonNullable<PackagingRiskInputs["patching"]>["burdenLabel"];
  sourceQuality: NonNullable<PackagingRiskInputs["sourceProvenance"]>["quality"];
  hostDependencyCount: number;
  churn90d: number;
  dependencyCount: number;
  components: PackagingRiskComponentDto[];
}): string[] {
  const reasons: string[] = [];

  if (componentPoints(args.components, "patch_burden") > 0) {
    reasons.push(`${args.patchCount} patch file${args.patchCount === 1 ? "" : "s"}`);
  }

  if (componentPoints(args.components, "source_provenance") > 0) {
    reasons.push(sourceQualityReason(args.sourceQuality));
  }

  if (componentPoints(args.components, "host_dependency_complexity") > 0) {
    reasons.push(`${args.hostDependencyCount} host dependenc${args.hostDependencyCount === 1 ? "y" : "ies"}`);
  }

  if (componentPoints(args.components, "change_churn") > 0) {
    reasons.push(`${args.churn90d} registry change${args.churn90d === 1 ? "" : "s"} in 90 days`);
  }

  if (componentPoints(args.components, "dependency_complexity") > 0 && args.dependencyCount > 5) {
    reasons.push(`${args.dependencyCount} total dependencies`);
  }

  return reasons;
}

function sourceQualityReason(quality: NonNullable<PackagingRiskInputs["sourceProvenance"]>["quality"]): string {
  switch (quality) {
    case "release-asset":
      return "Source uses a release asset instead of a direct tag or commit pin";
    case "archive-ref":
      return "Source uses an archive ref instead of a direct tag or commit pin";
    case "branch-ref":
      return "Source uses a branch-like ref";
    case "url-only":
      return "Source uses a generic URL without an exact parseable ref";
    case "unknown":
    default:
      return "Source tracking could not be classified confidently";
  }
}

function dependencyComplexityPoints(count: number): number {
  if (count <= 5) return 0;
  if (count <= 10) return 5;
  if (count <= 20) return 10;
  return 15;
}

function hostDependencyPoints(count: number): number {
  if (count <= 0) return 0;
  if (count === 1) return 3;
  if (count <= 3) return 6;
  return 10;
}

function churnPoints(count: number): number {
  if (count <= 1) return 0;
  if (count <= 3) return 4;
  if (count <= 6) return 7;
  return 10;
}

function labelForScore(score: number): PackagingRiskDto["label"] {
  if (score >= 70) return "very-high";
  if (score >= 45) return "high";
  if (score >= 20) return "moderate";
  return "low";
}

function makeComponent(key: string, label: string, points: number, max: number): PackagingRiskComponentDto {
  return {
    key,
    label,
    points: Math.max(0, Math.min(max, Math.round(points))),
    max,
  };
}

function componentPoints(components: PackagingRiskComponentDto[], key: string): number {
  return components.find((component) => component.key === key)?.points ?? 0;
}

function safeNumber(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function parseStringArray(raw?: string | null): string[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function parseComponents(raw?: string | null): PackagingRiskComponentDto[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const value = item as Record<string, unknown>;

      if (
        typeof value.key !== "string"
        || typeof value.label !== "string"
        || typeof value.points !== "number"
        || typeof value.max !== "number"
      ) {
        return [];
      }

      return [{
        key: value.key,
        label: value.label,
        points: value.points,
        max: value.max,
      }];
    });
  } catch {
    return [];
  }
}
