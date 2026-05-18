import { eq, sql, desc, asc } from "drizzle-orm";
import type Database from "better-sqlite3";
import { getClient, getSqlite } from "@pkg/db";
import {
  ports,
  portVersions,
  portDependencies,
  portFeatures,
  portFiles,
  upstreamRepositories,
  maintenanceScores,
  upstreamIssues,
  portPatchStats,
  portSourceProvenance,
  portRegistryStats,
  packagingRiskScores,
} from "@pkg/db";
import { parseMaintenanceDetails, parsePackagingRiskDetails } from "@pkg/scoring";
import type {
  DependencyDto,
  FeatureDto,
  PackagingRiskComponentDto,
  PortDetailDto,
  PortFileDto,
  PortSummaryDto,
  PortSummaryListDto,
  SearchFilter,
  SearchSortDirection,
  SearchSort,
  UpstreamDto,
  UpstreamProvider,
} from "@pkg/shared";
import { parseSearchQuery, parseSortDirectionParam, parseSortParam } from "@pkg/shared";
import { getHistoricalSnapshot } from "./port-history.service.js";
import { isDateBasedVersion, parseUsage } from "@pkg/vcpkg-parser";
const NO_MATCH_RANK = 1_000_000_000;
const SUMMARY_UPDATED_AT_SQL = "COALESCE(p.updated_in_registry_at, p.vcpkg_updated_at, p.updated_at)";
const SUMMARY_JOINS_SQL = `
  LEFT JOIN upstream_repositories u ON u.port_name = p.name
  LEFT JOIN maintenance_scores m ON m.port_name = p.name
  LEFT JOIN port_patch_stats ppst ON ppst.port_name = p.name
  LEFT JOIN port_registry_stats prs ON prs.port_name = p.name
  LEFT JOIN packaging_risk_scores pkgs ON pkgs.port_name = p.name
`;
const SUMMARY_SELECT_SQL = `
  p.name, p.version, p.description, p.license, p.supports, ${SUMMARY_UPDATED_AT_SQL} AS updated_at,
  p.created_in_registry_at AS created_in_registry_at,
  p.updated_in_registry_at AS updated_in_registry_at,
  (SELECT count(*) FROM port_dependencies d3 WHERE d3.port_name = p.name) AS dependency_count,
  (SELECT count(*) FROM port_dependencies d4 WHERE d4.port_name = p.name AND d4.host = 1) AS host_dependency_count,
  (SELECT count(*) FROM port_features f3 WHERE f3.port_name = p.name) AS feature_count,
  ppst.patch_count AS patch_count,
  prs.churn_90d AS churn_90d,
  pkgs.score AS packaging_risk_score,
  pkgs.label AS packaging_risk_label,
  u.provider AS upstream_provider, u.repo AS upstream_repo, u.repo_url AS upstream_url, u.stars AS upstream_stars, u.last_commit_at AS upstream_last_commit_at,
  m.label AS maintenance_label, m.score AS maintenance_score
`;

function tokenizeSearchText(text: string): string[] {
  return text
    .split(/\s+/)
    .map(t => t.trim())
    .filter(Boolean)
    .map(t => t.replace(/[^\p{L}\p{N}_-]/gu, "").toLowerCase())
    .filter(Boolean);
}

function tokenizeBodyFtsSearchText(text: string): string[] {
  return tokenizeSearchText(text)
    .flatMap((term) => term.split(/[-_]+/))
    .map((term) => term.trim())
    .filter(Boolean);
}

function canonicalizeSearchValue(value: string): string {
  return value.toLowerCase().replace(/[-_\s]+/g, "");
}

function quoteFtsTerm(term: string): string {
  return `"${term.replaceAll("\"", "\"\"")}"`;
}

function toBodyFtsQuery(text: string): string | null {
  const terms = tokenizeBodyFtsSearchText(text);

  if (terms.length === 0) return null;
  return terms.map((term) => `${term}*`).join(" AND ");
}

