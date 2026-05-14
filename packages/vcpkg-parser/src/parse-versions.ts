export type VersionEntry = {
  version?: string;
  "version-string"?: string;
  "version-semver"?: string;
  "port-version"?: number;
  "git-tree"?: string;
  "version-date"?: string;
};

export type VersionDatabase = {
  "versions-baseline"?: Array<{ "baseline"?: string; "port-version"?: number }>;
  versions?: VersionEntry[];
};

export type BaselineEntry = {
  name: string;
  baseline: string;
  "port-version"?: number;
};

export type BaselineDatabase = {
  [portName: string]: BaselineEntry;
};

export function parseVersionDatabase(json: string): VersionDatabase {
  return JSON.parse(json) as VersionDatabase;
}

export function parseBaseline(json: string): BaselineDatabase {
  return JSON.parse(json) as BaselineDatabase;
}

export function parseVersionsArray(json: string): VersionEntry[] {
  const db = parseVersionDatabase(json);
  return db.versions ?? [];
}

export function normalizeVersionEntry(version: VersionEntry): string {
  return (
    version.version ??
    version["version-string"] ??
    version["version-semver"] ??
    version["version-date"] ??
    ""
  );
}

export function isDateBasedVersion(value?: string | null): boolean {
  if (!value) return false;
  return /^(\d{4}-\d{2}-\d{2}|\d{8})(?:[._-]\d+)?$/.test(value);
}

export function normalizeVersionDateValue(value?: string | null): string | undefined {
  if (!isDateBasedVersion(value)) return undefined;

  const hyphenatedMatch = value!.match(/^(\d{4}-\d{2}-\d{2})(?:[._-]\d+)?$/);
  if (hyphenatedMatch) {
    const date = new Date(hyphenatedMatch[1]);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }

  const compactMatch = value!.match(/^(\d{4})(\d{2})(\d{2})(?:[._-]\d+)?$/);
  if (!compactMatch) return undefined;

  const date = new Date(`${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
