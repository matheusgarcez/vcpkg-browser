import { eq } from "drizzle-orm";
import { getClient } from "@pkg/db";
import { maintenanceScores, upstreamRepositories, ports } from "@pkg/db";
import { buildScoreBaselines, computeMaintenanceScore, getNoUpstreamScore, serializeMaintenanceDetails } from "@pkg/scoring";

type UpstreamRow = typeof upstreamRepositories.$inferSelect;

function toMaintenanceInput(upstream: UpstreamRow) {
  return {
    archived: upstream.archived ?? undefined,
    disabled: upstream.disabled ?? undefined,
    lastCommitAt: upstream.lastCommitAt ?? undefined,
    pushedAt: upstream.pushedAt ?? undefined,
    refreshedAt: upstream.refreshedAt ?? undefined,
    lastSuccessfulRefreshAt: upstream.lastSuccessfulRefreshAt ?? undefined,
    openIssues: upstream.openIssues ?? undefined,
    closedIssues30d: upstream.closedIssues30d ?? undefined,
    openPRs: upstream.openPrs ?? undefined,
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

export async function computeAndSaveScore(portName: string) {
  const db = getClient();

  const upstream = await db.select()
    .from(upstreamRepositories)
    .where(eq(upstreamRepositories.portName, portName))
    .limit(1)
    .then((r) => r[0] ?? null);

  if (!upstream) {
    const score = getNoUpstreamScore();
    await db.insert(maintenanceScores).values({
      portName,
      label: score.label,
      reasonJson: serializeMaintenanceDetails(score),
      computedAt: new Date().toISOString(),
    }).onConflictDoUpdate({
      target: maintenanceScores.portName,
      set: {
        label: score.label,
        reasonJson: serializeMaintenanceDetails(score),
        computedAt: new Date().toISOString(),
      },
    });
    return score;
  }

  const allUpstreams = await db.select().from(upstreamRepositories);
  const baselines = buildScoreBaselines(allUpstreams.map(toMaintenanceInput));
  const input = toMaintenanceInput(upstream);
  const score = computeMaintenanceScore(input, baselines);

  await db.insert(maintenanceScores).values({
    portName,
    score: score.score ?? null,
    label: score.label,
    recencyScore: componentBucket(score.components, ["recent_code"]),
    issueScore: componentBucket(score.components, ["closed_issues_30d", "issue_responsiveness"]),
    prScore: componentBucket(score.components, ["merged_prs_30d", "pr_responsiveness"]),
    backlogScore: componentBucket(score.components, ["open_pr_backlog", "open_issue_backlog"]),
    popularityScore: componentBucket(score.components, ["stars", "forks"]),
    reasonJson: serializeMaintenanceDetails(score),
    computedAt: new Date().toISOString(),
  }).onConflictDoUpdate({
    target: maintenanceScores.portName,
    set: {
      score: score.score ?? null,
      label: score.label,
      recencyScore: componentBucket(score.components, ["recent_code"]),
      issueScore: componentBucket(score.components, ["closed_issues_30d", "issue_responsiveness"]),
      prScore: componentBucket(score.components, ["merged_prs_30d", "pr_responsiveness"]),
      backlogScore: componentBucket(score.components, ["open_pr_backlog", "open_issue_backlog"]),
      popularityScore: componentBucket(score.components, ["stars", "forks"]),
      reasonJson: serializeMaintenanceDetails(score),
      computedAt: new Date().toISOString(),
    },
  });

  return score;
}