function toTitleFtsQuery(text: string): string | null {
  const terms = new Set<string>();

  for (const term of tokenizeSearchText(text)) {
    if (term.length >= 3) {
      terms.add(term);
    }

    const canonicalTerm = canonicalizeSearchValue(term);
    if (canonicalTerm.length >= 3) {
      terms.add(canonicalTerm);
    }
  }

  if (terms.size === 0) return null;
  return Array.from(terms).map(quoteFtsTerm).join(" AND ");
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function tableExists(sqlite: Database.Database, tableName: string): boolean {
  const row = sqlite.prepare(
    "SELECT 1 FROM sqlite_master WHERE type IN ('table', 'view') AND name = ? LIMIT 1"
  ).get(tableName);

  return !!row;
}

type SearchTextSpec = {
  textTerms: string[];
  normalizedText: string;
  canonicalText: string;
  titleQuery: string | null;
  bodyQuery: string | null;
  useTitleFts: boolean;
  useBodyFts: boolean;
  allowContainsFallback: boolean;
  shortText: boolean;
};

function buildSearchTextSpec(sqlite: Database.Database, text: string): SearchTextSpec {
  const textTerms = tokenizeSearchText(text);
  const normalizedText = textTerms.join(" ");
  const canonicalText = canonicalizeSearchValue(textTerms.join(""));
  const titleQuery = toTitleFtsQuery(text);
  const bodyQuery = toBodyFtsQuery(text);
  const shortText = canonicalText.length < 3;
  const veryShortText = canonicalText.length <= 3;

  return {
    textTerms,
    normalizedText,
    canonicalText,
    titleQuery,
    bodyQuery,
    useTitleFts: !shortText && !!titleQuery && tableExists(sqlite, "ports_title_fts"),
    useBodyFts: !veryShortText && !!bodyQuery && tableExists(sqlite, "ports_fts"),
    allowContainsFallback: !veryShortText,
    shortText,
  };
}

function canonicalizeSql(field: string): string {
  return `replace(replace(coalesce(lower(${field}), ''), '-', ''), '_', '')`;
}

type TitleFieldSet = {
  name: string;
  displayName: string;
  repo: string;
};

type MatchSql = {
  exactSql: string;
  exactParams: string[];
  prefixSql: string;
  prefixParams: string[];
  containsSql: string;
  containsParams: string[];
};

function buildTitleMatchSql(
  fields: TitleFieldSet,
  normalizedText: string,
  canonicalText: string,
): MatchSql {
  const rawFields = [
    `coalesce(lower(${fields.name}), '')`,
    `coalesce(lower(${fields.displayName}), '')`,
    `coalesce(lower(${fields.repo}), '')`,
  ];
  const canonicalFields = [
    canonicalizeSql(fields.name),
    canonicalizeSql(fields.displayName),
    canonicalizeSql(fields.repo),
  ];
  const prefixText = `${escapeLikePattern(normalizedText)}%`;
  const canonicalPrefixText = `${escapeLikePattern(canonicalText)}%`;
  const containsText = `%${escapeLikePattern(normalizedText)}%`;
  const canonicalContainsText = `%${escapeLikePattern(canonicalText)}%`;

  return {
    exactSql: [
      ...rawFields.map((field) => `${field} = ?`),
      ...canonicalFields.map((field) => `${field} = ?`),
    ].join(" OR "),
    exactParams: [
      ...rawFields.map(() => normalizedText),
      ...canonicalFields.map(() => canonicalText),
    ],
    prefixSql: [
      ...rawFields.map((field) => `${field} LIKE ? ESCAPE '\\'`),
      ...canonicalFields.map((field) => `${field} LIKE ? ESCAPE '\\'`),
    ].join(" OR "),
    prefixParams: [
      ...rawFields.map(() => prefixText),
      ...canonicalFields.map(() => canonicalPrefixText),
    ],
    containsSql: [
      ...rawFields.map((field) => `${field} LIKE ? ESCAPE '\\'`),
      ...canonicalFields.map((field) => `${field} LIKE ? ESCAPE '\\'`),
    ].join(" OR "),
    containsParams: [
      ...rawFields.map(() => containsText),
      ...canonicalFields.map(() => canonicalContainsText),
    ],
  };
}

function buildDescriptionMatchSql(
  descriptionField: string,
  normalizedText: string,
  textTerms: string[],
): { sql: string; params: string[] } {
  const patterns = Array.from(new Set([
    normalizedText,
    ...textTerms,
  ].filter(Boolean))).map((term) => `%${escapeLikePattern(term)}%`);

  if (patterns.length === 0) {
    return { sql: "0", params: [] };
  }

  const clauses: string[] = [];
  const params: string[] = [];
  for (const pattern of patterns) {
    clauses.push(`coalesce(lower(${descriptionField}), '') LIKE ? ESCAPE '\\'`);
    params.push(pattern);
  }

  return {
    sql: clauses.join(" OR "),
    params,
  };
}

function resolveSearchSort(sort: string | undefined, text?: string): SearchSort {
  if (sort) {
    return parseSortParam(sort);
  }

  return text ? "relevance" : "score";
}

function resolveSearchSortDirection(sort: SearchSort, direction?: string): SearchSortDirection {
  if (direction) {
    return parseSortDirectionParam(direction);
  }

  return sort === "name" ? "asc" : "desc";
}

function parseStringArrayJson(value?: string | null): string[] | undefined {
  if (!value) return undefined;

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : undefined;
  } catch {
    return undefined;
  }
}

function parsePatchFilesJson(value?: string | null): Array<{ path: string; sizeBytes?: number }> {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const file = item as { path?: unknown; sizeBytes?: unknown };
      if (typeof file.path !== "string") return [];

      return [{
        path: file.path,
        sizeBytes: typeof file.sizeBytes === "number" && Number.isFinite(file.sizeBytes)
          ? file.sizeBytes
          : undefined,
      }];
    });
  } catch {
    return [];
  }
}

function parseIssueLabelsJson(value?: string | null): Array<{ name: string; color?: string; description?: string }> | undefined {
  if (!value) return undefined;

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return undefined;

    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];

      const label = item as { name?: unknown; color?: unknown; description?: unknown };
      if (typeof label.name !== "string") return [];

      return [{
        name: label.name,
        color: typeof label.color === "string" && label.color.length > 0 ? label.color : undefined,
        description: typeof label.description === "string" && label.description.length > 0 ? label.description : undefined,
      }];
    });
  } catch {
    return undefined;
  }
}

function parseDependencyRefsJson(value?: string | null): FeatureDto["dependencies"] {
  if (!value) return undefined;

  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) return undefined;

  return parsed.flatMap((item) => {
    if (typeof item === "string") {
      return [{ name: item }];
    }
    if (!item || typeof item !== "object") return [];

    const dep = item as DependencyDto;
    if (typeof dep.name !== "string") return [];

    return [{
      name: dep.name,
      features: dep.features,
      defaultFeatures: dep.defaultFeatures,
      platform: dep.platform,
      host: dep.host,
      dependencyType: dep.dependencyType,
    }];
  });
}

function defaultVersionsPath(portName: string): string {
  return `versions/${portName[0]?.toLowerCase() ?? "_"}-/${portName}.json`;
}

function mapDependencyDto(row: typeof portDependencies.$inferSelect): DependencyDto {
  return {
    name: row.dependencyName,
    features: row.featuresJson ? JSON.parse(row.featuresJson) : undefined,
    defaultFeatures: row.defaultFeatures ?? undefined,
    platform: row.platform ?? undefined,
    host: row.host ?? undefined,
    dependencyType: row.dependencyType ?? undefined,
    source: row.source ?? undefined,
    featureName: row.featureName ?? undefined,
  };
}

function parsePackagingRiskComponentsJson(value?: string | null): PackagingRiskComponentDto[] {
  return parsePackagingRiskDetails(undefined, value).components;
}

function toAgeDays(value?: string | null): number | undefined {
  if (!value) return undefined;

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return undefined;

  return Math.max(0, Math.floor((Date.now() - timestamp) / (24 * 60 * 60 * 1000)));
}

function mapFeatureDto(row: typeof portFeatures.$inferSelect): FeatureDto {
  return {
    name: row.featureName,
    description: row.description ?? undefined,
    dependencies: parseDependencyRefsJson(row.dependenciesJson),
    supports: row.supports ?? undefined,
    defaultFeature: row.defaultFeature ?? false,
  };
}

function mapVersionDto(row: typeof portVersions.$inferSelect) {
  return {
    version: row.version,
    portVersion: row.portVersion ?? undefined,
    gitTree: row.gitTree ?? undefined,
    date: row.versionDate && isDateBasedVersion(row.version) ? row.versionDate : undefined,
    registryCommit: row.registryCommit ?? undefined,
    publishedAt: row.publishedAt ?? undefined,
  };
}

