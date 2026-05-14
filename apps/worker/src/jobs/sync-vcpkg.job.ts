import { createClient, getClient, getSqlite } from "@pkg/db";
import {
  ports,
  portVersions,
  portFeatures,
  portDependencies,
  portFiles,
  registrySnapshots,
  upstreamRepositories,
  tripletSupport,
  maintenanceScores,
  upstreamIssues,
  catalogMeta,
  historicalPortSnapshots,
  portPatchStats,
  portSourceProvenance,
  portRegistryStats,
  packagingRiskScores,
} from "@pkg/db";
import { createGitHubClient } from "@pkg/github";
import { parseManifest, normalizeDescription, normalizeVersion, parseDependencies, parseFeatures, normalizeVersionEntry, parseUsage, normalizeVersionDateValue } from "@pkg/vcpkg-parser";
import { detectUpstream } from "@pkg/vcpkg-parser";
import { evaluateSupports } from "@pkg/vcpkg-parser";
import simpleGit from "simple-git";
import PQueue from "p-queue";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { eq, sql } from "drizzle-orm";
import { createJobRun, completeJobRun, failJobRun, updateJobProgress } from "./helpers.js";
import { clearedUpstreamMetadata, refreshGitHubRepo } from "./refresh-github-shared.js";
import { computePackagingSignalsStep } from "./internal/compute-packaging-signals.js";
import { computePortHistoryDatesStep } from "./internal/port-history-dates.js";
import { computeScoresStep } from "./internal/compute-scores.js";
import { materializeHistoricalSnapshotsStep } from "./internal/materialize-historical-snapshots.js";
import { rebuildSearchIndexStep } from "./internal/rebuild-search.js";
import { loadConfig } from "../config.js";
import { isJobInvocation, runJobWithLock, type ClearLockOptions } from "./job-cli.js";

const config = loadConfig();
const execFileAsync = promisify(execFile);

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function createProgressLogger(
  label: string,
  total: number,
  options?: {
    logEvery?: number;
    minIntervalMs?: number;
  },
) {
  const startedAt = Date.now();
  const logEvery = Math.max(1, options?.logEvery ?? (Math.ceil(total / 20) || 1));
  const minIntervalMs = options?.minIntervalMs ?? 5_000;
  let current = 0;
  let lastLoggedAt = startedAt;

  function log(force = false) {
    const now = Date.now();
    if (!force && current < total && current % logEvery !== 0 && now - lastLoggedAt < minIntervalMs) {
      return false;
    }

    const elapsedMs = now - startedAt;
    const percent = total > 0 ? ((current / total) * 100).toFixed(1) : "100.0";
    const avgMsPerItem = current > 0 ? elapsedMs / current : 0;
    const remainingItems = Math.max(0, total - current);
    const etaMs = avgMsPerItem * remainingItems;

    console.log(
      `${label}: ${current}/${total} (${percent}%) elapsed ${formatDuration(elapsedMs)}`
      + (current > 0 && remainingItems > 0 ? ` eta ${formatDuration(etaMs)}` : ""),
    );
    lastLoggedAt = now;
    return true;
  }

  return {
    tick(step = 1) {
      current = Math.min(total, current + step);
      return log(false);
    },
    finish() {
      current = total;
      log(true);
    },
  };
}

