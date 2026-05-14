import { getClient } from "@pkg/db";
import {
  packagingRiskScores,
  portDependencies,
  portFiles,
  portPatchStats,
  portRegistryStats,
  ports,
  portSourceProvenance,
  portVersions,
} from "@pkg/db";
import { computePackagingRisk, serializePackagingRiskDetails } from "@pkg/scoring";
import { extractDeclaredPatchPaths, parseSourceProvenance } from "@pkg/vcpkg-parser";
import { sql } from "drizzle-orm";

type PortRow = typeof ports.$inferSelect;
type DependencyRow = typeof portDependencies.$inferSelect;
type FileRow = typeof portFiles.$inferSelect;
type VersionRow = typeof portVersions.$inferSelect;

const IGNORED_PACKAGING_HOST_DEPS = new Set([
  "vcpkg-cmake",
  "vcpkg-cmake-config",
]);

export async function computePackagingSignalsStep() {
  const db = getClient();
  const [allPorts, allDependencies, allFiles, allVersions] = await Promise.all([
    db.select().from(ports),
    db.select().from(portDependencies),
    db.select().from(portFiles),
    db.select().from(portVersions),
  ]);

  const dependenciesByPort = groupBy(allDependencies, (row) => row.portName);
  const filesByPort = groupBy(allFiles, (row) => row.portName);
  const versionsByPort = groupBy(allVersions, (row) => row.portName);
  const now = new Date().toISOString();

  for (const port of allPorts) {
    const dependencies = dependenciesByPort.get(port.name) ?? [];
    const files = filesByPort.get(port.name) ?? [];
    const versions = versionsByPort.get(port.name) ?? [];

    const patchStats = buildPatchStats(port, files);
    const sourceProvenance = parseSourceProvenance(port.portfileText ?? "", {
      version: port.version ?? undefined,
    });
    const registryStats = buildRegistryStats(port, versions);
    const relevantDependencies = dependencies.filter((row) => !isIgnoredPackagingDependency(row));
    const dependencyCount = relevantDependencies.length;
    const hostDependencyCount = relevantDependencies.filter((row) => row.host).length;
    const risk = computePackagingRisk({
      patching: patchStats,
      sourceProvenance,
      dependencyCount,
      hostDependencyCount,
      churn90d: registryStats.churn90d,
    });
    const serializedRisk = serializePackagingRiskDetails(risk);

    await db.insert(portPatchStats).values({
      portName: port.name,
      patchCount: patchStats.patchCount,
      patchBytesTotal: patchStats.patchBytesTotal,
      declaredPatchCount: patchStats.declaredPatchCount,
      burdenLabel: patchStats.burdenLabel,
      patchFilesJson: JSON.stringify(patchStats.patchFiles),
      unreferencedPatchFilesJson: patchStats.unreferencedPatchFiles.length > 0
        ? JSON.stringify(patchStats.unreferencedPatchFiles)
        : null,
      missingPatchFilesJson: patchStats.missingPatchFiles.length > 0
        ? JSON.stringify(patchStats.missingPatchFiles)
        : null,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: portPatchStats.portName,
      set: {
        patchCount: patchStats.patchCount,
        patchBytesTotal: patchStats.patchBytesTotal,
        declaredPatchCount: patchStats.declaredPatchCount,
        burdenLabel: patchStats.burdenLabel,
        patchFilesJson: JSON.stringify(patchStats.patchFiles),
        unreferencedPatchFilesJson: patchStats.unreferencedPatchFiles.length > 0
          ? JSON.stringify(patchStats.unreferencedPatchFiles)
          : null,
        missingPatchFilesJson: patchStats.missingPatchFiles.length > 0
          ? JSON.stringify(patchStats.missingPatchFiles)
          : null,
        updatedAt: now,
      },
    });

    await db.insert(portSourceProvenance).values({
      portName: port.name,
      provider: sourceProvenance.provider,
      sourceUrl: sourceProvenance.sourceUrl ?? null,
      normalizedRepoUrl: sourceProvenance.normalizedRepoUrl ?? null,
      ref: sourceProvenance.ref ?? null,
      refKind: sourceProvenance.refKind ?? null,
      quality: sourceProvenance.quality,
      isExact: sourceProvenance.isExact,
      confidence: sourceProvenance.confidence,
      detectedFrom: sourceProvenance.detectedFrom,
      reason: sourceProvenance.reason,
      referenceUrl: sourceProvenance.referenceUrl ?? null,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: portSourceProvenance.portName,
      set: {
        provider: sourceProvenance.provider,
        sourceUrl: sourceProvenance.sourceUrl ?? null,
        normalizedRepoUrl: sourceProvenance.normalizedRepoUrl ?? null,
        ref: sourceProvenance.ref ?? null,
        refKind: sourceProvenance.refKind ?? null,
        quality: sourceProvenance.quality,
        isExact: sourceProvenance.isExact,
        confidence: sourceProvenance.confidence,
        detectedFrom: sourceProvenance.detectedFrom,
        reason: sourceProvenance.reason,
        referenceUrl: sourceProvenance.referenceUrl ?? null,
        updatedAt: now,
      },
    });

    await db.insert(portRegistryStats).values({
      portName: port.name,
      currentVersionPublishedAt: registryStats.currentVersionPublishedAt ?? null,
      lastChangedAt: registryStats.lastChangedAt ?? null,
      churn30d: registryStats.churn30d,
      churn90d: registryStats.churn90d,
      churn365d: registryStats.churn365d,
      sameVersionPortBumps: registryStats.sameVersionPortBumps,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: portRegistryStats.portName,
      set: {
        currentVersionPublishedAt: registryStats.currentVersionPublishedAt ?? null,
        lastChangedAt: registryStats.lastChangedAt ?? null,
        churn30d: registryStats.churn30d,
        churn90d: registryStats.churn90d,
        churn365d: registryStats.churn365d,
        sameVersionPortBumps: registryStats.sameVersionPortBumps,
        updatedAt: now,
      },
    });

    await db.insert(packagingRiskScores).values({
      portName: port.name,
      score: risk.score,
      label: risk.label,
      reasonsJson: serializedRisk.reasonsJson,
      componentsJson: serializedRisk.componentsJson,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: packagingRiskScores.portName,
      set: {
        score: risk.score,
        label: risk.label,
        reasonsJson: serializedRisk.reasonsJson,
        componentsJson: serializedRisk.componentsJson,
        updatedAt: now,
      },
    });
  }

  await Promise.all([
    db.delete(portPatchStats).where(sql`${portPatchStats.portName} NOT IN (SELECT name FROM ports)`),
    db.delete(portSourceProvenance).where(sql`${portSourceProvenance.portName} NOT IN (SELECT name FROM ports)`),
    db.delete(portRegistryStats).where(sql`${portRegistryStats.portName} NOT IN (SELECT name FROM ports)`),
    db.delete(packagingRiskScores).where(sql`${packagingRiskScores.portName} NOT IN (SELECT name FROM ports)`),
  ]);

  console.log(`Packaging signals computed for ${allPorts.length} ports`);
}