function mapPortFileDto(row: typeof portFiles.$inferSelect, includeContent = true): PortFileDto {
  return {
    id: row.id,
    fileType: row.fileType,
    path: row.path,
    content: includeContent ? row.content ?? undefined : undefined,
    sizeBytes: row.sizeBytes ?? undefined,
    updatedAt: row.updatedAt,
  };
}

function mapUpstreamDto(row?: typeof upstreamRepositories.$inferSelect | null): UpstreamDto | undefined {
  if (!row) return undefined;

  return {
    provider: row.provider as UpstreamDto["provider"],
    owner: row.owner ?? undefined,
    repo: row.repo ?? undefined,
    url: row.repoUrl,
    stars: row.stars ?? undefined,
    forks: row.forks ?? undefined,
    openIssues: row.openIssues ?? undefined,
    openPrs: row.openPrs ?? undefined,
    closedIssues30d: row.closedIssues30d ?? undefined,
    mergedPrs30d: row.mergedPrs30d ?? undefined,
    repoCreatedAt: row.repoCreatedAt ?? undefined,
    homepageUrl: row.homepageUrl ?? undefined,
    licenseSpdxId: row.licenseSpdxId ?? undefined,
    licenseName: row.licenseName ?? undefined,
    primaryLanguage: row.primaryLanguage ?? undefined,
    primaryLanguageColor: row.primaryLanguageColor ?? undefined,
    topics: parseStringArrayJson(row.topicsJson),
    latestReleaseTag: row.latestReleaseTag ?? undefined,
    latestReleasePublishedAt: row.latestReleasePublishedAt ?? undefined,
    latestReleaseUrl: row.latestReleaseUrl ?? undefined,
    latestReleaseIsDraft: row.latestReleaseIsDraft ?? undefined,
    latestReleaseIsPrerelease: row.latestReleaseIsPrerelease ?? undefined,
    latestTagName: row.latestTagName ?? undefined,
    latestTagPublishedAt: row.latestTagPublishedAt ?? undefined,
    latestTagUrl: row.latestTagUrl ?? undefined,
    lastCommitAt: row.lastCommitAt ?? undefined,
    archived: row.archived ?? undefined,
    disabled: row.disabled ?? undefined,
    readmeSummary: row.readmeSummary ?? undefined,
    readmeMarkdown: row.readmeMarkdown ?? undefined,
    lastSuccessfulRefreshAt: row.lastSuccessfulRefreshAt ?? undefined,
    lastFailedRefreshAt: row.lastFailedRefreshAt ?? undefined,
    refreshedAt: row.refreshedAt ?? undefined,
    detectionConfidence: row.confidence ?? undefined,
  };
}