function sha256(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function buildRepoUrl(upstream: { provider: string; owner?: string; repo?: string; url?: string }): string {
  const { provider, owner, repo, url } = upstream;
  if ((["github", "gitlab", "bitbucket"] as string[]).includes(provider) && owner && repo) {
    return `https://${provider}.com/${owner}/${repo}`;
  }
  return url ?? "";
}

type RepoState = {
  localHead: string;
  remoteHead: string;
  changed: boolean;
};

type LatestRepoRelease = {
  version: string;
  publishedAt: string;
  commitSha: string;
};

function upstreamIdentityMatches(
  existing: typeof upstreamRepositories.$inferSelect | undefined,
  next: { provider: string; owner?: string; repo?: string; repoUrl: string },
): boolean {
  if (!existing) return false;
  return existing.provider === next.provider
    && (existing.owner ?? null) === (next.owner ?? null)
    && (existing.repo ?? null) === (next.repo ?? null)
    && existing.repoUrl === next.repoUrl;
}

function parseChangedPortNames(diffText: string): Set<string> {
  const changed = new Set<string>();

  for (const line of diffText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const portMatch = trimmed.match(/^ports\/([^/]+)\//);
    if (portMatch?.[1]) {
      changed.add(portMatch[1]);
      continue;
    }

    const versionMatch = trimmed.match(/^versions\/[^/]+\/(.+)\.json$/);
    if (versionMatch?.[1]) {
      changed.add(versionMatch[1]);
    }
  }

  return changed;
}

async function collectChangedPortNames(previousCommitSha: string, currentCommitSha: string): Promise<Set<string>> {
  if (!previousCommitSha || previousCommitSha === currentCommitSha) {
    return new Set();
  }

  const git = simpleGit(config.VCPKG_REPO_DIR);
  const diffText = await git.diff([
    "--name-only",
    previousCommitSha,
    currentCommitSha,
    "--",
    "ports",
    "versions",
  ]);

  return parseChangedPortNames(diffText);
}

export async function ensureRepo(): Promise<RepoState> {
  try {
    await fs.access(config.VCPKG_REPO_DIR);
    const git = simpleGit(config.VCPKG_REPO_DIR);

    await git.status();
    const isShallow = (await git.raw(["rev-parse", "--is-shallow-repository"])).trim() === "true";
    if (isShallow) {
      await git.fetch(["--unshallow"]);
    }
    await git.fetch("origin", config.VCPKG_BRANCH);

    const localHead = (await git.revparse(["HEAD"])).trim();
    const remoteHead = (await git.revparse([`origin/${config.VCPKG_BRANCH}`])).trim();

    if (localHead !== remoteHead) {
      await git.reset(["--hard", remoteHead]);
    }

    return {
      localHead,
      remoteHead,
      changed: localHead !== remoteHead,
    };
  } catch {
    try {
      await fs.rm(config.VCPKG_REPO_DIR, { recursive: true, force: true });
    } catch { /* ignore */ }
    const git = simpleGit();
    await git.clone(config.VCPKG_REPO_URL, config.VCPKG_REPO_DIR, ["--depth", "1", "--branch", config.VCPKG_BRANCH]);

    const repoGit = simpleGit(config.VCPKG_REPO_DIR);
    await repoGit.fetch(["--unshallow"]);
    const head = (await repoGit.revparse(["HEAD"])).trim();
    return {
      localHead: head,
      remoteHead: head,
      changed: true,
    };
  }
}

async function getLatestRepoRelease(): Promise<LatestRepoRelease | null> {
  const git = simpleGit(config.VCPKG_REPO_DIR);
  const rows = await git.raw([
    "for-each-ref",
    "refs/tags",
    "--sort=-creatordate",
    "--format=%(refname:short)|%(creatordate:iso8601)|%(objectname)",
    "--count=1",
  ]);

  const [line] = rows
    .split("\n")
    .map((row) => row.trim())
    .filter(Boolean);

  if (!line) return null;

  const [version, publishedAtRaw, commitSha] = line.split("|");
  if (!version || !publishedAtRaw || !commitSha) return null;

  const publishedAt = new Date(publishedAtRaw).toISOString();
  if (Number.isNaN(new Date(publishedAt).getTime())) return null;

  return {
    version,
    publishedAt,
    commitSha,
  };
}

interface PortFileEntry {
  fileType: string;
  path: string;
  content: string;
}

interface ParsedPort {
  name: string;
  displayName: string;
  version: string;
  portVersion: number;
  versionsPath?: string;
  vcpkgTreeSha?: string;
  description: string;
  homepage?: string;
  license?: string;
  supports?: string;
  usageText?: string;
  portfileText?: string;
  sourceUrl?: string;
  manifestJson: string;
  dependencies: ReturnType<typeof parseDependencies>;
  features: ReturnType<typeof parseFeatures>;
  upstream: ReturnType<typeof detectUpstream>;
  files: PortFileEntry[];
}

async function collectPatchFileEntries(portDir: string, relativeDir = ""): Promise<PortFileEntry[]> {
  const patchEntries: PortFileEntry[] = [];
  const entries = await fs.readdir(path.join(portDir, relativeDir), { withFileTypes: true });

  for (const entry of entries) {
    const nextRelativePath = relativeDir ? path.posix.join(relativeDir, entry.name) : entry.name;

    if (entry.isDirectory()) {
      patchEntries.push(...await collectPatchFileEntries(portDir, nextRelativePath));
      continue;
    }

    if (!/\.(patch|diff)$/i.test(entry.name)) {
      continue;
    }

    const patchContent = await fs.readFile(path.join(portDir, nextRelativePath), "utf-8");
    patchEntries.push({ fileType: "patch", path: nextRelativePath, content: patchContent });
  }

  return patchEntries;
}

async function parsePortsDir(): Promise<ParsedPort[]> {
  const portsDir = path.join(config.VCPKG_REPO_DIR, "ports");
  const entries = await fs.readdir(portsDir, { withFileTypes: true });
  const directoryEntries = entries.filter((entry) => entry.isDirectory());
  const progress = createProgressLogger("Parsing ports", directoryEntries.length, {
    logEvery: 50,
  });
  const portResults: ParsedPort[] = [];

  for (const entry of directoryEntries) {
    const portDir = path.join(portsDir, entry.name);
    try {
      const manifestPath = path.join(portDir, "vcpkg.json");
      const manifestContent = await fs.readFile(manifestPath, "utf-8");
      const manifest = parseManifest(manifestContent);

      const files: PortFileEntry[] = [
        { fileType: "manifest", path: "vcpkg.json", content: manifestContent },
      ];

      let portfileText: string | undefined;
      try {
        portfileText = await fs.readFile(path.join(portDir, "portfile.cmake"), "utf-8");
        files.push({ fileType: "portfile", path: "portfile.cmake", content: portfileText });
      } catch { /* no portfile */ }

      let usageText: string | undefined;
      try {
        const usageFile = await fs.readFile(path.join(portDir, "usage"), "utf-8");
        usageText = parseUsage(usageFile);
        files.push({ fileType: "usage", path: "usage", content: usageFile });
      } catch { /* no usage file */ }

      try {
        files.push(...await collectPatchFileEntries(portDir));
      } catch { /* can't scan dir */ }

      const upstream = detectUpstream(portfileText, manifest.homepage);
      const deps = parseDependencies(manifest.dependencies);
      const feats = parseFeatures(manifest.features, manifest["default-features"]);

      portResults.push({
        name: manifest.name || entry.name,
        displayName: entry.name,
        version: normalizeVersion(manifest),
        portVersion: manifest["port-version"] ?? 0,
        description: normalizeDescription(manifest.description),
        homepage: manifest.homepage,
        license: manifest.license,
        supports: manifest.supports,
        usageText,
        portfileText,
        sourceUrl: upstream.url,
        manifestJson: JSON.stringify(manifest),
        dependencies: deps,
        features: feats,
        upstream,
        files,
      });
    } catch (err) {
      console.error(`Failed to parse port ${entry.name}:`, err);
    }

    progress.tick();
  }

  progress.finish();
  return portResults;
}

interface VersionEntry {
  portName: string;
  version: string;
  portVersion?: number;
  gitTree?: string;
  versionDate?: string;
  registryCommit?: string;
  publishedAt?: string;
}

type ParsedVersionsDir = {
  versions: VersionEntry[];
  versionsPathByPort: Map<string, string>;
};

type VersionFileTask = {
  bucket: string;
  file: string;
  portName: string;
};

type ParsedVersionFile = {
  portName: string;
  versionsPath: string;
  versions: VersionEntry[];
};

type ExistingVersionMetadata = {
  gitTree?: string;
  registryCommit?: string;
  publishedAt?: string;
};

async function getVersionEntryMetadata(
  versionsPath: string,
  content: string,
): Promise<Map<string, { registryCommit?: string; publishedAt?: string }>> {
  let parsedDb: { versions?: Array<Record<string, unknown>> };
  try {
    parsedDb = JSON.parse(content) as { versions?: Array<Record<string, unknown>> };
  } catch {
    return new Map();
  }

  const versionEntries = parsedDb.versions ?? [];
  if (versionEntries.length === 0) return new Map();

  let blameOutput: string;
  try {
    const { stdout } = await execFileAsync("git", [
      "-C",
      config.VCPKG_REPO_DIR,
      "blame",
      "--line-porcelain",
      "--",
      versionsPath,
    ], {
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
    });
    blameOutput = stdout;
  } catch {
    return new Map();
  }

  const lineMetadata = new Map<number, { registryCommit?: string; publishedAt?: string }>();
  let currentCommit = "";
  let currentPublishedAt: string | undefined;
  let finalLine = 0;

  for (const line of blameOutput.split("\n")) {
    const headerMatch = line.match(/^([0-9a-f]{40})\s+\d+\s+(\d+)\s+\d+$/);
    if (headerMatch) {
      currentCommit = headerMatch[1];
      finalLine = Number.parseInt(headerMatch[2], 10);
      currentPublishedAt = undefined;
      continue;
    }

    if (line.startsWith("committer-time ")) {
      const epochSeconds = Number.parseInt(line.slice("committer-time ".length), 10);
      currentPublishedAt = Number.isNaN(epochSeconds) ? undefined : new Date(epochSeconds * 1000).toISOString();
      continue;
    }

    if (line.startsWith("\t")) {
      lineMetadata.set(finalLine, {
        registryCommit: currentCommit,
        publishedAt: currentPublishedAt,
      });
    }
  }

  const gitTreeLineNumbers = content
    .split("\n")
    .map((line, index) => line.includes('"git-tree"') ? index + 1 : null)
    .filter((lineNumber): lineNumber is number => lineNumber !== null);

  if (gitTreeLineNumbers.length !== versionEntries.length) {
    return new Map();
  }

  const overrides = new Map<string, { registryCommit?: string; publishedAt?: string }>();
  versionEntries.forEach((entry, index) => {
    const version = normalizeVersionEntry(entry);
    if (!version) return;
    const metadata = lineMetadata.get(gitTreeLineNumbers[index]);
    if (!metadata) return;
    overrides.set(`${version}#${(entry["port-version"] as number | undefined) ?? 0}`, metadata);
  });

  return overrides;
}

async function parseVersionsDir(
  validPortNames?: Set<string>,
  existingVersionMetadataByPort?: Map<string, Map<string, ExistingVersionMetadata>>,
): Promise<ParsedVersionsDir> {
  const versionsDir = path.join(config.VCPKG_REPO_DIR, "versions");
  const allVersions: VersionEntry[] = [];
  const versionsPathByPort = new Map<string, string>();

  try {
    const portDirs = await fs.readdir(versionsDir, { withFileTypes: true });
    const versionTasks: VersionFileTask[] = [];

    for (const dir of portDirs) {
      if (!dir.isDirectory()) continue;
      const versionFiles = await fs.readdir(path.join(versionsDir, dir.name));
      for (const file of versionFiles) {
        if (!file.endsWith(".json")) continue;
        const portName = file.replace(/\.json$/, "");
        if (validPortNames && !validPortNames.has(portName)) continue;
        versionTasks.push({ bucket: dir.name, file, portName });
      }
    }

    const progress = createProgressLogger("Parsing version files", versionTasks.length, {
      logEvery: 25,
    });
    const queue = new PQueue({ concurrency: 8 });
    const results = await queue.addAll(
      versionTasks.map((task) => async (): Promise<ParsedVersionFile | null> => {
        try {
          const versionsPath = path.posix.join("versions", task.bucket, task.file);
          const content = await fs.readFile(path.join(versionsDir, task.bucket, task.file), "utf-8");
          const db = JSON.parse(content);
          const versions: VersionEntry[] = [];
          const rawEntries = Array.isArray(db.versions) ? db.versions : [];
          const existingVersionMetadata = existingVersionMetadataByPort?.get(task.portName);
          let canReuseExistingMetadata = rawEntries.length > 0 && !!existingVersionMetadata;

          if (canReuseExistingMetadata) {
            for (const v of rawEntries) {
              const version = normalizeVersionEntry(v);
              if (!version) {
                canReuseExistingMetadata = false;
                break;
              }

              const metadata = existingVersionMetadata?.get(`${version}#${v["port-version"] ?? 0}`);
              if (
                !metadata
                || metadata.gitTree !== v["git-tree"]
                || !metadata.registryCommit
                || !metadata.publishedAt
              ) {
                canReuseExistingMetadata = false;
                break;
              }
            }
          }

          const entryMetadata = canReuseExistingMetadata
            ? undefined
            : await getVersionEntryMetadata(versionsPath, content);

          if (rawEntries.length > 0) {
            for (const v of rawEntries) {
              const version = normalizeVersionEntry(v);
              if (!version) continue;
              const versionDate = normalizeVersionDateValue(v["version-date"] ?? version);
              const key = `${version}#${v["port-version"] ?? 0}`;
              const reusedMetadata = canReuseExistingMetadata
                ? existingVersionMetadata?.get(key)
                : undefined;
              const metadata = reusedMetadata ?? entryMetadata?.get(key);
              versions.push({
                portName: task.portName,
                version,
                portVersion: v["port-version"],
                gitTree: v["git-tree"],
                versionDate,
                registryCommit: metadata?.registryCommit,
                publishedAt: metadata?.publishedAt,
              });
            }
          }

          return {
            portName: task.portName,
            versionsPath,
            versions,
          };
        } catch {
          return null;
        } finally {
          progress.tick();
        }
      }),
    );

    for (const result of results) {
      if (!result) continue;
      versionsPathByPort.set(result.portName, result.versionsPath);
      allVersions.push(...result.versions);
    }

    progress.finish();
  } catch { /* no versions dir */ }

  return {
    versions: allVersions,
    versionsPathByPort,
  };
}

function versionKey(portName: string, version: string, portVersion?: number): string {
  return `${portName}|${version}|${portVersion ?? 0}`;
}

async function refreshReposAfterSync(
  runId: number,
  repos: Array<typeof upstreamRepositories.$inferSelect>,
): Promise<{ attempted: number; succeeded: number; quotaLimited: boolean }> {
  if (repos.length === 0) {
    return { attempted: 0, succeeded: 0, quotaLimited: false };
  }

  if (!config.GITHUB_TOKEN) {
    console.log("Skipping post-sync GitHub refresh because GITHUB_TOKEN is not configured.");
    return { attempted: 0, succeeded: 0, quotaLimited: false };
  }

  createGitHubClient(config.GITHUB_TOKEN);
  const queue = new PQueue({
    concurrency: config.GITHUB_REFRESH_CONCURRENCY,
    intervalCap: config.GITHUB_REFRESH_REPOS_PER_MINUTE,
    interval: 60_000,
  });

  const snapshotAsOf = new Date();
  let processed = 0;
  let succeeded = 0;
  let quotaLimited = false;
  const progress = createProgressLogger("Refreshing GitHub repos", repos.length, {
    logEvery: 5,
  });

  console.log(`Refreshing ${repos.length} GitHub repos after sync...`);

  const results = await queue.addAll(
    repos.map((repo, index) => async () => {
      const result = await refreshGitHubRepo({
        jobName: "sync-vcpkg",
        runId,
        batchNumber: 1 + Math.floor(index / Math.max(config.GITHUB_FULL_REFRESH_BATCH_SIZE, 1)),
        snapshotAsOf,
        repo,
      });

      processed++;
      if (result.ok) {
        succeeded++;
      } else if (result.quotaError) {
        quotaLimited = true;
      } else if (result.errorMessage) {
        console.error(`Post-sync GitHub refresh failed for ${repo.portName}: ${result.errorMessage}`);
      }

      progress.tick();
      return result;
    }),
  );

  if (results.some((result) => result.quotaError)) {
    console.warn("Post-sync GitHub refresh hit rate limits before all repos could be refreshed.");
  }

  progress.finish();
  return { attempted: repos.length, succeeded, quotaLimited };
}

async function syncVcpkg(forceSync = false) {
  const run = await createJobRun("sync-vcpkg");

  try {
    const db = getClient();
    const sqlite = getSqlite();
    const previousSnapshot = await db.select({
      id: registrySnapshots.id,
      commitSha: registrySnapshots.commitSha,
    })
      .from(registrySnapshots)
      .orderBy(sql`${registrySnapshots.id} DESC`)
      .limit(1)
      .then((rows) => rows[0] ?? null);

    console.log("Ensuring vcpkg repo...");
    const repoState = await ensureRepo();
    const latestRepoRelease = await getLatestRepoRelease();

    const git = simpleGit(config.VCPKG_REPO_DIR);
    const log = await git.log({ maxCount: 1 });
    const commitSha = log.latest?.hash ?? "";
    const changedPortNames = previousSnapshot
      ? await collectChangedPortNames(previousSnapshot.commitSha, commitSha)
      : new Set<string>();

    if (!forceSync && !repoState.changed && previousSnapshot?.commitSha === commitSha) {
      await completeJobRun(run.id, `No registry changes at ${commitSha}`);
      console.log(`Sync skipped: repo already at ${commitSha}`);
      return;
    }

    if (!forceSync && previousSnapshot && changedPortNames.size === 0) {
      await completeJobRun(run.id, `No port or version changes at ${commitSha}`);
      console.log(`Sync skipped: ${commitSha} does not change ports/ or versions/`);
      return;
    }

    if (forceSync) {
      console.log(`Force sync enabled: reparsing registry data at ${commitSha}`);
    }

    const existingVersionRows = await db.select({
      portName: portVersions.portName,
      version: portVersions.version,
      portVersion: portVersions.portVersion,
      gitTree: portVersions.gitTree,
      registryCommit: portVersions.registryCommit,
      publishedAt: portVersions.publishedAt,
    }).from(portVersions);
    const existingVersionMetadataByPort = new Map<string, Map<string, ExistingVersionMetadata>>();
    for (const row of existingVersionRows) {
      const metadataByVersion = existingVersionMetadataByPort.get(row.portName) ?? new Map<string, ExistingVersionMetadata>();
      metadataByVersion.set(`${row.version}#${row.portVersion ?? 0}`, {
        gitTree: row.gitTree ?? undefined,
        registryCommit: row.registryCommit ?? undefined,
        publishedAt: row.publishedAt ?? undefined,
      });
      existingVersionMetadataByPort.set(row.portName, metadataByVersion);
    }

    console.log("Parsing ports...");
    const parsedPorts = await parsePortsDir();
    await updateJobProgress(run.id, 0, parsedPorts.length);
    const currentNames = new Set(parsedPorts.map((p) => p.name));

    console.log("Parsing versions...");
    const parsedVersions = await parseVersionsDir(currentNames, existingVersionMetadataByPort);
    const allVersions = parsedVersions.versions;
    console.log(`Found ${allVersions.length} version entries`);

    const currentVersionByPort = new Map<string, VersionEntry>();
    for (const entry of allVersions) {
      currentVersionByPort.set(versionKey(entry.portName, entry.version, entry.portVersion), entry);
    }

    const currentVersionTreeByPort = new Map<string, string>();
    for (const parsedPort of parsedPorts) {
      parsedPort.versionsPath = parsedVersions.versionsPathByPort.get(parsedPort.name);
      const currentVersion = currentVersionByPort.get(
        versionKey(parsedPort.name, parsedPort.version, parsedPort.portVersion),
      );
      if (currentVersion?.gitTree) {
        currentVersionTreeByPort.set(parsedPort.name, currentVersion.gitTree);
        parsedPort.vcpkgTreeSha = currentVersion.gitTree;
      }
    }

    const totalFeaturesCount = parsedPorts.reduce((sum, pp) => sum + pp.features.length, 0);
    const now = new Date().toISOString();
    const existingPortRows = await db.select({ name: ports.name }).from(ports);
    const existingUpstreamRows = await db.select().from(upstreamRepositories);
    const existingUpstreamsByPort = new Map(existingUpstreamRows.map((row) => [row.portName, row]));
    const githubRefreshTargets = new Set<string>();

    sqlite.exec("BEGIN");
    try {
      console.log("Inserting registry snapshot...");
      await db.insert(registrySnapshots).values({
        commitSha,
        releaseVersion: latestRepoRelease?.version ?? null,
        releasePublishedAt: latestRepoRelease?.publishedAt ?? null,
        indexedAt: now,
        portsCount: parsedPorts.length,
        featuresCount: totalFeaturesCount,
      }).onConflictDoUpdate({
        target: registrySnapshots.commitSha,
        set: {
          releaseVersion: latestRepoRelease?.version ?? null,
          releasePublishedAt: latestRepoRelease?.publishedAt ?? null,
          indexedAt: now,
          portsCount: parsedPorts.length,
          featuresCount: totalFeaturesCount,
        },
      });

      if (latestRepoRelease) {
        const releaseMetaRows = [
          {
            key: "latest_release_version",
            value: latestRepoRelease.version,
            updatedAt: now,
          },
          {
            key: "latest_release_published_at",
            value: latestRepoRelease.publishedAt,
            updatedAt: now,
          },
          {
            key: "latest_release_commit_sha",
            value: latestRepoRelease.commitSha,
            updatedAt: now,
          },
        ] as const;

        for (const row of releaseMetaRows) {
          await db.insert(catalogMeta).values(row).onConflictDoUpdate({
            target: catalogMeta.key,
            set: {
              value: row.value,
              updatedAt: now,
            },
          });
        }
      }

      const [snapshot] = await db.select({ id: registrySnapshots.id })
        .from(registrySnapshots)
        .where(eq(registrySnapshots.commitSha, commitSha))
        .limit(1);
      const snapshotId = snapshot.id;

      console.log("Deleting old port versions...");
      await db.delete(portVersions);

      console.log(`Processing ${parsedPorts.length} ports...`);
      const portProgress = createProgressLogger("Applying port updates", parsedPorts.length, {
        logEvery: 50,
      });
      for (let i = 0; i < parsedPorts.length; i++) {
        const pp = parsedPorts[i];

        await db.delete(portDependencies).where(eq(portDependencies.portName, pp.name));
        await db.delete(portFeatures).where(eq(portFeatures.portName, pp.name));
        await db.delete(portFiles).where(eq(portFiles.portName, pp.name));
        await db.delete(tripletSupport).where(eq(tripletSupport.portName, pp.name));

        try {
          await db.insert(ports).values({
            name: pp.name,
            displayName: pp.displayName,
            version: pp.version,
            portVersion: pp.portVersion,
            versionsPath: pp.versionsPath ?? null,
            description: pp.description ?? null,
            homepage: pp.homepage ?? null,
            license: pp.license ?? null,
            supports: pp.supports ?? null,
            usageText: pp.usageText ?? null,
            portfileText: pp.portfileText ?? null,
            sourceUrl: pp.sourceUrl ?? null,
            vcpkgTreeSha: pp.vcpkgTreeSha ?? currentVersionTreeByPort.get(pp.name) ?? null,
            manifestJson: pp.manifestJson,
            registrySnapshotId: snapshotId,
            createdAt: now,
            updatedAt: now,
          }).onConflictDoUpdate({
            target: ports.name,
            set: {
              version: pp.version,
              portVersion: pp.portVersion,
              versionsPath: pp.versionsPath ?? null,
              description: pp.description ?? null,
              homepage: pp.homepage ?? null,
              license: pp.license ?? null,
              supports: pp.supports ?? null,
              usageText: pp.usageText ?? null,
              portfileText: pp.portfileText ?? null,
              sourceUrl: pp.sourceUrl ?? null,
              vcpkgTreeSha: pp.vcpkgTreeSha ?? currentVersionTreeByPort.get(pp.name) ?? null,
              manifestJson: pp.manifestJson,
              registrySnapshotId: snapshotId,
              updatedAt: now,
            },
          });
        } catch (e) { console.error(`ports insert failed for ${pp.name}:`, e); throw e; }

        for (let di = 0; di < pp.dependencies.length; di++) {
          const dep = pp.dependencies[di];
          try {
            await db.insert(portDependencies).values({
              portName: pp.name,
              dependencyName: dep.name,
              featuresJson: dep.features ? JSON.stringify(dep.features) : null,
              defaultFeatures: dep.defaultFeatures ?? null,
              platform: dep.platform ?? null,
              host: dep.host ?? null,
              dependencyType: dep.dependencyType ?? null,
            });
          } catch (e) { console.error(`dep insert failed for ${pp.name} dep ${di}:`, e); throw e; }
        }

          for (let fi = 0; fi < pp.features.length; fi++) {
          const feat = pp.features[fi];
          try {
            await db.insert(portFeatures).values({
              portName: pp.name,
              featureName: feat.name,
              description: feat.description ?? null,
              dependenciesJson: feat.dependencies ? JSON.stringify(feat.dependencies) : null,
              supports: feat.supports ?? null,
            });
          } catch (e) { console.error(`feat insert failed for ${pp.name} feat ${fi}:`, e); throw e; }
        }

        for (let fii = 0; fii < pp.files.length; fii++) {
          const file = pp.files[fii];
          try {
            await db.insert(portFiles).values({
              portName: pp.name,
              fileType: file.fileType,
              path: file.path,
              content: file.content,
              sizeBytes: Buffer.byteLength(file.content, "utf-8"),
              sha256: sha256(file.content),
              updatedAt: now,
            });
          } catch (e) { console.error(`file insert failed for ${pp.name} file ${fii}:`, e); throw e; }
        }

        const up = pp.upstream;
        if (up.provider !== "none" && up.provider !== "unknown") {
          const repoUrl = buildRepoUrl(up);
          const nextRepoUrl = repoUrl || pp.homepage || "";
          const previousUpstream = existingUpstreamsByPort.get(pp.name);
          const identityChanged = !upstreamIdentityMatches(previousUpstream, {
            provider: up.provider,
            owner: up.owner,
            repo: up.repo,
            repoUrl: nextRepoUrl,
          });

          try {
            if (identityChanged && previousUpstream) {
              await db.delete(upstreamIssues).where(eq(upstreamIssues.upstreamId, previousUpstream.id));
            }

            await db.insert(upstreamRepositories).values({
              portName: pp.name,
              provider: up.provider,
              owner: up.owner ?? null,
              repo: up.repo ?? null,
              repoUrl: nextRepoUrl,
              detectedFrom: up.detectedFrom,
              confidence: up.confidence,
              createdAt: now,
              updatedAt: now,
            }).onConflictDoUpdate({
              target: upstreamRepositories.portName,
              set: {
                ...(identityChanged ? clearedUpstreamMetadata(now) : {}),
                provider: up.provider,
                owner: up.owner ?? null,
                repo: up.repo ?? null,
                repoUrl: nextRepoUrl,
                detectedFrom: up.detectedFrom,
                confidence: up.confidence,
                updatedAt: now,
              },
            });
          } catch (e) { console.error(`upstream insert failed for ${pp.name}:`, e); throw e; }

          if (
            up.provider === "github"
            && (
              !previousSnapshot
              || changedPortNames.has(pp.name)
              || identityChanged
              || !previousUpstream?.lastSuccessfulRefreshAt
            )
          ) {
            githubRefreshTargets.add(pp.name);
          }
        } else {
          const previousUpstream = existingUpstreamsByPort.get(pp.name);
          if (previousUpstream) {
            await db.delete(upstreamIssues).where(eq(upstreamIssues.upstreamId, previousUpstream.id));
          }
          await db.delete(upstreamRepositories).where(eq(upstreamRepositories.portName, pp.name));
          await db.delete(maintenanceScores).where(eq(maintenanceScores.portName, pp.name));
        }

        const supportedTriplets = evaluateSupports(pp.supports);
        for (let ti = 0; ti < supportedTriplets.length; ti++) {
          try {
            await db.insert(tripletSupport).values({
              portName: pp.name,
              triplet: supportedTriplets[ti],
              supported: true,
            });
          } catch (e) { console.error(`triplet insert failed for ${pp.name} triplet ${ti}:`, e); throw e; }
        }

        if (portProgress.tick()) {
          await updateJobProgress(run.id, i + 1, parsedPorts.length);
        }
      }
      portProgress.finish();

      if (allVersions.length > 0) {
        const BATCH_SIZE = 50;
        const totalBatches = Math.ceil(allVersions.length / BATCH_SIZE);
        const versionInsertProgress = createProgressLogger("Inserting version rows", totalBatches, {
          logEvery: 20,
        });
        console.log(`Inserting ${allVersions.length} versions in ${totalBatches} batches of ${BATCH_SIZE}`);
        for (let i = 0; i < allVersions.length; i += BATCH_SIZE) {
          const batch = allVersions.slice(i, i + BATCH_SIZE).map((v) => ({
            portName: v.portName,
            version: v.version,
            portVersion: v.portVersion,
            gitTree: v.gitTree,
            versionDate: v.versionDate ?? null,
            registryCommit: v.registryCommit ?? null,
            publishedAt: v.publishedAt ?? null,
          }));
          await db.insert(portVersions).values(batch);
          versionInsertProgress.tick();
        }
        versionInsertProgress.finish();
        console.log("Versions inserted");
      }

      for (const row of existingPortRows) {
        if (!currentNames.has(row.name)) {
          const previousUpstream = existingUpstreamsByPort.get(row.name);
          if (previousUpstream) {
            await db.delete(upstreamIssues).where(eq(upstreamIssues.upstreamId, previousUpstream.id));
          }
          await db.delete(portDependencies).where(eq(portDependencies.portName, row.name));
          await db.delete(portFeatures).where(eq(portFeatures.portName, row.name));
          await db.delete(portFiles).where(eq(portFiles.portName, row.name));
          await db.delete(portVersions).where(eq(portVersions.portName, row.name));
          await db.delete(tripletSupport).where(eq(tripletSupport.portName, row.name));
          await db.delete(portPatchStats).where(eq(portPatchStats.portName, row.name));
          await db.delete(portSourceProvenance).where(eq(portSourceProvenance.portName, row.name));
          await db.delete(portRegistryStats).where(eq(portRegistryStats.portName, row.name));
          await db.delete(packagingRiskScores).where(eq(packagingRiskScores.portName, row.name));
          await db.delete(upstreamRepositories).where(eq(upstreamRepositories.portName, row.name));
          await db.delete(maintenanceScores).where(eq(maintenanceScores.portName, row.name));
          await db.delete(ports).where(eq(ports.name, row.name));
        }
      }

      const orphanHistoricalSnapshots = await db.delete(historicalPortSnapshots)
        .where(sql`${historicalPortSnapshots.gitTree} NOT IN (
          SELECT ${sql.raw("git_tree")} FROM port_versions WHERE git_tree IS NOT NULL
        )`);
      console.log(`Pruned ${orphanHistoricalSnapshots.changes} orphan historical snapshots`);

      sqlite.exec("COMMIT");
    } catch (err) {
      sqlite.exec("ROLLBACK");
      throw err;
    }

    await computePortHistoryDatesStep({
      commitSha,
      portNames: Array.from(currentNames),
    });
    await computePackagingSignalsStep();
    await rebuildSearchIndexStep();
    await materializeHistoricalSnapshotsStep();

    const reposToRefresh = githubRefreshTargets.size > 0
      ? await db.select()
        .from(upstreamRepositories)
        .where(sql`${upstreamRepositories.portName} IN (${sql.join(
          Array.from(githubRefreshTargets).map((portName) => sql`${portName}`),
          sql`, `,
        )}) AND ${upstreamRepositories.provider} = 'github'`)
      : [];

    const refreshSummary = await refreshReposAfterSync(run.id, reposToRefresh);
    await computeScoresStep();

    const syncMessage = refreshSummary.attempted > 0
      ? `Imported ${parsedPorts.length} ports and refreshed ${refreshSummary.succeeded}/${refreshSummary.attempted} GitHub repos`
      : `Imported ${parsedPorts.length} ports`;
    await completeJobRun(run.id, syncMessage);
    console.log(`Sync complete: ${syncMessage}${refreshSummary.quotaLimited ? " (quota limited)" : ""}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await failJobRun(run.id, msg);
    console.error("Sync failed:", err);
    throw err;
  }
}

export type SyncVcpkgJobOptions = ClearLockOptions & {
  force?: boolean;
};

export async function runSyncVcpkgJob(options: SyncVcpkgJobOptions = {}) {
  createClient(config.DATABASE_FILE);
  await runJobWithLock({
    jobName: "sync-vcpkg",
    lockTtlMs: 30 * 60 * 1000,
    clearLock: options.clearLock,
    run: async () => {
      await syncVcpkg(Boolean(options.force));
    },
  });
}

if (isJobInvocation(import.meta.url, "sync-vcpkg")) {
  await runSyncVcpkgJob();
}
