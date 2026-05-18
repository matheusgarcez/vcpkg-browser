import { describe, expect, it } from "vitest";
import { computeMaintenanceScore, type ScoreBaselines } from "./maintenance-score.js";

const baselines: ScoreBaselines = {
  asOf: new Date("2026-05-18T00:00:00Z"),
  starsP95: 10_000,
  forksP95: 2_000,
  trustWindowedCounts: true,
};

function componentPoints(score: ReturnType<typeof computeMaintenanceScore>, key: string): number {
  return component(score, key).points;
}

function component(score: ReturnType<typeof computeMaintenanceScore>, key: string) {
  const component = score.components?.find((entry) => entry.key === key);
  if (!component) {
    throw new Error(`Missing component ${key}`);
  }
  return component;
}

describe("computeMaintenanceScore", () => {
  it("treats a fixed PR backlog more gently when total PR volume is much larger", () => {
    const smallerRepo = computeMaintenanceScore({
      lastCommitAt: "2026-05-17T12:00:00Z",
      openPRs: 30,
      totalPRs: 60,
      mergedPRs30d: 1,
      stars: 500,
      forks: 50,
    }, baselines);

    const largerRepo = computeMaintenanceScore({
      lastCommitAt: "2026-05-17T12:00:00Z",
      openPRs: 30,
      totalPRs: 3_000,
      mergedPRs30d: 1,
      stars: 500,
      forks: 50,
    }, baselines);

    expect(componentPoints(largerRepo, "open_pr_backlog"))
      .toBeGreaterThan(componentPoints(smallerRepo, "open_pr_backlog"));
  });

  it("rewards backlogs that are moving relative to recent PR throughput", () => {
    const stalled = computeMaintenanceScore({
      lastCommitAt: "2026-05-17T12:00:00Z",
      openPRs: 30,
      totalPRs: 3_000,
      mergedPRs30d: 1,
      stars: 500,
      forks: 50,
    }, baselines);

    const moving = computeMaintenanceScore({
      lastCommitAt: "2026-05-17T12:00:00Z",
      openPRs: 30,
      totalPRs: 3_000,
      mergedPRs30d: 15,
      stars: 500,
      forks: 50,
    }, baselines);

    expect(componentPoints(moving, "open_pr_backlog"))
      .toBeGreaterThan(componentPoints(stalled, "open_pr_backlog"));
  });

  it("uses total issue volume when judging issue backlog pressure", () => {
    const smallerRepo = computeMaintenanceScore({
      lastCommitAt: "2026-05-17T12:00:00Z",
      openIssues: 8,
      totalIssues: 20,
      closedIssues30d: 32,
      stars: 500,
      forks: 50,
    }, baselines);

    const largerRepo = computeMaintenanceScore({
      lastCommitAt: "2026-05-17T12:00:00Z",
      openIssues: 8,
      totalIssues: 1_000,
      closedIssues30d: 32,
      stars: 500,
      forks: 50,
    }, baselines);

    expect(componentPoints(largerRepo, "open_issue_backlog"))
      .toBeGreaterThan(componentPoints(smallerRepo, "open_issue_backlog"));
  });

  it("distinguishes low-volume and high-volume PR responsiveness with the same raw ratio", () => {
    const lowVolume = computeMaintenanceScore({
      lastCommitAt: "2026-05-17T12:00:00Z",
      openPRs: 1,
      mergedPRs30d: 1,
      stars: 500,
      forks: 50,
    }, baselines);

    const highVolume = computeMaintenanceScore({
      lastCommitAt: "2026-05-17T12:00:00Z",
      openPRs: 40,
      mergedPRs30d: 40,
      stars: 500,
      forks: 50,
    }, baselines);

    expect(componentPoints(highVolume, "pr_responsiveness"))
      .toBeGreaterThan(componentPoints(lowVolume, "pr_responsiveness"));
  });

  it("treats repos without observed GitHub PR workflow as neutral instead of zeroing PR activity", () => {
    const score = computeMaintenanceScore({
      lastCommitAt: "2026-05-17T12:00:00Z",
      openIssues: 0,
      totalIssues: 1,
      issuesEnabled: true,
      closedIssues30d: 0,
      openPRs: 0,
      totalPRs: 0,
      pullRequestsEnabled: true,
      mergedPRs30d: 0,
      stars: 500,
      forks: 50,
    }, baselines);

    expect(componentPoints(score, "merged_prs_30d")).toBe(9);
    expect(componentPoints(score, "open_pr_backlog")).toBe(2.5);
    expect(componentPoints(score, "pr_responsiveness")).toBe(1.5);
    expect(component(score, "merged_prs_30d").available).toBe(true);
    expect(component(score, "open_pr_backlog").available).toBe(true);
    expect(component(score, "pr_responsiveness").available).toBe(true);
    expect(score.confidence).toBe(100);
    expect(score.reasons).toContain(
      "PR score neutral: GitHub pull requests not used",
    );
  });

  it("treats repos without GitHub issues workflow as neutral instead of zeroing issue activity", () => {
    const score = computeMaintenanceScore({
      lastCommitAt: "2026-05-17T12:00:00Z",
      openIssues: 0,
      totalIssues: 0,
      issuesEnabled: false,
      closedIssues30d: 0,
      openPRs: 0,
      totalPRs: 1,
      pullRequestsEnabled: true,
      mergedPRs30d: 0,
      stars: 500,
      forks: 50,
    }, baselines);

    expect(componentPoints(score, "closed_issues_30d")).toBe(3.5);
    expect(componentPoints(score, "open_issue_backlog")).toBe(2.5);
    expect(componentPoints(score, "issue_responsiveness")).toBe(0.5);
    expect(component(score, "closed_issues_30d").available).toBe(true);
    expect(component(score, "open_issue_backlog").available).toBe(true);
    expect(component(score, "issue_responsiveness").available).toBe(true);
    expect(score.confidence).toBe(100);
    expect(score.reasons).toContain(
      "Issue score neutral: GitHub Issues disabled",
    );
  });

  it("gives maintained large-scale projects an extra popularity lift", () => {
    const smaller = computeMaintenanceScore({
      lastCommitAt: "2026-05-17T12:00:00Z",
      openIssues: 20,
      totalIssues: 500,
      closedIssues30d: 25,
      openPRs: 8,
      totalPRs: 400,
      mergedPRs30d: 12,
      stars: 2_000,
      forks: 250,
    }, baselines);

    const larger = computeMaintenanceScore({
      lastCommitAt: "2026-05-17T12:00:00Z",
      openIssues: 20,
      totalIssues: 500,
      closedIssues30d: 25,
      openPRs: 8,
      totalPRs: 400,
      mergedPRs30d: 12,
      stars: 50_000,
      forks: 8_000,
    }, baselines);

    expect(componentPoints(larger, "project_scale")).toBeGreaterThan(0);
    expect(componentPoints(smaller, "project_scale")).toBe(0);
    expect(larger.score ?? 0).toBeGreaterThan(smaller.score ?? 0);
  });

  it("does not award the scale bonus to dormant repos", () => {
    const score = computeMaintenanceScore({
      lastCommitAt: "2022-05-17T12:00:00Z",
      openIssues: 0,
      totalIssues: 1_000,
      closedIssues30d: 0,
      openPRs: 0,
      totalPRs: 1_000,
      mergedPRs30d: 0,
      stars: 50_000,
      forks: 8_000,
    }, baselines);

    expect(componentPoints(score, "project_scale")).toBe(0);
  });
});