export async function searchPorts(
  options: { text?: string; filters?: SearchFilter[]; sort?: string; sortDirection?: string; page: number; pageSize: number }
): Promise<PortSummaryListDto> {
  const { text, filters, sort, sortDirection, page, pageSize } = options;
  const offset = (page - 1) * pageSize;
  const sqlite = getSqlite();

  const filterClauses: string[] = [];
  const filterParams: unknown[] = [];
  const sortBy = resolveSearchSort(sort, text);
  const direction = resolveSearchSortDirection(sortBy, sortDirection);

  if (filters) {
    for (const f of filters) {
      switch (f.field) {
        case "repository":
          filterClauses.push("u.provider = ?");
          filterParams.push(f.value);
          break;
        case "has":
          if (f.value === "upstream") {
            filterClauses.push("u.id IS NOT NULL");
          } else if (f.value === "usage") {
            filterClauses.push("p.usage_text IS NOT NULL AND p.usage_text != ''");
          } else if (f.value === "features") {
            filterClauses.push("EXISTS (SELECT 1 FROM port_features f2 WHERE f2.port_name = p.name)");
          } else if (f.value === "host-deps") {
            filterClauses.push("EXISTS (SELECT 1 FROM port_dependencies d2 WHERE d2.port_name = p.name AND d2.host = 1)");
          }
          break;
        case "no":
          if (f.value === "upstream") {
            filterClauses.push("u.id IS NULL");
          }
          break;
        case "license":
          filterClauses.push("lower(p.license) LIKE ?");
          filterParams.push(`%${f.value}%`);
          break;
        case "supports":
          filterClauses.push("EXISTS (SELECT 1 FROM triplet_support ts WHERE ts.port_name = p.name AND ts.triplet = ? AND ts.supported = 1)");
          filterParams.push(f.value);
          break;
        case "dependency":
          filterClauses.push("EXISTS (SELECT 1 FROM port_dependencies d2 WHERE d2.port_name = p.name AND lower(d2.dependency_name) = ?)");
          filterParams.push(f.value);
          break;
        case "feature":
          filterClauses.push("EXISTS (SELECT 1 FROM port_features f2 WHERE f2.port_name = p.name AND lower(f2.feature_name) = ?)");
          filterParams.push(f.value);
          break;
        case "stars":
          filterClauses.push(`u.stars ${sqlOp(f.op)} ?`);
          filterParams.push(f.value);
          break;
        case "score":
          filterClauses.push(`m.score ${sqlOp(f.op)} ?`);
          filterParams.push(f.value);
          break;
        case "risk":
          filterClauses.push(`pkgs.score ${sqlOp(f.op)} ?`);
          filterParams.push(f.value);
          break;
        case "maintained":
          filterClauses.push("m.label = ?");
          filterParams.push(f.value);
          break;
        case "updated": {
          if (/^\d+d$/i.test(f.value)) {
            const days = parseInt(f.value.replace("d", ""), 10);
            const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
            const opMap: Record<string, string> = {
              lt: ">=",
              gt: "<=",
              lte: ">=",
              gte: "<=",
            };
            filterClauses.push(`${SUMMARY_UPDATED_AT_SQL} ${opMap[f.op] ?? ">="} ?`);
            filterParams.push(cutoff);
          } else {
            const opMap: Record<string, string> = {
              lt: "<",
              lte: "<=",
              gt: ">",
              gte: ">=",
            };
            filterClauses.push(`${SUMMARY_UPDATED_AT_SQL} ${opMap[f.op] ?? ">="} ?`);
            filterParams.push(f.value);
          }
          break;
        }
      }
    }
  }

  const filterSQL = filterClauses.length > 0 ? " AND " + filterClauses.join(" AND ") : "";
  const textSpec = text ? buildSearchTextSpec(sqlite, text) : null;
  const supportsOnlyFilter = !textSpec && filters?.length === 1 && filters[0]?.field === "supports"
    ? filters[0]
    : null;

  function orderedField(field: string, fallbackDirection = direction, includeName = true): string {
    const sqlDirection = fallbackDirection === "asc" ? "ASC" : "DESC";
    const tieBreaker = includeName ? ", p.name ASC" : "";
    return `${field} IS NULL ASC, ${field} ${sqlDirection}${tieBreaker}`;
  }

  function orderedDate(field: string, includeName = true): string {
    return orderedField(field, direction, includeName);
  }

  function orderedName(): string {
    return `p.name ${direction === "asc" ? "ASC" : "DESC"}`;
  }

  function invertedDirection(): SearchSortDirection {
    return direction === "asc" ? "desc" : "asc";
  }

  function appendTextRanks(order: string): string {
    return `h.bucket ASC, ${order}, h.title_rank ASC, h.body_rank ASC, p.name ASC`;
  }

  function appendTextRanksAfterSort(order: string): string {
    return `${order}, h.bucket ASC, h.title_rank ASC, h.body_rank ASC, p.name ASC`;
  }

  function buildNonTextSortOrder(): string {
    switch (sortBy) {
      case "score":
        return `ORDER BY ${orderedField("m.score")}`;
      case "stars":
        return `ORDER BY ${orderedField("u.stars")}`;
      case "recently-added":
        return `ORDER BY ${orderedDate("p.created_in_registry_at")}`;
      case "recently-updated":
        return `ORDER BY ${orderedDate("p.updated_in_registry_at")}`;
      case "packaging-risk":
        return `ORDER BY ${orderedField("pkgs.score", invertedDirection())}`;
      case "churn":
        return `ORDER BY prs.churn_90d IS NULL ASC, prs.churn_90d ${direction === "asc" ? "ASC" : "DESC"}, prs.last_changed_at IS NULL ASC, prs.last_changed_at ${direction === "asc" ? "ASC" : "DESC"}, p.name ASC`;
      case "last-upstream-commit":
        return `ORDER BY ${orderedDate("u.last_commit_at")}`;
      case "dependency-count":
        return `ORDER BY dependency_count ${direction === "asc" ? "ASC" : "DESC"}, p.name ASC`;
      case "feature-count":
        return `ORDER BY feature_count ${direction === "asc" ? "ASC" : "DESC"}, p.name ASC`;
      case "relevance":
      case "name":
      default:
        return `ORDER BY ${orderedName()}`;
    }
  }

  function buildTextSortOrder(): string {
    switch (sortBy) {
      case "score":
        return `ORDER BY ${appendTextRanksAfterSort(orderedField("m.score", direction, false))}`;
      case "stars":
        return `ORDER BY ${appendTextRanksAfterSort(orderedField("u.stars", direction, false))}`;
      case "name":
        return `ORDER BY ${orderedName()}, h.bucket ASC, h.title_rank ASC, h.body_rank ASC`;
      case "recently-added":
        return `ORDER BY ${appendTextRanksAfterSort(orderedDate("p.created_in_registry_at", false))}`;
      case "recently-updated":
        return `ORDER BY ${appendTextRanksAfterSort(orderedDate("p.updated_in_registry_at", false))}`;
      case "packaging-risk":
        return `ORDER BY ${appendTextRanksAfterSort(orderedField("pkgs.score", invertedDirection(), false))}`;
      case "churn":
        return `ORDER BY prs.churn_90d IS NULL ASC, prs.churn_90d ${direction === "asc" ? "ASC" : "DESC"}, prs.last_changed_at IS NULL ASC, prs.last_changed_at ${direction === "asc" ? "ASC" : "DESC"}, h.bucket ASC, h.title_rank ASC, h.body_rank ASC, p.name ASC`;
      case "last-upstream-commit":
        return `ORDER BY ${appendTextRanksAfterSort(orderedDate("u.last_commit_at", false))}`;
      case "dependency-count":
        return `ORDER BY dependency_count ${direction === "asc" ? "ASC" : "DESC"}, h.bucket ASC, h.title_rank ASC, h.body_rank ASC, p.name ASC`;
      case "feature-count":
        return `ORDER BY feature_count ${direction === "asc" ? "ASC" : "DESC"}, h.bucket ASC, h.title_rank ASC, h.body_rank ASC, p.name ASC`;
      case "relevance":
      default:
        return "ORDER BY h.bucket ASC, h.title_rank ASC, h.body_rank ASC, m.score IS NULL ASC, m.score DESC, p.name ASC";
    }
  }

  function buildFallbackTextSortOrder(matchPrioritySql: string): string {
    switch (sortBy) {
      case "score":
        return `ORDER BY ${orderedField("m.score", direction, false)}, ${matchPrioritySql} ASC, p.name ASC`;
      case "stars":
        return `ORDER BY ${orderedField("u.stars", direction, false)}, ${matchPrioritySql} ASC, p.name ASC`;
      case "name":
        return `ORDER BY ${orderedName()}, ${matchPrioritySql} ASC`;
      case "recently-added":
        return `ORDER BY ${orderedDate("p.created_in_registry_at", false)}, ${matchPrioritySql} ASC, p.name ASC`;
      case "recently-updated":
        return `ORDER BY ${orderedDate("p.updated_in_registry_at", false)}, ${matchPrioritySql} ASC, p.name ASC`;
      case "packaging-risk":
        return `ORDER BY ${orderedField("pkgs.score", invertedDirection(), false)}, ${matchPrioritySql} ASC, p.name ASC`;
      case "churn":
        return `ORDER BY prs.churn_90d IS NULL ASC, prs.churn_90d ${direction === "asc" ? "ASC" : "DESC"}, prs.last_changed_at IS NULL ASC, prs.last_changed_at ${direction === "asc" ? "ASC" : "DESC"}, ${matchPrioritySql} ASC, p.name ASC`;
      case "last-upstream-commit":
        return `ORDER BY ${orderedDate("u.last_commit_at", false)}, ${matchPrioritySql} ASC, p.name ASC`;
      case "dependency-count":
        return `ORDER BY dependency_count ${direction === "asc" ? "ASC" : "DESC"}, ${matchPrioritySql} ASC, p.name ASC`;
      case "feature-count":
        return `ORDER BY feature_count ${direction === "asc" ? "ASC" : "DESC"}, ${matchPrioritySql} ASC, p.name ASC`;
      case "relevance":
      default:
        return `ORDER BY ${matchPrioritySql} ASC, m.score IS NULL ASC, m.score DESC, p.name ASC`;
    }
  }

  if (textSpec && textSpec.normalizedText) {
    const titleMatches = buildTitleMatchSql(
      {
        name: "p.name",
        displayName: "p.display_name",
        repo: "u.repo",
      },
      textSpec.normalizedText,
      textSpec.canonicalText,
    );
    const shortTitleMatches = buildTitleMatchSql(
      {
        name: "p.name",
        displayName: "p.display_name",
        repo: "u.repo",
      },
      textSpec.normalizedText,
      textSpec.canonicalText,
    );
    const descriptionMatches = buildDescriptionMatchSql(
      "p.description",
      textSpec.normalizedText,
      textSpec.textTerms,
    );

    const ctes: string[] = [];
    const cteParams: unknown[] = [];
    const hitSources: string[] = [];

    if (textSpec.useTitleFts && textSpec.titleQuery) {
      ctes.push(`
        title_hits AS (
          SELECT
            p.name AS port_name,
            CASE
              WHEN ${titleMatches.exactSql} THEN 0
              WHEN ${titleMatches.prefixSql} THEN 1
              ELSE 2
            END AS bucket,
            CASE
              WHEN ${titleMatches.exactSql} THEN 0.0
              WHEN ${titleMatches.prefixSql} THEN 1.0
              ELSE 2.0
            END AS title_rank,
            ${NO_MATCH_RANK} AS body_rank
          FROM ports_title_fts
          JOIN ports p ON p.name = ports_title_fts.port_name
          LEFT JOIN upstream_repositories u ON u.port_name = p.name
          WHERE ports_title_fts MATCH ?
        )
      `);
      cteParams.push(
        ...titleMatches.exactParams,
        ...titleMatches.prefixParams,
        ...titleMatches.exactParams,
        ...titleMatches.prefixParams,
        textSpec.titleQuery,
      );
      hitSources.push("title_hits");
    } else {
      ctes.push(`
        title_hits AS (
          SELECT
            p.name AS port_name,
            CASE
              WHEN ${shortTitleMatches.exactSql} THEN 0
              ELSE 1
            END AS bucket,
            CASE
              WHEN ${shortTitleMatches.exactSql} THEN 0.0
              ELSE 1.0
            END AS title_rank,
            ${NO_MATCH_RANK} AS body_rank
          FROM ports p
          LEFT JOIN upstream_repositories u ON u.port_name = p.name
          WHERE ${shortTitleMatches.exactSql} OR ${shortTitleMatches.prefixSql}
        )
      `);
      cteParams.push(
        ...shortTitleMatches.exactParams,
        ...shortTitleMatches.exactParams,
        ...shortTitleMatches.exactParams,
        ...shortTitleMatches.prefixParams,
      );
      hitSources.push("title_hits");
    }

    if (textSpec.useBodyFts && textSpec.bodyQuery) {
      ctes.push(`
        body_hits AS (
          SELECT
            p.name AS port_name,
            CASE
              WHEN ${descriptionMatches.sql} THEN 3
              ELSE 4
            END AS bucket,
            ${NO_MATCH_RANK} AS title_rank,
            CASE
              WHEN ${descriptionMatches.sql} THEN 0.0
              ELSE 1.0
            END AS body_rank
          FROM ports_fts
          JOIN ports p ON p.name = ports_fts.port_name
          WHERE ports_fts MATCH ?
        )
      `);
      cteParams.push(...descriptionMatches.params, ...descriptionMatches.params, textSpec.bodyQuery);
      hitSources.push("body_hits");
    }

    if (hitSources.length > 0) {
      ctes.push(`
        combined_hits AS (
          ${hitSources.map((source) => `SELECT * FROM ${source}`).join("\nUNION ALL\n")}
        )
      `);
      ctes.push(`
        ranked_hits AS (
          SELECT
            port_name,
            MIN(bucket) AS bucket,
            MIN(title_rank) AS title_rank,
            MIN(body_rank) AS body_rank
          FROM combined_hits
          GROUP BY port_name
        )
      `);

      const cteSql = `WITH ${ctes.join(",\n")}`;
      const countCtes: string[] = [];
      const countParams: unknown[] = [];
      const countSources: string[] = [];

      if (textSpec.useTitleFts && textSpec.titleQuery) {
        countCtes.push(`
          title_hits_count AS (
            SELECT p.name AS port_name
            FROM ports_title_fts
            JOIN ports p ON p.name = ports_title_fts.port_name
            LEFT JOIN upstream_repositories u ON u.port_name = p.name
            WHERE ports_title_fts MATCH ?
          )
        `);
        countParams.push(textSpec.titleQuery);
        countSources.push("title_hits_count");
      } else {
        countCtes.push(`
          title_hits_count AS (
            SELECT p.name AS port_name
            FROM ports p
            LEFT JOIN upstream_repositories u ON u.port_name = p.name
            WHERE ${shortTitleMatches.exactSql} OR ${shortTitleMatches.prefixSql}
          )
        `);
        countParams.push(
          ...shortTitleMatches.exactParams,
          ...shortTitleMatches.prefixParams,
        );
        countSources.push("title_hits_count");
      }

      if (textSpec.useBodyFts && textSpec.bodyQuery) {
        countCtes.push(`
          body_hits_count AS (
            SELECT p.name AS port_name
            FROM ports_fts
            JOIN ports p ON p.name = ports_fts.port_name
            WHERE ports_fts MATCH ?
          )
        `);
        countParams.push(textSpec.bodyQuery);
        countSources.push("body_hits_count");
      }

      countCtes.push(`
        distinct_hits_count AS (
          SELECT DISTINCT port_name
          FROM (
            ${countSources.map((source) => `SELECT port_name FROM ${source}`).join("\nUNION ALL\n")}
          )
        )
      `);

      const countRows = sqlite.prepare(`
        WITH ${countCtes.join(",\n")}
        SELECT h.port_name
        FROM distinct_hits_count h
        JOIN ports p ON p.name = h.port_name
        ${SUMMARY_JOINS_SQL}
        WHERE 1=1${filterSQL}
      `).all(...countParams, ...filterParams) as Array<{ port_name: string }>;

      if (countRows.length > 0) {
        const rows = sqlite.prepare(`
          ${cteSql}
          SELECT
            ${SUMMARY_SELECT_SQL}
          FROM ranked_hits h
          JOIN ports p ON p.name = h.port_name
          ${SUMMARY_JOINS_SQL}
          WHERE 1=1${filterSQL}
          ${buildTextSortOrder()}
          LIMIT ? OFFSET ?
        `).all(
          ...cteParams,
          ...filterParams,
          pageSize,
          offset,
        ) as SummaryRow[];

        return {
          items: enrichSummaries(rows),
          page,
          pageSize,
          total: countRows.length,
        };
      }
    }

    if (textSpec.allowContainsFallback) {
      const fallbackTitleMatches = buildTitleMatchSql(
        {
          name: "p.name",
          displayName: "p.display_name",
          repo: "u.repo",
        },
        textSpec.normalizedText,
        textSpec.canonicalText,
      );
      const [fallbackCountRow] = sqlite.prepare(`
        SELECT COUNT(*) AS cnt
        FROM ports p
        ${SUMMARY_JOINS_SQL}
        WHERE (${fallbackTitleMatches.containsSql})${filterSQL}
      `).all(
        ...fallbackTitleMatches.containsParams,
        ...filterParams,
      ) as Array<{ cnt: number }>;

      if ((fallbackCountRow?.cnt ?? 0) > 0) {
        const fallbackMatchPrioritySql = `CASE
              WHEN ${fallbackTitleMatches.exactSql} THEN 0
              WHEN ${fallbackTitleMatches.prefixSql} THEN 1
              ELSE 2
            END`;
        const rows = sqlite.prepare(`
          SELECT
            ${SUMMARY_SELECT_SQL}
          FROM ports p
          ${SUMMARY_JOINS_SQL}
          WHERE (${fallbackTitleMatches.containsSql})${filterSQL}
          ${buildFallbackTextSortOrder(fallbackMatchPrioritySql)}
          LIMIT ? OFFSET ?
        `).all(
          ...fallbackTitleMatches.containsParams,
          ...filterParams,
          ...fallbackTitleMatches.exactParams,
          ...fallbackTitleMatches.prefixParams,
          pageSize,
          offset,
        ) as SummaryRow[];

        return {
          items: enrichSummaries(rows),
          page,
          pageSize,
          total: fallbackCountRow?.cnt ?? 0,
        };
      }
    }

    return { items: [], page, pageSize, total: 0 };
  }

  if (supportsOnlyFilter) {
    const triplet = supportsOnlyFilter.value;

    const [countRow] = sqlite.prepare(
      `SELECT count(*) as cnt
       FROM triplet_support ts
       WHERE ts.triplet = ? AND ts.supported = 1`
    ).all(triplet) as Array<{ cnt: number }>;

    const rows = sqlite.prepare(
      `SELECT
         ${SUMMARY_SELECT_SQL}
       FROM triplet_support ts
       JOIN ports p ON p.name = ts.port_name
       ${SUMMARY_JOINS_SQL}
       WHERE ts.triplet = ? AND ts.supported = 1
       ${buildNonTextSortOrder()}
       LIMIT ? OFFSET ?`
    ).all(triplet, pageSize, offset) as SummaryRow[];

    return {
      items: enrichSummaries(rows),
      page,
      pageSize,
      total: countRow?.cnt ?? 0,
    };
  }

  if (!textSpec && (!filters || filters.length === 0)) {
    const [countRow] = sqlite.prepare(
      `SELECT count(*) as cnt FROM ports`
    ).all() as Array<{ cnt: number }>;

    const rows = sqlite.prepare(
      `SELECT ${SUMMARY_SELECT_SQL}
       FROM ports p
       ${SUMMARY_JOINS_SQL}
       ${buildNonTextSortOrder()}
       LIMIT ? OFFSET ?`
    ).all(pageSize, offset) as SummaryRow[];

    return { items: enrichSummaries(rows), page, pageSize, total: countRow?.cnt ?? 0 };
  }

  const [countRow] = sqlite.prepare(
    `SELECT count(DISTINCT p.name) as cnt FROM ports p
     ${SUMMARY_JOINS_SQL}
     WHERE 1=1${filterSQL}`
  ).all(...filterParams) as Array<{ cnt: number }>;

  const rows = sqlite.prepare(
    `SELECT ${SUMMARY_SELECT_SQL}
     FROM ports p
     ${SUMMARY_JOINS_SQL}
     WHERE 1=1${filterSQL}
     ${buildNonTextSortOrder()}
     LIMIT ? OFFSET ?`
  ).all(...filterParams, pageSize, offset) as SummaryRow[];

  const items = enrichSummaries(rows);
  return { items, page, pageSize, total: countRow?.cnt ?? 0 };
}

