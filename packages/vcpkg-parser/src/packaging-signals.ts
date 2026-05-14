export type SourceProvenanceQuality =
  | "exact-commit"
  | "exact-tag"
  | "release-asset"
  | "archive-ref"
  | "branch-ref"
  | "url-only"
  | "unknown";

export type SourceProvenanceProvider =
  | "github"
  | "gitlab"
  | "bitbucket"
  | "sourceforge"
  | "git"
  | "url"
  | "unknown";

export type ParsedSourceProvenance = {
  provider: SourceProvenanceProvider;
  sourceUrl?: string;
  normalizedRepoUrl?: string;
  ref?: string;
  refKind?: "commit" | "tag" | "branch" | "release" | "archive" | "unknown";
  quality: SourceProvenanceQuality;
  isExact: boolean;
  confidence: number;
  detectedFrom: string;
  reason: string;
  referenceUrl?: string;
};

type CallBlock = {
  name: string;
  body: string;
  start: number;
};

const SOURCE_CALL_NAMES = new Set([
  "vcpkg_from_github",
  "vcpkg_from_gitlab",
  "vcpkg_from_bitbucket",
  "vcpkg_from_sourceforge",
  "vcpkg_from_git",
  "vcpkg_from_url",
  "vcpkg_download_distfile",
]);

const VERSION_PLACEHOLDER_RE = /\$\{VERSION\}/g;
const VERSION_TEXT_PLACEHOLDERS = new Set([
  "${VERSION}",
  "${PORT_VERSION}",
  "${PATCHES}",
  "${DOWNLOAD_URLS}",
]);

export function extractDeclaredPatchPaths(portfile: string): string[] {
  const seen = new Set<string>();
  const blocks = extractCallBlocks(portfile);

  for (const block of blocks) {
    for (const segment of extractPatchSegments(block.body)) {
      for (const token of tokenizeCmake(segment)) {
        const normalized = normalizeDeclaredPatchPath(token);
        if (normalized) {
          seen.add(normalized);
        }
      }
    }
  }

  return Array.from(seen).sort((left, right) => left.localeCompare(right));
}

export function parseSourceProvenance(
  portfile: string,
  options?: { version?: string },
): ParsedSourceProvenance {
  const sourceBlock = extractCallBlocks(portfile)
    .filter((block) => SOURCE_CALL_NAMES.has(block.name))
    .sort((left, right) => left.start - right.start)[0];

  if (!sourceBlock) {
    return unknownProvenance("none", "No explicit source helper detected");
  }

  switch (sourceBlock.name) {
    case "vcpkg_from_github":
      return parseRepoSourceBlock("github", sourceBlock, options);
    case "vcpkg_from_gitlab":
      return parseRepoSourceBlock("gitlab", sourceBlock, options);
    case "vcpkg_from_bitbucket":
      return parseRepoSourceBlock("bitbucket", sourceBlock, options);
    case "vcpkg_from_sourceforge":
      return parseSourceforgeBlock(sourceBlock, options);
    case "vcpkg_from_git":
      return parseGitSourceBlock(sourceBlock, options);
    case "vcpkg_from_url":
    case "vcpkg_download_distfile":
      return parseUrlSourceBlock(sourceBlock, options);
    default:
      return unknownProvenance(sourceBlock.name, "Unsupported source helper");
  }
}

function parseRepoSourceBlock(
  provider: "github" | "gitlab" | "bitbucket",
  block: CallBlock,
  options?: { version?: string },
): ParsedSourceProvenance {
  const repo = extractFirstValue(block.body, "REPO");
  const rawRef = extractFirstValue(block.body, "REF");

  if (!repo) {
    return unknownProvenance(block.name, "Missing REPO argument");
  }

  let baseUrl: string;
  if (provider === "github") {
    const host = extractFirstValue(block.body, "GITHUB_HOST");
    baseUrl = host ? trimTrailingSlashes(resolveVersionPlaceholders(host, options?.version)) : "https://github.com";
  } else if (provider === "gitlab") {
    const gitlabUrl = extractFirstValue(block.body, "GITLAB_URL");
    baseUrl = gitlabUrl ? trimTrailingSlashes(resolveVersionPlaceholders(gitlabUrl, options?.version)) : "https://gitlab.com";
  } else {
    baseUrl = "https://bitbucket.org";
  }

  const sourceUrl = `${baseUrl}/${repo.replace(/^\/+/, "")}`;
  return classifyRepoLikeSource({
    provider,
    sourceUrl,
    normalizedRepoUrl: sourceUrl,
    rawRef,
    detectedFrom: `portfile.${block.name}`,
    version: options?.version,
  });
}

