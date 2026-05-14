import { historicalPortSnapshots, getClient } from "@pkg/db";
import type { DependencyDto, FeatureDto, PortFileDto } from "@pkg/shared";
import { eq } from "drizzle-orm";

type HistoricalSnapshotData = {
  description?: string;
  homepage?: string;
  license?: string;
  supports?: string;
  usage?: string;
  manifest: unknown;
  dependencies: DependencyDto[];
  features: FeatureDto[];
  files: PortFileDto[];
};

type HistoricalSnapshotFile = {
  fileType: string;
  path: string;
  content?: string;
  sizeBytes?: number;
  updatedAt: string;
};

function parseJsonArray<T>(value: string): T[] {
  return JSON.parse(value) as T[];
}

function parseFeatureDependencies(features: FeatureDto[]): FeatureDto[] {
  return features.map((feature) => ({
    ...feature,
    dependencies: feature.dependencies?.map((dependency) =>
      typeof dependency === "string" ? { name: dependency } : dependency
    ),
  }));
}

function toPortFiles(files: HistoricalSnapshotFile[]): PortFileDto[] {
  return files.map((file, index) => ({
    id: index + 1,
    fileType: file.fileType,
    path: file.path,
    content: file.content,
    sizeBytes: file.sizeBytes,
    updatedAt: file.updatedAt,
  }));
}

export async function getHistoricalSnapshot(gitTree?: string | null): Promise<HistoricalSnapshotData | null> {
  if (!gitTree) return null;

  const db = getClient();
  const snapshot = await db.select()
    .from(historicalPortSnapshots)
    .where(eq(historicalPortSnapshots.gitTree, gitTree))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!snapshot) return null;

  return {
    description: snapshot.description ?? undefined,
    homepage: snapshot.homepage ?? undefined,
    license: snapshot.license ?? undefined,
    supports: snapshot.supports ?? undefined,
    usage: snapshot.usageText ?? undefined,
    manifest: JSON.parse(snapshot.manifestJson),
    dependencies: parseJsonArray<DependencyDto>(snapshot.dependenciesJson),
    features: parseFeatureDependencies(parseJsonArray<FeatureDto>(snapshot.featuresJson)),
    files: toPortFiles(parseJsonArray<HistoricalSnapshotFile>(snapshot.filesJson)),
  };
}
