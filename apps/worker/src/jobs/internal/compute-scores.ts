import { getClient } from "@pkg/db";
import { maintenanceScores, upstreamRepositories } from "@pkg/db";
import { buildScoreBaselines, computeMaintenanceScore, serializeMaintenanceDetails } from "@pkg/scoring";
import type { MaintenanceInputs } from "@pkg/scoring";

type UpstreamRow = typeof upstreamRepositories.$inferSelect;

function toMaintenanceInput(upstream: UpstreamRow): MaintenanceInputs {
  return {
    archived: upstream.archived ?? undefined,
    disabled: upstream.disabled ?? undefined,
    lastCommitAt: upstream.lastCommitAt ?? undefined,
    pushedAt: upstream.pushedAt ?? undefined,
    refreshedAt: upstream.refreshedAt ?? undefined,
    lastSuccessfulRefreshAt: upstream.lastSuccessfulRefreshAt ?? undefined,
    openIssues: upstream.openIssues ?? undefined,
    totalIssues: upstream.totalIssues ?? undefined,
    issuesEnabled: upstream.issuesEnabled ?? undefined,
    closedIssues30d: upstream.closedIssues30d ?? undefined,
    openPRs: upstream.openPrs ?? undefined,
    totalPRs: upstream.totalPrs ?? undefined,
    pullRequestsEnabled: upstream.pullRequestsEnabled ?? undefined,
    mergedPRs30d: upstream.mergedPrs30d ?? undefined,
    stars: upstream.stars ?? undefined,
    forks: upstream.forks ?? undefined,
  };
}

function componentBucket(
  components: Array<{ key: string; points: number; available: boolean }> | undefined,
  keys: string[],
): number | null {
  if (!components) return null;
  const matches = components.filter((component) => keys.includes(component.key));
  if (matches.length === 0 || matches.every((component) => !component.available)) return null;
  return Math.round(matches.reduce((sum, component) => sum + component.points, 0));
}

export async function computeScoresStep() {
  const db = getClient();
  const allUpstreams = await db.select().from(upstreamRepositories);
  const inputs = allUpstreams.map(toMaintenanceInput);
  const baselines = buildScoreBaselines(inputs);
  const now = new Date().toISOString();

  for (let i = 0; i < allUpstreams.length; i++) {
    const upstream = allUpstreams[i];
    const input = inputs[i];
    const score = computeMaintenanceScore(input, baselines);

    await db.insert(maintenanceScores).values({
      portName: upstream.portName,
      score: score.score ?? null,
      label: score.label,
      recencyScore: componentBucket(score.components, ["recent_code"]),
      issueScore: componentBucket(score.components, ["closed_issues_30d", "issue_responsiveness"]),
      prScore: componentBucket(score.components, ["merged_prs_30d", "pr_responsiveness"]),
      backlogScore: componentBucket(score.components, ["open_pr_backlog", "open_issue_backlog"]),
      popularityScore: componentBucket(score.components, ["stars", "forks", "project_scale"]),
      vcpkgScore: null,
      reasonJson: serializeMaintenanceDetails(score),
      computedAt: now,
    }).onConflictDoUpdate({
      target: maintenanceScores.portName,
      set: {
        score: score.score ?? null,
        label: score.label,
        recencyScore: componentBucket(score.components, ["recent_code"]),
        issueScore: componentBucket(score.components, ["closed_issues_30d", "issue_responsiveness"]),
        prScore: componentBucket(score.components, ["merged_prs_30d", "pr_responsiveness"]),
        backlogScore: componentBucket(score.components, ["open_pr_backlog", "open_issue_backlog"]),
        popularityScore: componentBucket(score.components, ["stars", "forks", "project_scale"]),
        reasonJson: serializeMaintenanceDetails(score),
        computedAt: now,
      },
    });
  }

  console.log(`Scores computed for ${allUpstreams.length} repos`);
}