function sqlOp(op: string): string {
  switch (op) {
    case "gt": return ">";
    case "gte": return ">=";
    case "lt": return "<";
    case "lte": return "<=";
    default: return ">=";
  }
}

type SummaryRow = {
  name: string; version: string | null; description: string | null;
  license: string | null; supports: string | null; updated_at: string | null;
  created_in_registry_at: string | null; updated_in_registry_at: string | null;
  dependency_count: number; host_dependency_count: number; feature_count: number;
  patch_count: number | null;
  churn_90d: number | null;
  packaging_risk_score: number | null;
  packaging_risk_label: PortSummaryDto["packagingRiskLabel"] | null;
  upstream_provider: string | null;
  upstream_repo: string | null;
  upstream_url: string | null;
  upstream_stars: number | null;
  upstream_last_commit_at: string | null;
  maintenance_label: string | null;
  maintenance_score: number | null;
};

function enrichSummaries(rows: SummaryRow[]): PortSummaryDto[] {
  return rows.map((row) => ({
    name: row.name,
    version: row.version ?? "",
    description: row.description ?? undefined,
    license: row.license ?? undefined,
    supports: row.supports ?? undefined,
    updatedAt: row.updated_at ?? undefined,
    createdInRegistryAt: row.created_in_registry_at ?? undefined,
    updatedInRegistryAt: row.updated_in_registry_at ?? undefined,
    dependencyCount: row.dependency_count,
    hostDependencyCount: row.host_dependency_count ?? 0,
    featureCount: row.feature_count,
    patchCount: row.patch_count ?? undefined,
    churn90d: row.churn_90d ?? undefined,
    packagingRiskScore: row.packaging_risk_score ?? undefined,
    packagingRiskLabel: row.packaging_risk_label ?? undefined,
    upstream: row.upstream_provider && row.upstream_url ? {
      provider: row.upstream_provider as UpstreamProvider,
      repo: row.upstream_repo ?? undefined,
      url: row.upstream_url,
      stars: row.upstream_stars ?? undefined,
      lastCommitAt: row.upstream_last_commit_at ?? undefined,
    } : undefined,
    maintenance: {
      label: row.maintenance_label ?? "unknown-upstream",
      score: row.maintenance_score ?? undefined,
    },
  }));
}

