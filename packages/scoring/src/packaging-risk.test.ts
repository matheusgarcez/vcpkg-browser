import { describe, expect, it } from "vitest";
import { computePackagingRisk, parsePackagingRiskDetails, serializePackagingRiskDetails } from "./packaging-risk";

describe("computePackagingRisk", () => {
  it("keeps exact-source low-complexity packages low risk", () => {
    const result = computePackagingRisk({
      patching: { patchCount: 0, burdenLabel: "none" },
      sourceProvenance: { quality: "exact-tag" },
      dependencyCount: 3,
      hostDependencyCount: 0,
      churn90d: 1,
    });

    expect(result.score).toBe(0);
    expect(result.label).toBe("low");
    expect(result.reasons).toEqual([]);
  });

  it("escalates heavy, weakly pinned packages", () => {
    const result = computePackagingRisk({
      patching: { patchCount: 7, burdenLabel: "heavy" },
      sourceProvenance: { quality: "url-only" },
      dependencyCount: 24,
      hostDependencyCount: 4,
      churn90d: 8,
    });

    expect(result.score).toBe(87);
    expect(result.label).toBe("very-high");
    expect(result.reasons).toContain("7 patch files");
    expect(result.reasons).toContain("4 host dependencies");
  });

  it("serializes and parses stored details", () => {
    const score = computePackagingRisk({
      patching: { patchCount: 3, burdenLabel: "moderate" },
      sourceProvenance: { quality: "archive-ref" },
      dependencyCount: 9,
      hostDependencyCount: 1,
      churn90d: 2,
    });

    const serialized = serializePackagingRiskDetails(score);
    const parsed = parsePackagingRiskDetails(serialized.reasonsJson, serialized.componentsJson);

    expect(parsed.reasons).toEqual(score.reasons);
    expect(parsed.components).toEqual(score.components);
  });
});
