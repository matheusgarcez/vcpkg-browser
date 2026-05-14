import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseDependencies, parseFeatures, parseManifest, normalizeDescription } from "./parse-manifest.js";
import { parseUsage } from "./parse-usage.js";

const execFileAsync = promisify(execFile);
const GIT_MAX_BUFFER = 8 * 1024 * 1024;

export class InvalidHistoricalTreeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidHistoricalTreeError";
  }
}

export type MaterializeHistoricalSnapshotInput = {
  portName: string;
  version: string;
  portVersion: number;
  gitTree: string;
};

export type MaterializedHistoricalSnapshot = {
  portName: string;
  version: string;
  portVersion: number;
  gitTree: string;
  manifestJson: string;
  usageText: string | null;
  description: string | null;
  homepage: string | null;
  license: string | null;
  supports: string | null;
  dependenciesJson: string;
  featuresJson: string;
  filesJson: string;
  createdAt: string;
  updatedAt: string;
};

type HistoricalSnapshotFile = {
  fileType: string;
  path: string;
  content?: string;
  sizeBytes?: number;
  updatedAt: string;
};

type GitTreeEntry = {
  path: string;
  sizeBytes?: number;
};

type LegacyControlManifest = {
  name: string;
  version?: string;
  description?: string;
  homepage?: string;
  license?: string;
  dependencies?: string[];
};

async function runGit(repoDir: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", repoDir, ...args], {
    encoding: "utf8",
    maxBuffer: GIT_MAX_BUFFER,
  });
  return stdout;
}

async function resolveTreeish(repoDir: string, gitTree: string): Promise<string> {
  let objectType: string;
  try {
    objectType = (await runGit(repoDir, ["cat-file", "-t", gitTree])).trim();
  } catch {
    throw new InvalidHistoricalTreeError(`Missing historical git object: ${gitTree}`);
  }

  if (objectType === "tree") return gitTree;
  if (objectType === "commit") return `${gitTree}^{tree}`;

  throw new InvalidHistoricalTreeError(`Historical git object is not a tree or commit: ${gitTree} (${objectType})`);
}

function classifyFile(path: string): string {
  if (path === "vcpkg.json") return "manifest";
  if (path === "portfile.cmake") return "portfile";
  if (path === "usage") return "usage";
  if (/\.(patch|diff)$/i.test(path)) return "patch";
  return "file";
}

function parseGitTreeEntries(output: string): GitTreeEntry[] {
  return output
    .split("\u0000")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .flatMap((entry) => {
      const tabIndex = entry.indexOf("\t");
      if (tabIndex === -1) return [];

      const metadata = entry.slice(0, tabIndex).trim().split(/\s+/);
      const relativePath = entry.slice(tabIndex + 1);
      if (!relativePath) return [];

      const sizeRaw = metadata[3];
      const sizeBytes = sizeRaw && sizeRaw !== "-"
        ? Number.parseInt(sizeRaw, 10)
        : undefined;

      return [{
        path: relativePath,
        sizeBytes: Number.isNaN(sizeBytes ?? Number.NaN) ? undefined : sizeBytes,
      }];
    });
}

function parseLegacyControl(content: string): LegacyControlManifest {
  const fields = new Map<string, string>();
  let currentKey: string | null = null;

  for (const rawLine of content.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (!line.trim()) {
      currentKey = null;
      continue;
    }

    const fieldMatch = line.match(/^([A-Za-z-]+):\s*(.*)$/);
    if (fieldMatch) {
      currentKey = fieldMatch[1].toLowerCase();
      fields.set(currentKey, fieldMatch[2].trim());
      continue;
    }

    if (currentKey && /^\s+/.test(line)) {
      const previous = fields.get(currentKey) ?? "";
      fields.set(currentKey, `${previous} ${line.trim()}`.trim());
    }
  }

  const buildDepends = fields.get("build-depends");
  return {
    name: fields.get("source") ?? "",
    version: fields.get("version"),
    description: fields.get("description"),
    homepage: fields.get("homepage"),
    license: fields.get("license"),
    dependencies: buildDepends
      ? buildDepends
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
          .map((value) => value.replace(/\s*\(.*?\)\s*/g, "").trim())
          .filter(Boolean)
      : undefined,
  };
}