function parseSourceforgeBlock(
  block: CallBlock,
  options?: { version?: string },
): ParsedSourceProvenance {
  const repo = extractFirstValue(block.body, "REPO");
  const rawRef = extractFirstValue(block.body, "REF");
  const sourceUrl = repo ? `https://sourceforge.net/p/${repo.replace(/^\/+/, "")}` : undefined;

  return classifyRepoLikeSource({
    provider: "sourceforge",
    sourceUrl,
    normalizedRepoUrl: sourceUrl,
    rawRef,
    detectedFrom: `portfile.${block.name}`,
    version: options?.version,
  });
}

function parseGitSourceBlock(block: CallBlock, options?: { version?: string }): ParsedSourceProvenance {
  const rawUrl = extractFirstValue(block.body, "URL");
  const rawRef = extractFirstValue(block.body, "REF");

  if (!rawUrl) {
    return unknownProvenance(`portfile.${block.name}`, "Missing URL argument");
  }

  const resolvedUrl = resolveVersionPlaceholders(rawUrl, options?.version);
  if (containsUnresolvedPlaceholder(resolvedUrl)) {
    return unknownProvenance(`portfile.${block.name}`, "Source URL contains unresolved placeholders");
  }

  const repoInfo = detectRepoInfoFromUrl(resolvedUrl);
  const normalizedRepoUrl = repoInfo?.normalizedRepoUrl ?? normalizeRepoUrl(resolvedUrl);

  return classifyRepoLikeSource({
    provider: repoInfo?.provider ?? "git",
    sourceUrl: resolvedUrl,
    normalizedRepoUrl,
    rawRef,
    detectedFrom: `portfile.${block.name}`,
    version: options?.version,
  });
}

function parseUrlSourceBlock(block: CallBlock, options?: { version?: string }): ParsedSourceProvenance {
  const rawUrl = extractFirstValue(block.body, "URL") ?? extractFirstUrlFromUrlsArg(block.body);
  if (!rawUrl) {
    return unknownProvenance(`portfile.${block.name}`, "Missing URL argument");
  }

  const resolvedUrl = resolveVersionPlaceholders(rawUrl, options?.version);
  if (containsUnresolvedPlaceholder(resolvedUrl)) {
    return unknownProvenance(`portfile.${block.name}`, "Source URL contains unresolved placeholders");
  }

  const explicit = classifyArchiveUrl(resolvedUrl);
  if (explicit) {
    return {
      ...explicit,
      detectedFrom: `portfile.${block.name}`,
    };
  }

  const repoInfo = detectRepoInfoFromUrl(resolvedUrl);
  return {
    provider: repoInfo?.provider ?? "url",
    sourceUrl: resolvedUrl,
    normalizedRepoUrl: repoInfo?.normalizedRepoUrl,
    quality: "url-only",
    isExact: false,
    confidence: 70,
    detectedFrom: `portfile.${block.name}`,
    reason: "Explicit source URL without an exact parseable ref",
    referenceUrl: resolvedUrl,
  };
}

