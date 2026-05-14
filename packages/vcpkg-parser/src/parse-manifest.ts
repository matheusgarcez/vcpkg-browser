export type VcpkgManifest = {
  name: string;
  version?: string;
  "version-string"?: string;
  "version-semver"?: string;
  "version-date"?: string;
  "port-version"?: number;
  "default-features"?: string[];
  description?: string | string[];
  homepage?: string;
  license?: string;
  supports?: string;
  dependencies?: Array<string | VcpkgDependency>;
  features?: Record<string, VcpkgFeature>;
  "$schema"?: string;
};

export type VcpkgDependency = {
  name: string;
  features?: string[];
  "default-features"?: boolean;
  platform?: string;
  host?: boolean;
  "dependency-type"?: "test" | "supplement";
};

export type VcpkgFeature = {
  description?: string | string[];
  dependencies?: Array<string | VcpkgDependency>;
  supports?: string;
};

export function parseManifest(json: string): VcpkgManifest {
  return JSON.parse(json) as VcpkgManifest;
}

export function normalizeDescription(value: unknown): string {
  if (Array.isArray(value)) return value.join(" ");
  if (typeof value === "string") return value;
  return "";
}

export function normalizeVersion(manifest: VcpkgManifest): string {
  return (
    manifest.version ??
    manifest["version-string"] ??
    manifest["version-semver"] ??
    manifest["version-date"] ??
    "0.0.0"
  );
}

export function parseDependencies(
  deps?: Array<string | VcpkgDependency>
): Array<{ name: string; features?: string[]; defaultFeatures?: boolean; platform?: string; host?: boolean; dependencyType?: string }> {
  if (!deps) return [];

  return deps.map((dep) => {
    if (typeof dep === "string") {
      return { name: dep };
    }
    return {
      name: dep.name,
      features: dep.features,
      defaultFeatures: dep["default-features"],
      platform: dep.platform,
      host: dep.host,
      dependencyType: dep["dependency-type"],
    };
  });
}

export function parseFeatures(
  features?: Record<string, VcpkgFeature>,
  defaultFeatures?: string[]
): Array<{
  name: string;
  description?: string;
  dependencies?: Array<{
    name: string;
    features?: string[];
    defaultFeatures?: boolean;
    platform?: string;
    host?: boolean;
    dependencyType?: string;
  }>;
  supports?: string;
  defaultFeature?: boolean;
}> {
  if (!features) return [];

  return Object.entries(features).map(([name, feat]) => {
    const dependencies = feat.dependencies ? parseDependencies(feat.dependencies) : undefined;
    return {
      name,
      description: normalizeDescription(feat.description),
      dependencies,
      supports: feat.supports,
      defaultFeature: defaultFeatures?.includes(name) ?? false,
    };
  });
}