export { enrichSummaries };

export async function getPorts(
  options: { q?: string; sort?: string; page?: number; pageSize?: number }
): Promise<PortSummaryListDto> {
  const page = options.page ?? 1;
  const pageSize = Math.min(options.pageSize ?? 30, 100);
  const parsed = options.q ? parseSearchQuery(options.q) : { text: undefined, filters: [] };

  return searchPorts({
    text: parsed.text,
    filters: parsed.filters,
    sort: options.sort,
    page,
    pageSize,
  });
}

export async function getPortDetail(
  name: string,
  selectedVersion?: { version: string; portVersion?: number },
): Promise<PortDetailDto | null> {
  const db = getClient();

  const port = await db.select().from(ports).where(eq(ports.name, name)).limit(1).then(r => r[0] ?? null);
  if (!port) return null;

  const [deps, feats, vers, files, upstream, maintenance, patching, sourceProvenance, registryStats, packagingRisk] = await Promise.all([
    db.select().from(portDependencies).where(eq(portDependencies.portName, name)),
    db.select().from(portFeatures).where(eq(portFeatures.portName, name)),
    db.select().from(portVersions).where(eq(portVersions.portName, name)).orderBy(asc(portVersions.id)),
    db.select().from(portFiles).where(eq(portFiles.portName, name)).orderBy(asc(portFiles.path)),
    db.select().from(upstreamRepositories).where(eq(upstreamRepositories.portName, name)).limit(1).then(r => r[0] ?? null),
    db.select().from(maintenanceScores).where(eq(maintenanceScores.portName, name)).limit(1).then(r => r[0] ?? null),
    db.select().from(portPatchStats).where(eq(portPatchStats.portName, name)).limit(1).then(r => r[0] ?? null),
    db.select().from(portSourceProvenance).where(eq(portSourceProvenance.portName, name)).limit(1).then(r => r[0] ?? null),
    db.select().from(portRegistryStats).where(eq(portRegistryStats.portName, name)).limit(1).then(r => r[0] ?? null),
    db.select().from(packagingRiskScores).where(eq(packagingRiskScores.portName, name)).limit(1).then(r => r[0] ?? null),
  ]);

  const upstreamDto = mapUpstreamDto(upstream);
  const maintenanceDetails = parseMaintenanceDetails(maintenance?.reasonJson);

  const selectedVersionRow = selectedVersion
    ? (() => {
        const versionMatches = vers.filter((row) => row.version === selectedVersion.version);
        if (versionMatches.length === 0) {
          return null;
        }

        if (selectedVersion.portVersion !== undefined) {
          return versionMatches.find((row) => (row.portVersion ?? 0) === selectedVersion.portVersion) ?? null;
        }

        const defaultPortVersionRow = versionMatches.find((row) => (row.portVersion ?? 0) === 0);
        if (defaultPortVersionRow) {
          return defaultPortVersionRow;
        }

        return versionMatches.length === 1 ? versionMatches[0] : null;
      })()
    : null;
  const currentVersionRow = vers.find((row) =>
    row.version === port.version && (row.portVersion ?? 0) === (port.portVersion ?? 0)
  ) ?? null;

  let detailDependencies = deps.map(mapDependencyDto);
  let detailFeatures = feats.map(mapFeatureDto);
  let detailFiles = files.map((file) => mapPortFileDto(file, false));
  let detailManifest: unknown = port.manifestJson ? JSON.parse(port.manifestJson) : {};
  let detailUsage = port.usageText ? parseUsage(port.usageText) : undefined;
  let detailDescription = port.description ?? undefined;
  let detailHomepage = port.homepage ?? undefined;
  let detailLicense = port.license ?? undefined;
  let detailSupports = port.supports ?? undefined;
  let detailUpstream = upstreamDto;
  let detailView: PortDetailDto["view"] = "current";
  let detailSelectedVersion: PortDetailDto["selectedVersion"] | undefined;

  if (selectedVersion) {
    if (!selectedVersionRow) return null;

    const snapshot = await getHistoricalSnapshot(selectedVersionRow.gitTree);
    if (!snapshot) return null;

    detailDependencies = snapshot.dependencies;
    detailFeatures = snapshot.features;
    detailFiles = snapshot.files;
    detailManifest = snapshot.manifest;
    detailUsage = snapshot.usage;
    detailDescription = snapshot.description;
    detailHomepage = snapshot.homepage;
    detailLicense = snapshot.license;
    detailSupports = snapshot.supports;
    detailUpstream = undefined;
    detailView = "historical";
    detailSelectedVersion = {
      version: selectedVersionRow.version,
      portVersion: selectedVersionRow.portVersion ?? undefined,
      gitTree: selectedVersionRow.gitTree ?? undefined,
    };
  }

  return {
    name: port.name,
    displayName: port.displayName ?? undefined,
    version: selectedVersionRow?.version ?? port.version ?? "",
    portVersion: selectedVersionRow?.portVersion ?? port.portVersion ?? undefined,
    view: detailView,
    selectedVersion: detailSelectedVersion,
    description: detailDescription,
    homepage: detailHomepage,
    license: detailLicense,
    supports: detailSupports,
    usage: detailUsage,
    manifest: detailManifest,
    versionsPath: port.versionsPath ?? defaultVersionsPath(port.name),
    vcpkgUpdatedAt: port.vcpkgUpdatedAt ?? undefined,
    createdInRegistryAt: port.createdInRegistryAt ?? undefined,
    updatedInRegistryAt: port.updatedInRegistryAt ?? undefined,
    registryCommit: selectedVersionRow?.registryCommit ?? currentVersionRow?.registryCommit ?? undefined,
    dependencies: detailDependencies,
    dependencySummary: detailView === "current"
      ? {
          totalCount: detailDependencies.length,
          hostCount: detailDependencies.filter((dependency) => dependency.host).length,
          targetCount: detailDependencies.filter((dependency) => !dependency.host).length,
        }
      : undefined,
    features: detailFeatures,
    versions: vers.map((row) => mapVersionDto(row)),
    files: detailFiles,
    patching: detailView === "current" && patching ? {
      patchCount: patching.patchCount,
      patchBytesTotal: patching.patchBytesTotal,
      declaredPatchCount: patching.declaredPatchCount,
      burdenLabel: patching.burdenLabel as NonNullable<PortDetailDto["patching"]>["burdenLabel"],
      patchFiles: parsePatchFilesJson(patching.patchFilesJson),
      unreferencedPatchFiles: parseStringArrayJson(patching.unreferencedPatchFilesJson),
      missingPatchFiles: parseStringArrayJson(patching.missingPatchFilesJson),
    } : undefined,
    sourceProvenance: detailView === "current" && sourceProvenance ? {
      provider: sourceProvenance.provider as NonNullable<PortDetailDto["sourceProvenance"]>["provider"],
      sourceUrl: sourceProvenance.sourceUrl ?? undefined,
      normalizedRepoUrl: sourceProvenance.normalizedRepoUrl ?? undefined,
      ref: sourceProvenance.ref ?? undefined,
      refKind: sourceProvenance.refKind as NonNullable<PortDetailDto["sourceProvenance"]>["refKind"] | undefined,
      quality: sourceProvenance.quality as NonNullable<PortDetailDto["sourceProvenance"]>["quality"],
      isExact: sourceProvenance.isExact,
      confidence: sourceProvenance.confidence,
      detectedFrom: sourceProvenance.detectedFrom,
      reason: sourceProvenance.reason,
      referenceUrl: sourceProvenance.referenceUrl ?? undefined,
    } : undefined,
    registryStats: detailView === "current" && registryStats ? {
      currentVersionPublishedAt: registryStats.currentVersionPublishedAt ?? undefined,
      currentVersionAgeDays: toAgeDays(registryStats.currentVersionPublishedAt),
      lastChangedAt: registryStats.lastChangedAt ?? undefined,
      lastChangedAgeDays: toAgeDays(registryStats.lastChangedAt),
      churn30d: registryStats.churn30d,
      churn90d: registryStats.churn90d,
      churn365d: registryStats.churn365d,
      sameVersionPortBumps: registryStats.sameVersionPortBumps ?? undefined,
    } : undefined,
    upstream: detailUpstream,
    maintenance: {
      score: maintenance?.score ?? undefined,
      label: maintenance?.label ?? "unknown-upstream",
      reasons: maintenanceDetails.reasons,
      confidence: maintenanceDetails.confidence,
      components: maintenanceDetails.components,
    },
    packagingRisk: detailView === "current" && packagingRisk ? {
      score: packagingRisk.score,
      label: packagingRisk.label as NonNullable<PortDetailDto["packagingRisk"]>["label"],
      reasons: parsePackagingRiskDetails(packagingRisk.reasonsJson, undefined).reasons,
      components: parsePackagingRiskComponentsJson(packagingRisk.componentsJson),
    } : undefined,
  };
}