function classifyRepoLikeSource(args: {
  provider: SourceProvenanceProvider;
  sourceUrl?: string;
  normalizedRepoUrl?: string;
  rawRef?: string | null;
  detectedFrom: string;
  version?: string;
}): ParsedSourceProvenance {
  const resolvedRef = args.rawRef ? resolveVersionPlaceholders(args.rawRef, args.version) : undefined;
  if (!resolvedRef) {
    return {
      provider: args.provider,
      sourceUrl: args.sourceUrl,
      normalizedRepoUrl: args.normalizedRepoUrl,
      quality: "unknown",
      isExact: false,
      confidence: 45,
      detectedFrom: args.detectedFrom,
      reason: "No explicit ref was found",
      referenceUrl: args.normalizedRepoUrl ?? args.sourceUrl,
    };
  }

  if (containsUnresolvedPlaceholder(resolvedRef)) {
    return unknownProvenance(args.detectedFrom, "Source ref contains unresolved placeholders", {
      provider: args.provider,
      sourceUrl: args.sourceUrl,
      normalizedRepoUrl: args.normalizedRepoUrl,
    });
  }

  const refKind = classifyRefKind(resolvedRef);
  const referenceUrl = buildReferenceUrl(args.provider, args.normalizedRepoUrl, resolvedRef, refKind);

  if (refKind === "commit") {
    return {
      provider: args.provider,
      sourceUrl: args.sourceUrl,
      normalizedRepoUrl: args.normalizedRepoUrl,
      ref: resolvedRef,
      refKind,
      quality: "exact-commit",
      isExact: true,
      confidence: 100,
      detectedFrom: args.detectedFrom,
      reason: "Explicit source helper pins an exact commit",
      referenceUrl,
    };
  }

  if (refKind === "tag") {
    return {
      provider: args.provider,
      sourceUrl: args.sourceUrl,
      normalizedRepoUrl: args.normalizedRepoUrl,
      ref: resolvedRef,
      refKind,
      quality: "exact-tag",
      isExact: true,
      confidence: 95,
      detectedFrom: args.detectedFrom,
      reason: "Explicit source helper pins an exact tag",
      referenceUrl,
    };
  }

  return {
    provider: args.provider,
    sourceUrl: args.sourceUrl,
    normalizedRepoUrl: args.normalizedRepoUrl,
    ref: resolvedRef,
    refKind,
    quality: "branch-ref",
    isExact: false,
    confidence: 80,
    detectedFrom: args.detectedFrom,
    reason: "Explicit source helper uses a branch-like ref",
    referenceUrl,
  };
}