function isIgnoredPackagingDependency(row: DependencyRow): boolean {
  return Boolean(row.host) && IGNORED_PACKAGING_HOST_DEPS.has(row.dependencyName.toLowerCase());
}

type PatchStats = {
  patchCount: number;
  patchBytesTotal: number;
  declaredPatchCount: number;
  burdenLabel: "none" | "light" | "moderate" | "heavy";
  patchFiles: Array<{ path: string; sizeBytes?: number }>;
  unreferencedPatchFiles: string[];
  missingPatchFiles: string[];
};

function buildPatchStats(port: PortRow, files: FileRow[]): PatchStats {
  const patchFiles = files
    .filter((file) => file.fileType === "patch" || /\.(patch|diff)$/i.test(file.path))
    .map((file) => ({
      path: file.path,
      sizeBytes: file.sizeBytes ?? undefined,
    }))
    .sort((left, right) => left.path.localeCompare(right.path));

  const declaredPatchPaths = port.portfileText ? extractDeclaredPatchPaths(port.portfileText) : [];
  const actualPaths = new Set(patchFiles.map((file) => file.path));
  const declaredPaths = new Set(declaredPatchPaths);

  return {
    patchCount: patchFiles.length,
    patchBytesTotal: patchFiles.reduce((sum, file) => sum + (file.sizeBytes ?? 0), 0),
    declaredPatchCount: declaredPatchPaths.length,
    burdenLabel: patchBurdenLabel(patchFiles.length),
    patchFiles,
    unreferencedPatchFiles: patchFiles
      .map((file) => file.path)
      .filter((path) => !declaredPaths.has(path)),
    missingPatchFiles: declaredPatchPaths.filter((path) => !actualPaths.has(path)),
  };
}

function buildRegistryStats(port: PortRow, versions: VersionRow[]) {
  const currentVersion = versions.find((row) =>
    row.version === port.version && (row.portVersion ?? 0) === (port.portVersion ?? 0)
  ) ?? null;
  const publishedDates = versions
    .map((row) => row.publishedAt)
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  const lastChangedAt = publishedDates.length > 0
    ? publishedDates.reduce((latest, current) => current > latest ? current : latest)
    : port.updatedInRegistryAt ?? port.vcpkgUpdatedAt ?? undefined;
  const sameVersionPortBumps = Array.from(
    versions.reduce((counts, row) => {
      counts.set(row.version, (counts.get(row.version) ?? 0) + 1);
      return counts;
    }, new Map<string, number>()).values(),
  ).reduce((sum, count) => sum + Math.max(0, count - 1), 0);

  return {
    currentVersionPublishedAt: currentVersion?.publishedAt ?? undefined,
    lastChangedAt,
    churn30d: countWithinDays(publishedDates, 30),
    churn90d: countWithinDays(publishedDates, 90),
    churn365d: countWithinDays(publishedDates, 365),
    sameVersionPortBumps,
  };
}

function countWithinDays(values: string[], days: number): number {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return values.filter((value) => {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) && timestamp >= cutoff;
  }).length;
}

function patchBurdenLabel(count: number): PatchStats["burdenLabel"] {
  if (count <= 0) return "none";
  if (count <= 2) return "light";
  if (count <= 5) return "moderate";
  return "heavy";
}

function groupBy<TItem, TKey>(items: TItem[], getKey: (item: TItem) => TKey): Map<TKey, TItem[]> {
  const grouped = new Map<TKey, TItem[]>();

  for (const item of items) {
    const key = getKey(item);
    const existing = grouped.get(key);
    if (existing) {
      existing.push(item);
    } else {
      grouped.set(key, [item]);
    }
  }

  return grouped;
}