export async function getPortFeatures(name: string): Promise<FeatureDto[]> {
  const db = getClient();
  const feats = await db.select().from(portFeatures).where(eq(portFeatures.portName, name));
  return feats.map(mapFeatureDto);
}

export async function getPortDeps(name: string): Promise<DependencyDto[]> {
  const db = getClient();
  const deps = await db.select().from(portDependencies).where(eq(portDependencies.portName, name));
  return deps.map(mapDependencyDto);
}

export async function getPortFilesList(name: string): Promise<PortFileDto[]> {
  const db = getClient();
  const files = await db.select().from(portFiles).where(eq(portFiles.portName, name)).orderBy(asc(portFiles.path));
  return files.map((file) => mapPortFileDto(file, false));
}

export async function getPortFile(name: string, fileId: number): Promise<PortFileDto | null> {
  const db = getClient();
  const f = await db.select().from(portFiles).where(eq(portFiles.id, fileId)).limit(1).then(r => r[0] ?? null);
  if (!f || f.portName !== name) return null;
  return {
    id: f.id,
    fileType: f.fileType,
    path: f.path,
    content: f.content ?? undefined,
    sizeBytes: f.sizeBytes ?? undefined,
    updatedAt: f.updatedAt,
  };
}

export async function getPortUpstream(name: string): Promise<UpstreamDto | null> {
  const db = getClient();
  const upstream = await db.select().from(upstreamRepositories).where(eq(upstreamRepositories.portName, name)).limit(1).then(r => r[0] ?? null);
  if (!upstream) return null;

  const topIssues = await db.select().from(upstreamIssues).where(eq(upstreamIssues.upstreamId, upstream.id)).orderBy(desc(upstreamIssues.comments)).limit(10);

  return {
    ...mapUpstreamDto(upstream)!,
    topIssues: topIssues.map(i => ({
      number: i.number ?? 0,
      title: i.title,
      url: i.url,
      state: i.state ?? "",
      comments: i.comments ?? 0,
      reactions: i.reactions ?? undefined,
      createdAt: i.createdAt ?? undefined,
      updatedAt: i.updatedAt ?? "",
      bodyText: i.bodyText ?? undefined,
      labels: parseIssueLabelsJson(i.labelsJson),
    })),
  };
}

export async function portExists(name: string): Promise<boolean> {
  const db = getClient();
  const row = await db.select({ name: ports.name }).from(ports).where(eq(ports.name, name)).limit(1).then((rows) => rows[0] ?? null);
  return Boolean(row);
}

export async function getPopularPorts(page = 1, pageSize = 30): Promise<PortSummaryListDto> {
  return searchPorts({
    sort: "stars",
    filters: [{ field: "has", op: "eq", value: "upstream" }],
    page,
    pageSize,
  });
}

export async function getRecentlyAddedPorts(page = 1, pageSize = 30) { return getPorts({ sort: "recently-added", page, pageSize }); }
export async function getRecentlyUpdatedPorts(page = 1, pageSize = 30) { return getPorts({ sort: "recently-updated", page, pageSize }); }

export function makeApiError(code: string, message: string, details?: unknown) {
  return { error: { code, message, details } };
}

export function replyNotFound(reply: any, code: string, message: string) {
  return reply.status(404).send(makeApiError(code, message));
}

export function replyBadRequest(reply: any, code: string, message: string) {
  return reply.status(400).send(makeApiError(code, message));
}