export async function materializeHistoricalSnapshot(
  repoDir: string,
  versionRow: MaterializeHistoricalSnapshotInput,
): Promise<MaterializedHistoricalSnapshot> {
  const treeish = await resolveTreeish(repoDir, versionRow.gitTree);
  const fileListOutput = await runGit(repoDir, ["ls-tree", "-r", "-z", "-l", treeish]);
  const treeEntries = parseGitTreeEntries(fileListOutput);

  const now = new Date().toISOString();
  const files: HistoricalSnapshotFile[] = treeEntries.map((entry) => ({
    fileType: classifyFile(entry.path),
    path: entry.path,
    sizeBytes: entry.sizeBytes,
    updatedAt: now,
  }));
  let manifestContent: string | undefined;
  let controlContent: string | undefined;
  let normalizedUsageText: string | undefined;
  const fetchPaths = ["vcpkg.json", "CONTROL", "usage", "portfile.cmake"] as const;

  await Promise.all(fetchPaths.map(async (relativePath) => {
    const file = files.find((entry) => entry.path === relativePath);
    if (!file) return;

    let content: string;
    try {
      content = await runGit(repoDir, ["show", `${treeish}:${relativePath}`]);
    } catch {
      return;
    }

    if (content.includes("\u0000")) return;

    if (relativePath === "vcpkg.json") {
      manifestContent = content;
    } else if (relativePath === "CONTROL") {
      controlContent = content;
    } else if (relativePath === "usage") {
      normalizedUsageText = parseUsage(content);
    } else if (relativePath === "portfile.cmake") {
      file.content = content;
      file.sizeBytes = Buffer.byteLength(content, "utf8");
    }
  }));

  files.sort((left, right) => left.path.localeCompare(right.path));

  if (!manifestContent && !controlContent) {
    throw new Error(`Historical snapshot ${versionRow.portName}@${versionRow.version} is missing vcpkg.json in git tree ${versionRow.gitTree}`);
  }

  let manifest: unknown;
  let dependencies: ReturnType<typeof parseDependencies>;
  let features: ReturnType<typeof parseFeatures>;
  let description: string | null;
  let homepage: string | null;
  let license: string | null;
  let supports: string | null;

  if (manifestContent) {
    const parsedManifest = parseManifest(manifestContent);
    manifest = parsedManifest;
    dependencies = parseDependencies(parsedManifest.dependencies);
    features = parseFeatures(parsedManifest.features, parsedManifest["default-features"]);
    description = normalizeDescription(parsedManifest.description) || null;
    homepage = parsedManifest.homepage ?? null;
    license = parsedManifest.license ?? null;
    supports = parsedManifest.supports ?? null;
  } else {
    const parsedControl = parseLegacyControl(controlContent ?? "");
    manifest = {
      name: parsedControl.name || versionRow.portName,
      "version-string": parsedControl.version ?? versionRow.version,
      description: parsedControl.description ?? "",
      homepage: parsedControl.homepage,
      license: parsedControl.license,
      dependencies: parsedControl.dependencies ?? [],
    };
    dependencies = (parsedControl.dependencies ?? []).map((name) => ({ name }));
    features = [];
    description = parsedControl.description ?? null;
    homepage = parsedControl.homepage ?? null;
    license = parsedControl.license ?? null;
    supports = null;
  }

  return {
    portName: versionRow.portName,
    version: versionRow.version,
    portVersion: versionRow.portVersion,
    gitTree: versionRow.gitTree,
    manifestJson: JSON.stringify(manifest),
    usageText: normalizedUsageText ?? null,
    description,
    homepage,
    license,
    supports,
    dependenciesJson: JSON.stringify(dependencies),
    featuresJson: JSON.stringify(features),
    filesJson: JSON.stringify(files),
    createdAt: now,
    updatedAt: now,
  };
}
