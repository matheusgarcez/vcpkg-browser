export type PortfileSource = {
  provider: "github" | "gitlab" | "bitbucket" | "sourceforge" | "git" | "url" | "none" | "unknown";
  owner?: string;
  repo?: string;
  url?: string;
  confidence: number;
  detectedFrom: string;
};

const GITHUB_REPO_RE = /vcpkg_from_github\s*\([\s\S]*?\bREPO\s+["']?([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)["']?/i;
const GITHUB_HOST_RE = /vcpkg_from_github\s*\([\s\S]*?\bGITHUB_HOST\s+["']?\s*(https?:\/\/[^\s"')\]]+)["']?/i;
const GITLAB_REPO_RE = /vcpkg_from_gitlab\s*\([\s\S]*?\bREPO\s+["']?([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)["']?/i;
const GITLAB_URL_RE = /vcpkg_from_gitlab\s*\([\s\S]*?\bGITLAB_URL\s+["']?\s*(https?:\/\/[^\s"')\]]+)["']?/i;
const BITBUCKET_REPO_RE = /vcpkg_from_bitbucket\s*\([\s\S]*?\bREPO\s+["']?([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)["']?/i;
const SOURCEFORGE_RE = /vcpkg_from_sourceforge\s*\([\s\S]*?\bREPO\s+["']?([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)["']?/i;
const GIT_URL_RE = /vcpkg_from_git\s*\([\s\S]*?\bURL\s+["']?\s*(https?:\/\/[^\s"')\]]+)["']?/i;
const URL_RE = /vcpkg_from_url\s*\([\s\S]*?\bURL\b\s+["']?\s*(https?:\/\/[^\s"')\]]+)["']?/i;
const URLS_RE = /vcpkg_from_url\s*\([\s\S]*?\bURLS\b/i;
const DISTFILE_RE = /vcpkg_download_distfile\s*\([\s\S]*?\bURLS?\s+["']?\s*(https?:\/\/[^\s"')\]]+)["']?/i;

const URL_EXTRACT_RE = /https?:\/\/[^\s"')\]]+/gi;

function extractGitHubOwnerRepo(repoStr: string): { owner: string; repo: string } | null {
  const parts = repoStr.split("/");
  if (parts.length === 2) {
    return { owner: parts[0], repo: parts[1] };
  }
  return null;
}

function normalizeRepoUrl(origin: string, segments: string[]): string {
  return `${origin}/${segments.filter(Boolean).join("/")}`.replace(/\/+$/, "");
}

function trimTrailingGit(pathSegment: string): string {
  return pathSegment.replace(/\.git$/, "");
}

function extractRepoRootFromSegments(
  u: URL,
  options: {
    stopBefore?: (segment: string) => boolean;
    stopAfterGit?: boolean;
    stripGitSuffix?: boolean;
  } = {},
): string[] {
  const rawSegments = u.pathname.split("/").filter(Boolean);
  const repoSegments: string[] = [];

  for (const rawSegment of rawSegments) {
    if (options.stopBefore?.(rawSegment)) {
      break;
    }

    const segment = options.stripGitSuffix ? trimTrailingGit(rawSegment) : rawSegment;
    repoSegments.push(segment);

    if (options.stopAfterGit && rawSegment.endsWith(".git")) {
      break;
    }
  }

  return repoSegments;
}

function extractUrlProvider(
  url: string,
): { provider: string; owner?: string; repo?: string; url?: string } | null {
  try {
    const u = new URL(url);
    if (u.hostname === "github.com") {
      const parts = u.pathname.replace(/^\//, "").split("/");
      if (parts.length >= 2) {
        const owner = parts[0];
        const repo = trimTrailingGit(parts[1]);
        return {
          provider: "github",
          owner,
          repo,
          url: normalizeRepoUrl(u.origin, [owner, repo]),
        };
      }
    }
    if (u.hostname === "gitlab.com") {
      const parts = u.pathname.replace(/^\//, "").split("/");
      if (parts.length >= 2) {
        const owner = parts[0];
        const repo = trimTrailingGit(parts[1]);
        return {
          provider: "gitlab",
          owner,
          repo,
          url: normalizeRepoUrl(u.origin, [owner, repo]),
        };
      }
    }
    if (u.hostname.startsWith("gitlab.")) {
      const repoSegments = extractRepoRootFromSegments(u, {
        stopBefore: (segment) => segment === "-" || segment === "+" || segment === "raw",
      });
      if (repoSegments.length >= 2) {
        return {
          provider: "url",
          url: normalizeRepoUrl(u.origin, repoSegments),
        };
      }
    }
    if (u.hostname === "bitbucket.org") {
      const parts = u.pathname.replace(/^\//, "").split("/");
      if (parts.length >= 2) {
        const owner = parts[0];
        const repo = trimTrailingGit(parts[1]);
        return {
          provider: "bitbucket",
          owner,
          repo,
          url: normalizeRepoUrl(u.origin, [owner, repo]),
        };
      }
    }
    if (u.hostname === "codeberg.org") {
      const parts = u.pathname.replace(/^\//, "").split("/");
      if (parts.length >= 2) {
        const owner = parts[0];
        const repo = trimTrailingGit(parts[1]);
        return {
          provider: "url",
          owner,
          repo,
          url: normalizeRepoUrl(u.origin, [owner, repo]),
        };
      }
    }
    if (u.hostname.endsWith(".googlesource.com")) {
      const repoSegments = extractRepoRootFromSegments(u, {
        stopBefore: (segment) => segment === "+",
        stopAfterGit: true,
        stripGitSuffix: true,
      });
      if (repoSegments.length >= 1) {
        return {
          provider: "url",
          url: normalizeRepoUrl(u.origin, repoSegments),
        };
      }
    }
    if (u.hostname === "git.kernel.org" || u.hostname === "git.libcamera.org") {
      const repoSegments = extractRepoRootFromSegments(u, {
        stopAfterGit: true,
      });
      if (repoSegments.some((segment) => segment.length > 0)) {
        return {
          provider: "url",
          url: normalizeRepoUrl(u.origin, repoSegments),
        };
      }
    }
    if (u.hostname.includes("sourceforge.net") || u.hostname.includes("sourceforge")) {
      return { provider: "sourceforge", url: `${u.origin}${u.pathname}`.replace(/\/+$/, "") };
    }
  } catch {
    // ignore invalid URLs
  }
  return null;
}

function extractUrlsFromUrlSBlock(portfile: string, startIndex: number): string[] {
  const openParen = portfile.indexOf("(", startIndex);
  if (openParen < 0) return [];

  let depth = 0;
  let endIndex = openParen;
  for (let i = openParen; i < portfile.length; i++) {
    if (portfile[i] === "(") depth++;
    if (portfile[i] === ")") {
      depth--;
      if (depth === 0) {
        endIndex = i;
        break;
      }
    }
  }

  const blockContent = portfile.slice(startIndex, endIndex + 1);
  const urls: string[] = [];
  let urlMatch: RegExpExecArray | null;
  while ((urlMatch = URL_EXTRACT_RE.exec(blockContent)) !== null) {
    urls.push(urlMatch[0]);
  }
  return urls;
}

export function parsePortfile(portfile: string): PortfileSource {
  const githubMatch = portfile.match(GITHUB_REPO_RE);
  if (githubMatch) {
    const ownerRepo = extractGitHubOwnerRepo(githubMatch[1]);
    if (ownerRepo) {
      const hostMatch = portfile.match(GITHUB_HOST_RE);
      if (hostMatch?.[1]) {
        const hostProvider = extractUrlProvider(hostMatch[1]);
        const baseUrl = hostMatch[1].replace(/\/+$/, "");
        if (hostProvider?.provider === "github") {
          return {
            provider: "github",
            owner: ownerRepo.owner,
            repo: ownerRepo.repo,
            url: `${baseUrl}/${ownerRepo.owner}/${ownerRepo.repo}`,
            confidence: 100,
            detectedFrom: "portfile.vcpkg_from_github",
          };
        }
        return {
          provider: "url",
          url: `${baseUrl}/${ownerRepo.owner}/${ownerRepo.repo}`,
          confidence: 95,
          detectedFrom: "portfile.vcpkg_from_github_host",
        };
      }

      return {
        provider: "github",
        owner: ownerRepo.owner,
        repo: ownerRepo.repo,
        confidence: 100,
        detectedFrom: "portfile.vcpkg_from_github",
      };
    }
  }

  const gitlabMatch = portfile.match(GITLAB_REPO_RE);
  if (gitlabMatch) {
    const gitlabUrlMatch = portfile.match(GITLAB_URL_RE);
    if (gitlabUrlMatch?.[1]) {
      const baseUrl = gitlabUrlMatch[1].replace(/\/+$/, "");
      return {
        provider: "url",
        url: `${baseUrl}/${gitlabMatch[1]}`,
        confidence: 95,
        detectedFrom: "portfile.vcpkg_from_gitlab",
      };
    }

    const ownerRepo = extractGitHubOwnerRepo(gitlabMatch[1]);
    return {
      provider: "gitlab",
      owner: ownerRepo?.owner,
      repo: ownerRepo?.repo,
      url: ownerRepo ? `https://gitlab.com/${ownerRepo.owner}/${ownerRepo.repo}` : undefined,
      confidence: 90,
      detectedFrom: "portfile.vcpkg_from_gitlab",
    };
  }

  const bitbucketMatch = portfile.match(BITBUCKET_REPO_RE);
  if (bitbucketMatch) {
    const ownerRepo = extractGitHubOwnerRepo(bitbucketMatch[1]);
    return {
      provider: "bitbucket",
      owner: ownerRepo?.owner,
      repo: ownerRepo?.repo,
      confidence: 90,
      detectedFrom: "portfile.vcpkg_from_bitbucket",
    };
  }

  const sourceforgeMatch = portfile.match(SOURCEFORGE_RE);
  if (sourceforgeMatch) {
    return {
      provider: "sourceforge",
      confidence: 90,
      detectedFrom: "portfile.vcpkg_from_sourceforge",
    };
  }

  const gitMatch = portfile.match(GIT_URL_RE);
  if (gitMatch) {
    const urlProvider = extractUrlProvider(gitMatch[1]);
    if (urlProvider) {
      return {
        provider: urlProvider.provider as PortfileSource["provider"],
        owner: urlProvider.owner,
        repo: urlProvider.repo,
        url: urlProvider.url ?? gitMatch[1],
        confidence: 90,
        detectedFrom: "portfile.vcpkg_from_git",
      };
    }
  }

  const urlMatch = portfile.match(URL_RE);
  if (urlMatch) {
    const urlProvider = extractUrlProvider(urlMatch[1]);
    if (urlProvider) {
      return {
        provider: urlProvider.provider as PortfileSource["provider"],
        owner: urlProvider.owner,
        repo: urlProvider.repo,
        url: urlProvider.url ?? urlMatch[1],
        confidence: 90,
        detectedFrom: "portfile.vcpkg_from_url",
      };
    }
    return {
      provider: "url",
      url: urlMatch[1],
      confidence: 70,
      detectedFrom: "portfile.vcpkg_from_url",
    };
  }

  const urlsBlockMatch = portfile.match(URLS_RE);
  if (urlsBlockMatch && urlsBlockMatch.index !== undefined) {
    const urls = extractUrlsFromUrlSBlock(portfile, urlsBlockMatch.index);
    for (const url of urls) {
      const urlProvider = extractUrlProvider(url);
      if (urlProvider) {
        return {
          provider: urlProvider.provider as PortfileSource["provider"],
          owner: urlProvider.owner,
          repo: urlProvider.repo,
          url: urlProvider.url ?? url,
          confidence: 90,
          detectedFrom: "portfile.vcpkg_from_url",
        };
      }
    }
    if (urls.length > 0) {
      return {
        provider: "url",
        url: urls[0],
        confidence: 70,
        detectedFrom: "portfile.vcpkg_from_url",
      };
    }
  }

  const distfileMatch = portfile.match(DISTFILE_RE);
  if (distfileMatch) {
    const urlProvider = extractUrlProvider(distfileMatch[1]);
    if (urlProvider) {
      return {
        provider: urlProvider.provider as PortfileSource["provider"],
        owner: urlProvider.owner,
        repo: urlProvider.repo,
        url: urlProvider.url ?? distfileMatch[1],
        confidence: 70,
        detectedFrom: "portfile.vcpkg_download_distfile",
      };
    }
  }

  return {
    provider: "none",
    confidence: 0,
    detectedFrom: "none",
  };
}

export function detectUpstreamFromHomepage(homepage: string): PortfileSource | null {
  const urlProvider = extractUrlProvider(homepage);
  if (urlProvider) {
    return {
      provider: urlProvider.provider as PortfileSource["provider"],
      owner: urlProvider.owner,
      repo: urlProvider.repo,
      url: urlProvider.url ?? homepage,
      confidence: 70,
      detectedFrom: "manifest.homepage",
    };
  }
  return null;
}