function classifyArchiveUrl(url: string): Omit<ParsedSourceProvenance, "detectedFrom"> | null {
  const githubRelease = url.match(/^https:\/\/github\.com\/([^/\s]+\/[^/\s]+)\/releases\/download\/([^/\s]+)\//i);
  if (githubRelease) {
    const repo = githubRelease[1];
    const tag = githubRelease[2];
    return {
      provider: "github",
      sourceUrl: url,
      normalizedRepoUrl: `https://github.com/${repo}`,
      ref: tag,
      refKind: "release",
      quality: "release-asset",
      isExact: false,
      confidence: 90,
      reason: "Explicit source URL points to a release asset",
      referenceUrl: `https://github.com/${repo}/releases/tag/${encodeURIComponent(tag)}`,
    };
  }

  const githubArchive = url.match(/^https:\/\/github\.com\/([^/\s]+\/[^/\s]+)\/archive\/(?:refs\/tags\/)?([^/\s]+)\.(?:tar\.gz|tgz|zip)$/i);
  if (githubArchive) {
    const repo = githubArchive[1];
    const ref = githubArchive[2];
    return {
      provider: "github",
      sourceUrl: url,
      normalizedRepoUrl: `https://github.com/${repo}`,
      ref,
      refKind: "archive",
      quality: "archive-ref",
      isExact: false,
      confidence: 85,
      reason: "Explicit source URL points to an archive ref",
      referenceUrl: `https://github.com/${repo}/tree/${encodeURIComponent(ref)}`,
    };
  }

  const gitlabArchive = url.match(/^https:\/\/gitlab\.com\/([^/\s]+\/[^/\s]+)\/-\/archive\/([^/\s]+)\//i);
  if (gitlabArchive) {
    const repo = gitlabArchive[1];
    const ref = gitlabArchive[2];
    return {
      provider: "gitlab",
      sourceUrl: url,
      normalizedRepoUrl: `https://gitlab.com/${repo}`,
      ref,
      refKind: "archive",
      quality: "archive-ref",
      isExact: false,
      confidence: 85,
      reason: "Explicit source URL points to an archive ref",
      referenceUrl: `https://gitlab.com/${repo}/-/tree/${encodeURIComponent(ref)}`,
    };
  }

  const codebergArchive = url.match(/^https:\/\/codeberg\.org\/([^/\s]+\/[^/\s]+)\/archive\/([^/\s]+)\.(?:tar\.gz|tgz|zip)$/i);
  if (codebergArchive) {
    const repo = codebergArchive[1];
    const ref = codebergArchive[2];
    return {
      provider: "url",
      sourceUrl: url,
      normalizedRepoUrl: `https://codeberg.org/${repo}`,
      ref,
      refKind: "archive",
      quality: "archive-ref",
      isExact: false,
      confidence: 80,
      reason: "Explicit source URL points to an archive ref",
      referenceUrl: `https://codeberg.org/${repo}/src/branch/${encodeURIComponent(ref)}`,
    };
  }

  return null;
}

function extractCallBlocks(input: string): CallBlock[] {
  const blocks: CallBlock[] = [];
  const callRe = /([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;

  for (let match: RegExpExecArray | null; (match = callRe.exec(input)) !== null;) {
    const name = match[1];
    const openParen = input.indexOf("(", match.index);
    const closeParen = findMatchingParen(input, openParen);
    if (closeParen < 0) continue;

    blocks.push({
      name,
      body: input.slice(openParen + 1, closeParen),
      start: match.index,
    });

    callRe.lastIndex = closeParen + 1;
  }

  return blocks;
}

function findMatchingParen(input: string, openParen: number): number {
  let depth = 0;
  let inSingle = false;
  let inDouble = false;

  for (let index = openParen; index < input.length; index++) {
    const char = input[index];
    const previous = index > 0 ? input[index - 1] : "";

    if (char === "'" && !inDouble && previous !== "\\") {
      inSingle = !inSingle;
      continue;
    }

    if (char === "\"" && !inSingle && previous !== "\\") {
      inDouble = !inDouble;
      continue;
    }

    if (inSingle || inDouble) continue;
    if (char === "(") depth++;
    if (char === ")") {
      depth--;
      if (depth === 0) return index;
    }
  }

  return -1;
}

function extractPatchSegments(body: string): string[] {
  const segments: string[] = [];
  const patchRe = /(^|\n)\s*PATCHES\b([\s\S]*?)(?=(\n\s*[A-Z][A-Z0-9_]*\b)|\n\s*\)|$)/g;

  for (let match: RegExpExecArray | null; (match = patchRe.exec(body)) !== null;) {
    segments.push(match[2] ?? "");
  }

  return segments;
}

function tokenizeCmake(input: string): string[] {
  const normalized = stripComments(input);
  const matches = normalized.match(/"([^"\\]|\\.)*"|'([^'\\]|\\.)*'|[^\s]+/g);
  return (matches ?? []).map(unquote);
}

function stripComments(input: string): string {
  return input
    .split("\n")
    .map((line) => {
      let inSingle = false;
      let inDouble = false;

      for (let index = 0; index < line.length; index++) {
        const char = line[index];
        const previous = index > 0 ? line[index - 1] : "";

        if (char === "'" && !inDouble && previous !== "\\") {
          inSingle = !inSingle;
          continue;
        }

        if (char === "\"" && !inSingle && previous !== "\\") {
          inDouble = !inDouble;
          continue;
        }

        if (char === "#" && !inSingle && !inDouble) {
          return line.slice(0, index);
        }
      }

      return line;
    })
    .join("\n");
}

function normalizeDeclaredPatchPath(token: string): string | null {
  const trimmed = token.trim();
  if (!trimmed) return null;
  if (VERSION_TEXT_PLACEHOLDERS.has(trimmed)) return null;

  let normalized = trimmed
    .replace(/^\$\{CURRENT_PORT_DIR\}\//, "")
    .replace(/^\$\{CMAKE_CURRENT_LIST_DIR\}\//, "")
    .replace(/^\$\{CURRENT_PACKAGES_DIR\}\//, "");

  if (!/\.(patch|diff)$/i.test(normalized)) return null;
  if (containsUnresolvedPlaceholder(normalized)) return null;

  return normalized.replace(/^\.\/+/, "");
}

function extractFirstValue(body: string, key: string): string | null {
  const segment = extractArgumentSegment(body, key);
  if (!segment) return null;

  for (const token of tokenizeCmake(segment)) {
    if (token.length > 0) {
      return token;
    }
  }

  return null;
}

function extractFirstUrlFromUrlsArg(body: string): string | null {
  const segment = extractArgumentSegment(body, "URLS");
  if (!segment) return null;

  for (const token of tokenizeCmake(segment)) {
    if (/^https?:\/\//i.test(token)) {
      return token;
    }
  }

  return null;
}

function extractArgumentSegment(body: string, key: string): string | null {
  const re = new RegExp(`(^|\\n)\\s*${key}\\b([\\s\\S]*?)(?=(\\n\\s*[A-Z][A-Z0-9_]*\\b)|\\n\\s*\\)|$)`, "i");
  const match = re.exec(body);
  return match?.[2]?.trim() ?? null;
}

function resolveVersionPlaceholders(input: string, version?: string): string {
  if (!version) return input;
  return input.replace(VERSION_PLACEHOLDER_RE, version);
}

function containsUnresolvedPlaceholder(value: string): boolean {
  return /\$\{[^}]+\}/.test(value);
}

function classifyRefKind(ref: string): "commit" | "tag" | "branch" {
  if (/^[0-9a-f]{7,40}$/i.test(ref)) return "commit";
  if (/^(?:v|r)?\d/.test(ref) || /[-_.]\d/.test(ref)) return "tag";
  return "branch";
}

function buildReferenceUrl(
  provider: SourceProvenanceProvider,
  repoUrl: string | undefined,
  ref: string,
  refKind: "commit" | "tag" | "branch",
): string | undefined {
  if (!repoUrl) return undefined;

  switch (provider) {
    case "github":
      return `${repoUrl}/tree/${encodeURIComponent(ref)}`;
    case "gitlab":
      return `${repoUrl}/-/tree/${encodeURIComponent(ref)}`;
    case "bitbucket":
      return `${repoUrl}/src/${encodeURIComponent(ref)}`;
    case "sourceforge":
      return repoUrl;
    case "git":
    case "url":
      if (repoUrl.includes("googlesource.com")) {
        return `${repoUrl}/+/${encodeURIComponent(ref)}`;
      }
      if (repoUrl.includes("codeberg.org")) {
        const branchPrefix = refKind === "branch" ? "branch" : "tag";
        return `${repoUrl}/src/${branchPrefix}/${encodeURIComponent(ref)}`;
      }
      return `${repoUrl.replace(/\/+$/, "")}/tree/${encodeURIComponent(ref)}`;
    case "unknown":
    default:
      return undefined;
  }
}

function detectRepoInfoFromUrl(url: string): { provider: SourceProvenanceProvider; normalizedRepoUrl: string } | null {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.replace(/^\//, "");
    const parts = pathname.split("/").filter(Boolean);

    if (parsed.hostname === "github.com" && parts.length >= 2) {
      return {
        provider: "github",
        normalizedRepoUrl: `${parsed.origin}/${parts[0]}/${trimDotGit(parts[1])}`,
      };
    }

    if (parsed.hostname === "gitlab.com" && parts.length >= 2) {
      return {
        provider: "gitlab",
        normalizedRepoUrl: `${parsed.origin}/${parts[0]}/${trimDotGit(parts[1])}`,
      };
    }

    if (parsed.hostname === "bitbucket.org" && parts.length >= 2) {
      return {
        provider: "bitbucket",
        normalizedRepoUrl: `${parsed.origin}/${parts[0]}/${trimDotGit(parts[1])}`,
      };
    }

    if (parsed.hostname.includes("sourceforge.net")) {
      return {
        provider: "sourceforge",
        normalizedRepoUrl: `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, ""),
      };
    }

    if (parsed.hostname === "codeberg.org" && parts.length >= 2) {
      return {
        provider: "url",
        normalizedRepoUrl: `${parsed.origin}/${parts[0]}/${trimDotGit(parts[1])}`,
      };
    }

    if (parsed.hostname.endsWith(".googlesource.com")) {
      const repoSegments: string[] = [];
      for (const part of parts) {
        if (part === "+") break;
        repoSegments.push(trimDotGit(part));
        if (part.endsWith(".git")) break;
      }

      if (repoSegments.length >= 1) {
        return {
          provider: "url",
          normalizedRepoUrl: `${parsed.origin}/${repoSegments.join("/")}`,
        };
      }
    }
  } catch {
    return null;
  }

  return null;
}

function normalizeRepoUrl(url: string): string {
  return trimTrailingSlashes(trimDotGit(url));
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function trimDotGit(value: string): string {
  return value.replace(/\.git$/i, "");
}

function unquote(value: string): string {
  if (
    (value.startsWith("\"") && value.endsWith("\""))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function unknownProvenance(
  detectedFrom: string,
  reason: string,
  partial?: Partial<ParsedSourceProvenance>,
): ParsedSourceProvenance {
  return {
    provider: partial?.provider ?? "unknown",
    sourceUrl: partial?.sourceUrl,
    normalizedRepoUrl: partial?.normalizedRepoUrl,
    quality: "unknown",
    isExact: false,
    confidence: 30,
    detectedFrom,
    reason,
    referenceUrl: partial?.referenceUrl,
  };
}
