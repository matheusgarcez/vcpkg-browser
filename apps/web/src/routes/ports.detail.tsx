import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import * as Tabs from "@radix-ui/react-tabs";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  ExternalLink,
  FileCode,
  GitFork,
  Info,
  Scale,
  Star,
} from "lucide-react";
import { usePortFile, usePortUpstream, useResolvedPortDetail } from "../api/queries";
import { InstallCommandBuilder } from "../components/ports/InstallCommandBuilder";
import { MaintenanceScorePopover } from "../components/ports/MaintenanceScorePopover";
import { PackagingRiskPopover } from "../components/ports/PackagingRiskPopover";
import { CodeBlock } from "../components/ui/CodeBlock";
import { CopyButton } from "../components/ui/CopyButton";
import { VCPKG_DEFAULT_BRANCH, VCPKG_REPO_URL } from "@pkg/shared";
import type {
  DependencyDto,
  DependencyRefDto,
  FeatureDto,
  PortDetailDto,
  PortFileDto,
  UpstreamDto,
  VersionDto,
} from "@pkg/shared";

type TabName = "readme" | "versions" | "features" | "dependencies" | "files" | "upstream";
type DetailLocationState = {
  backTo?: {
    pathname: string;
    search?: string;
  };
};

const DAY_MS = 86_400_000;

type UpstreamLagInfo = {
  kind: "release-lag" | "commit-lag";
  title: string;
  detail: string;
};

type SourceReferenceInfo = {
  href: string;
  label: string;
  detail: string;
};

function parseOptionalDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatLagDays(days: number): string {
  if (days >= 730) return `${Math.round(days / 365)} years`;
  if (days >= 90) return `${Math.round(days / 30)} months`;
  return `${days} days`;
}

function normalizeComparableVersion(value?: string | null): string | null {
  if (!value) return null;

  let normalized = value.trim().toLowerCase();
  normalized = normalized.replace(/^refs\/tags\//, "");
  normalized = normalized.replace(/^release[-_/]/, "");
  normalized = normalized.replace(/^version[-_/]/, "");
  if (normalized.startsWith("v") && /\d/.test(normalized[1] ?? "")) {
    normalized = normalized.slice(1);
  }

  const numeric = normalized.match(/\d+(?:[._-]\d+)*/)?.[0];
  if (numeric) {
    const parts = numeric.split(/[._-]/).map((part) => String(Number.parseInt(part, 10)));
    while (parts.length > 1 && parts[parts.length - 1] === "0") {
      parts.pop();
    }
    return parts.join(".");
  }

  return normalized || null;
}

function versionsClearlyMatch(portVersion: string, releaseTag?: string): boolean {
  const normalizedPort = normalizeComparableVersion(portVersion);
  const normalizedRelease = normalizeComparableVersion(releaseTag);
  return Boolean(normalizedPort && normalizedRelease && normalizedPort === normalizedRelease);
}

function truncateText(value?: string, maxLength = 180): string | null {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}...` : normalized;
}

function getRegistrySyncDate(port: Pick<PortDetailDto, "updatedInRegistryAt" | "vcpkgUpdatedAt">): Date | null {
  return parseOptionalDate(port.updatedInRegistryAt ?? port.vcpkgUpdatedAt ?? null);
}

function getUpstreamLagInfo(
  port: Pick<PortDetailDto, "version" | "updatedInRegistryAt" | "vcpkgUpdatedAt">,
  upstream?: UpstreamDto,
): UpstreamLagInfo | null {
  if (!upstream) return null;

  const registrySyncDate = getRegistrySyncDate(port);
  if (!registrySyncDate) return null;

  const latestKnownVersion = upstream.latestReleaseTag ?? upstream.latestTagName;
  const latestKnownPublishedAt = upstream.latestReleasePublishedAt ?? upstream.latestTagPublishedAt;
  const latestReleaseDate = parseOptionalDate(latestKnownPublishedAt);
  const lastCommitDate = parseOptionalDate(upstream.lastCommitAt);
  const exactReleaseMatch = versionsClearlyMatch(port.version, latestKnownVersion);

  if (!exactReleaseMatch && latestKnownVersion && latestReleaseDate) {
    const lagDays = Math.floor((latestReleaseDate.getTime() - registrySyncDate.getTime()) / DAY_MS);
    if (lagDays >= 60) {
      return {
        kind: "release-lag",
        title: "vcpkg may lag behind the latest upstream version",
        detail: `vcpkg is on ${port.version}, while upstream is at ${latestKnownVersion} about ${formatLagDays(lagDays)} after the last vcpkg update.`,
      };
    }
  }

  if (!latestKnownVersion && lastCommitDate) {
    const lagDays = Math.floor((lastCommitDate.getTime() - registrySyncDate.getTime()) / DAY_MS);
    if (lagDays >= 180) {
      return {
        kind: "commit-lag",
        title: "Upstream has newer commits than this vcpkg package",
        detail: `The upstream default branch kept moving for about ${formatLagDays(lagDays)} after the last vcpkg update.`,
      };
    }
  }

  return null;
}

function formatDate(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString();
}

function formatVersionReference(version: string, portVersion?: number): string {
  return `${version}#${portVersion ?? 0}`;
}

function historicalPortHref(name: string, version: string, portVersion?: number): string {
  return portVersion && portVersion > 0
    ? `/ports/${encodeURIComponent(name)}/v/${encodeURIComponent(version)}/${portVersion}`
    : `/ports/${encodeURIComponent(name)}/v/${encodeURIComponent(version)}`;
}

function portDirectoryGithubUrl(portName: string, ref = VCPKG_DEFAULT_BRANCH): string {
  return `${VCPKG_REPO_URL}/tree/${encodeURIComponent(ref)}/ports/${encodeURIComponent(portName)}`;
}

function buildSourceReferenceInfo(port: Pick<PortDetailDto, "sourceProvenance">): SourceReferenceInfo | null {
  const provenance = port.sourceProvenance;
  if (!provenance?.referenceUrl) return null;

  return {
    href: provenance.referenceUrl,
    label: provenance.ref ?? provenance.sourceUrl ?? provenance.referenceUrl,
    detail: provenance.reason,
  };
}

function formatPatchBurdenLabel(value: NonNullable<PortDetailDto["patching"]>["burdenLabel"]): string {
  switch (value) {
    case "none": return "None";
    case "light": return "Light";
    case "moderate": return "Moderate";
    case "heavy": return "Heavy";
    default: return value;
  }
}

function formatSourceProvenanceLabel(value: NonNullable<PortDetailDto["sourceProvenance"]>["quality"]): string {
  switch (value) {
    case "exact-commit": return "Exact commit";
    case "exact-tag": return "Exact tag";
    case "release-asset": return "Release asset";
    case "archive-ref": return "Archive ref";
    case "branch-ref": return "Branch ref";
    case "url-only": return "URL only";
    case "unknown":
    default: return "Unknown";
  }
}

function formatRelativeAge(days?: number): string | null {
  if (typeof days !== "number") return null;
  if (days >= 730) return `${Math.round(days / 365)} years`;
  if (days >= 90) return `${Math.round(days / 30)} months`;
  if (days >= 14) return `${Math.round(days / 7)} weeks`;
  return `${days} days`;
}

function formatDependencySpec(dep: DependencyRefDto | DependencyDto): string {
  const features = dep.features?.length ? `[${dep.features.join(",")}]` : "";
  return `${dep.name}${features}`;
}

function dependencyMeta(dep: DependencyRefDto | DependencyDto): string[] {
  const parts: string[] = [];
  if (dep.defaultFeatures === false) parts.push("no default features");
  if (dep.host) parts.push("host");
  if (dep.dependencyType) parts.push(dep.dependencyType);
  if (dep.platform) parts.push(dep.platform);
  return parts;
}

function InfoRow({
  label,
  value,
  layout = "inline",
}: {
  label: string;
  value: ReactNode;
  layout?: "inline" | "stacked";
}) {
  if (layout === "stacked") {
    return (
      <div>
        <div className="mb-1 text-xs text-[var(--color-text-secondary)]">
          {label}
        </div>
        <div className="text-xs text-[var(--color-text)]">
          {value}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 text-xs text-[var(--color-text-secondary)]">
        {label}
      </div>
      <div className="min-w-0 text-right text-xs text-[var(--color-text)]">
        {value}
      </div>
    </div>
  );
}

function DetailFact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-xs text-[var(--color-text-secondary)]">
        {label}
      </div>
      <div className="min-w-0 text-sm text-[var(--color-text)]">
        {value}
      </div>
    </div>
  );
}

function SidebarSection({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-2 border-t border-[var(--color-border)] pt-3 first:border-t-0 first:pt-0">
      {children}
    </div>
  );
}

function DependencyReference({ dep }: { dep: DependencyRefDto | DependencyDto }) {
  const meta = dependencyMeta(dep);

  return (
    <div className="rounded-md border border-[var(--color-border)] px-2 py-1">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to={`/ports/${encodeURIComponent(dep.name)}`}
          className="font-mono text-sm text-[var(--color-primary)] hover:underline"
        >
          {formatDependencySpec(dep)}
        </Link>
      </div>
      {meta.length > 0 ? (
        <div className="text-xs text-[var(--color-text-secondary)]">{meta.join(" | ")}</div>
      ) : null}
    </div>
  );
}

function HistoricalBanner({ port }: { port: PortDetailDto }) {
  if (port.view !== "historical" || !port.selectedVersion) return null;

  return (
    <div className="mb-6 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <div className="text-sm font-medium">Historical snapshot</div>
          <div className="text-sm text-[var(--color-text-secondary)]">
            Viewing {formatVersionReference(port.selectedVersion.version, port.selectedVersion.portVersion)}
          </div>
        </div>
        {port.selectedVersion.gitTree ? (
          <div className="flex items-center gap-2 rounded-md border border-[var(--color-border)] px-2">
            <code className="text-xs">{port.selectedVersion.gitTree}</code>
            <CopyButton text={port.selectedVersion.gitTree} />
          </div>
        ) : null}
        <Link
          to={`/ports/${encodeURIComponent(port.name)}`}
          className="ml-auto text-sm text-[var(--color-primary)] hover:underline"
        >
          Open current port page
        </Link>
      </div>
    </div>
  );
}

function UsageSection({ usage }: { usage?: string }) {
  if (!usage) return null;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-medium">Usage</h2>
      </div>
      <CodeBlock code={usage} language="cmake" />
    </section>
  );
}

function VersionsTabContent({
  portName,
  versions,
  selectedVersion,
}: {
  portName: string;
  versions: VersionDto[];
  selectedVersion?: { version: string; portVersion?: number };
}) {
  if (versions.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center shadow-[var(--shadow-sm)]">
        <p className="text-sm text-[var(--color-text-secondary)]">No versions available</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[var(--color-surface)] border-b border-[var(--color-border)]">
            <th className="text-left p-3 font-medium">Version</th>
            <th className="text-left p-3 font-medium">Port Version</th>
            <th className="text-left p-3 font-medium">Added to vcpkg</th>
            <th className="text-left p-3 font-medium">Git Tree</th>
          </tr>
        </thead>
        <tbody>
          {versions.map((versionRow) => {
            const isActive =
              selectedVersion?.version === versionRow.version &&
              (selectedVersion.portVersion ?? 0) === (versionRow.portVersion ?? 0);
            const displayDate = formatDate(versionRow.publishedAt ?? versionRow.date);

            return (
              <tr
                key={`${versionRow.version}#${versionRow.portVersion ?? 0}`}
                className={`border-b border-[var(--color-border)] bg-[var(--color-surface)] last:border-0 ${isActive ? "bg-[var(--color-surface-muted)]" : ""}`}
              >
                <td className="p-2">
                  <Link
                    to={historicalPortHref(portName, versionRow.version, versionRow.portVersion)}
                    className="font-mono text-[var(--color-primary)] hover:underline"
                  >
                    {versionRow.version}
                  </Link>
                </td>
                <td className="p-2 text-[var(--color-text-secondary)]">{versionRow.portVersion ?? 0}</td>
                <td className="p-2 text-[var(--color-text-secondary)]">
                  {displayDate ?? <span className="opacity-40">-</span>}
                </td>
                <td className="p-2">
                  {versionRow.gitTree ? (
                    <div className="flex items-center gap-2">
                      {versionRow.registryCommit ? (
                        <a
                          href={portDirectoryGithubUrl(portName, versionRow.registryCommit)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-xs text-[var(--color-primary)] hover:underline"
                          title={`Open ${portName} in microsoft/vcpkg at ${versionRow.registryCommit}`}
                        >
                          {versionRow.gitTree}
                        </a>
                      ) : (
                        <code className="text-xs text-[var(--color-text-secondary)]">{versionRow.gitTree}</code>
                      )}
                      <CopyButton text={versionRow.gitTree} />
                    </div>
                  ) : (
                    <span className="opacity-40">-</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FeaturesTabContent({ portName, features }: { portName: string; features: FeatureDto[] }) {
  if (features.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center shadow-[var(--shadow-sm)]">
        <p className="text-sm text-[var(--color-text-secondary)]">No features</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {features.map((feature) => {
        const featureSpec = `${portName}[${feature.name}]`;

        return (
          <div key={feature.name} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-[var(--shadow-sm)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{feature.name}</span>
                  {feature.defaultFeature ? (
                    <span className="rounded border border-[var(--color-accent-green)] px-1.5 py-0.5 text-xs text-[var(--color-accent-green)]">
                      default
                    </span>
                  ) : null}
                </div>
                {feature.description ? (
                  <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{feature.description}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-2 rounded-md border border-[var(--color-border)] px-2">
                <code className="text-xs">{featureSpec}</code>
                <CopyButton text={featureSpec} />
              </div>
            </div>

            <div className="mt-2 grid gap-4 md:grid-cols-2">
              <InfoRow
                label="Supports"
                value={feature.supports ? <code className="text-xs">{feature.supports}</code> : <span className="text-[var(--color-text-secondary)]">All</span>}
              />
              <div>
                <div className="text-xs text-[var(--color-text-secondary)] mb-1">Feature Dependencies</div>
                {feature.dependencies && feature.dependencies.length > 0 ? (
                  <div className="space-y-2">
                    {feature.dependencies.map((dep) => (
                      <DependencyReference key={`${feature.name}-${formatDependencySpec(dep)}`} dep={dep} />
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-[var(--color-text-secondary)]">None</div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DependencyTable({ dependencies }: { dependencies: DependencyDto[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
            <th className="p-3 text-left font-medium">Dependency</th>
            <th className="p-3 text-left font-medium">Platform</th>
            <th className="p-3 text-left font-medium">Type</th>
            <th className="p-3 text-left font-medium">Source</th>
          </tr>
        </thead>
        <tbody>
          {dependencies.map((dep, index) => (
            <tr key={`${dep.name}-${index}`} className="border-b border-[var(--color-border)] bg-[var(--color-surface)] last:border-0">
              <td className="p-2">
                <div className="space-y-1">
                  <Link
                    to={`/ports/${encodeURIComponent(dep.name)}`}
                    className="font-mono text-[var(--color-primary)] hover:underline"
                  >
                    {formatDependencySpec(dep)}
                  </Link>
                  {dependencyMeta(dep).length > 0 ? (
                    <div className="text-xs text-[var(--color-text-secondary)]">{dependencyMeta(dep).join(" | ")}</div>
                  ) : null}
                </div>
              </td>
              <td className="p-2 text-xs font-mono text-[var(--color-text-secondary)]">{dep.platform ?? "-"}</td>
              <td className="p-2 text-[var(--color-text-secondary)]">{dep.dependencyType ?? "regular"}</td>
              <td className="p-2 text-[var(--color-text-secondary)]">{dep.source ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DependenciesTabContent({
  dependencies,
  splitHostDependencies,
}: {
  dependencies: DependencyDto[];
  splitHostDependencies?: boolean;
}) {
  if (dependencies.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center shadow-[var(--shadow-sm)]">
        <p className="text-sm text-[var(--color-text-secondary)]">No dependencies</p>
      </div>
    );
  }

  if (!splitHostDependencies) {
    return <DependencyTable dependencies={dependencies} />;
  }

  const targetDependencies = dependencies.filter((dependency) => !dependency.host);
  const hostDependencies = dependencies.filter((dependency) => dependency.host);

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <div>
          <div className="text-sm font-medium">Target dependencies</div>
          <div className="text-xs text-[var(--color-text-secondary)]">
            Libraries linked into the target package.
          </div>
        </div>
        {targetDependencies.length > 0 ? (
          <DependencyTable dependencies={targetDependencies} />
        ) : (
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text-secondary)] shadow-[var(--shadow-sm)]">
            No target dependencies
          </div>
        )}
      </section>

      {hostDependencies.length > 0 ? (
        <section className="space-y-3">
          <div>
            <div className="text-sm font-medium">Host dependencies</div>
            <div className="text-xs text-[var(--color-text-secondary)]">
              Build tools and host-side helpers used while packaging.
            </div>
          </div>
          <DependencyTable dependencies={hostDependencies} />
        </section>
      ) : null}
    </div>
  );
}

type MarkdownModules = {
  ReactMarkdown: typeof import("react-markdown").default;
  rehypeHighlight: typeof import("rehype-highlight").default;
  remarkGfm: typeof import("remark-gfm").default;
};

function MarkdownContent({ content }: { content: string }) {
  const [modules, setModules] = useState<MarkdownModules | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadModules = () => {
      void Promise.all([import("react-markdown"), import("remark-gfm"), import("rehype-highlight")]).then(
        ([reactMarkdownModule, remarkGfmModule, rehypeHighlightModule]) => {
          if (cancelled) return;
          setModules({
            ReactMarkdown: reactMarkdownModule.default,
            rehypeHighlight: rehypeHighlightModule.default,
            remarkGfm: remarkGfmModule.default,
          });
        },
      );
    };

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const handle = window.requestIdleCallback(loadModules);
      return () => {
        cancelled = true;
        window.cancelIdleCallback(handle);
      };
    }

    const timeoutId = globalThis.setTimeout(loadModules, 0);
    return () => {
      cancelled = true;
      globalThis.clearTimeout(timeoutId);
    };
  }, []);

  if (!modules) {
    return (
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text-secondary)]">
        Loading README...
      </div>
    );
  }

  const { ReactMarkdown, rehypeHighlight, remarkGfm } = modules;

  return (
    <div className="markdown">
      <ReactMarkdown
        rehypePlugins={[rehypeHighlight]}
        remarkPlugins={[remarkGfm]}
        components={{
          img: ({ node: _node, ...props }) => (
            <img
              {...props}
              style={{ maxWidth: "100%" }}
              onError={(event) => {
                (event.target as HTMLImageElement).style.display = "none";
              }}
            />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function FileRow({
  portName,
  file,
  allowFetch,
}: {
  portName: string;
  file: PortFileDto;
  allowFetch: boolean;
}) {
  const [open, setOpen] = useState(false);
  const shouldFetch = allowFetch && open && !file.content;
  const { data: fetchedFile, isLoading } = usePortFile(portName, shouldFetch ? file.id : 0);
  const content = file.content ?? fetchedFile?.content ?? "";

  return (
    <div>
      <button
        onClick={() => setOpen((value) => !value)}
        className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-left transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-muted)]"
      >
        <div className="flex items-center gap-2 min-w-0">
          <FileCode className="w-4 h-4 text-[var(--color-text-secondary)] shrink-0" />
          <span className="text-sm font-mono truncate">{file.path}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs px-1.5 py-0.5 border border-[var(--color-border)] rounded text-[var(--color-text-secondary)]">{file.fileType}</span>
          {file.sizeBytes !== undefined ? (
            <span className="text-xs text-[var(--color-text-secondary)]">
              {file.sizeBytes > 1024 ? `${(file.sizeBytes / 1024).toFixed(1)} KB` : `${file.sizeBytes} B`}
            </span>
          ) : null}
        </div>
      </button>
      {open ? (
        <div className="mt-1">
          {isLoading && !file.content ? (
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text-secondary)]">
              Loading file...
            </div>
          ) : !content ? (
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text-secondary)]">
              Historical file contents are not materialized for this file.
            </div>
          ) : (
            <CodeBlock code={content} language={file.fileType} maxHeight="28rem" />
          )}
        </div>
      ) : null}
    </div>
  );
}

function FilesTabContent({
  portName,
  files,
  allowFetch,
}: {
  portName: string;
  files: PortFileDto[];
  allowFetch: boolean;
}) {
  if (files.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center shadow-[var(--shadow-sm)]">
        <p className="text-sm text-[var(--color-text-secondary)]">No files available</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {files.map((file) => (
        <FileRow key={`${file.path}-${file.id}`} portName={portName} file={file} allowFetch={allowFetch} />
      ))}
    </div>
  );
}

function UpstreamTabContent({
  name,
  portVersion,
  vcpkgUpdatedAt,
  updatedInRegistryAt,
  portHomepage,
}: {
  name: string;
  portVersion: string;
  vcpkgUpdatedAt?: string;
  updatedInRegistryAt?: string;
  portHomepage?: string;
}) {
  const { data, isLoading, error } = usePortUpstream(name);

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-20 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg" />
          ))}
        </div>
        <div className="h-48 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center shadow-[var(--shadow-sm)]">
        <AlertTriangle className="w-5 h-5 text-[var(--color-accent-yellow)] mx-auto mb-2" />
        <p className="text-sm text-[var(--color-text-secondary)]">Failed to load upstream data</p>
      </div>
    );
  }

  if (!data?.upstream) {
    return (
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center shadow-[var(--shadow-sm)]">
        <Info className="w-6 h-6 text-[var(--color-text-secondary)] mx-auto mb-3" />
        <h3 className="text-sm font-semibold mb-2">No upstream repository detected</h3>
        <p className="text-sm text-[var(--color-text-secondary)] max-w-md mx-auto">
          This port does not have an associated upstream repository in vcpkg metadata.
        </p>
      </div>
    );
  }

  const upstream = data.upstream;
  const lagInfo = getUpstreamLagInfo({ version: portVersion, vcpkgUpdatedAt, updatedInRegistryAt }, upstream);
  const showUpstreamHomepage = upstream.homepageUrl && upstream.homepageUrl !== upstream.url && upstream.homepageUrl !== portHomepage;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-sm)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold">
                {(upstream.owner || upstream.repo) ? `${upstream.owner ?? ""}/${upstream.repo ?? ""}`.replace(/^\//, "") : "Upstream repository"}
              </h3>
              <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">
                {upstream.provider}
              </span>
            </div>
            <p className="mt-2 break-all text-sm text-[var(--color-text-secondary)]">{upstream.url}</p>
            {lagInfo ? (
              <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
                <span className="font-medium text-[var(--color-text)]">{lagInfo.title}.</span> {lagInfo.detail}
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            <a
              href={upstream.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-sm text-[var(--color-text)] transition-colors hover:border-[var(--color-border-strong)]"
            >
              Repository
              <ExternalLink className="h-4 w-4" />
            </a>
            {upstream.latestReleaseUrl ? (
              <a
                href={upstream.latestReleaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-sm text-[var(--color-text)] transition-colors hover:border-[var(--color-border-strong)]"
              >
                Latest release
                <ExternalLink className="h-4 w-4" />
              </a>
            ) : null}
            {upstream.latestTagUrl && upstream.latestTagUrl !== upstream.latestReleaseUrl ? (
              <a
                href={upstream.latestTagUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-sm text-[var(--color-text)] transition-colors hover:border-[var(--color-border-strong)]"
              >
                Latest tag
                <ExternalLink className="h-4 w-4" />
              </a>
            ) : null}
          </div>
        </div>

        {(upstream.archived || upstream.disabled) ? (
          <div
            className="mt-4 rounded-xl border px-3 py-2.5"
            style={{ borderColor: "var(--color-accent-red)" }}
          >
            <p className="text-sm" style={{ color: "var(--color-accent-red)" }}>
              {upstream.archived ? "This repository has been archived." : "This repository has been disabled."}
            </p>
          </div>
        ) : null}

        {upstream.detectionWarnings && upstream.detectionWarnings.length > 0 ? (
          <div
            className="mt-4 rounded-xl border px-3 py-2.5"
            style={{ borderColor: "var(--color-accent-yellow)" }}
          >
            <div className="mb-2 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" style={{ color: "var(--color-accent-yellow)" }} />
              <span className="text-sm font-medium">Detection warnings</span>
            </div>
            <ul className="space-y-1">
              {upstream.detectionWarnings.map((warning, index) => (
                <li key={index} className="text-xs text-[var(--color-text-secondary)]">{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)]">
        <div className="grid grid-cols-2 divide-x divide-y divide-[var(--color-border)] md:grid-cols-4 md:divide-y-0">
        {upstream.stars !== undefined ? (
            <div className="p-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">Stars</div>
            <div className="mt-2 text-2xl font-semibold">
              {upstream.stars > 1000 ? `${(upstream.stars / 1000).toFixed(1)}k` : upstream.stars}
            </div>
          </div>
        ) : null}
        {upstream.forks !== undefined ? (
            <div className="p-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">Forks</div>
            <div className="mt-2 text-2xl font-semibold">{upstream.forks}</div>
          </div>
        ) : null}
        {upstream.openIssues !== undefined ? (
            <div className="p-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">Open issues</div>
            <div className="mt-2 text-2xl font-semibold">{upstream.openIssues}</div>
          </div>
        ) : null}
        {upstream.openPrs !== undefined ? (
            <div className="p-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">Open PRs</div>
            <div className="mt-2 text-2xl font-semibold">{upstream.openPrs}</div>
          </div>
        ) : null}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)] lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="p-4">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">
            Release and activity
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {upstream.latestReleaseTag ? (
              <div>
                <div className="mb-1 text-xs text-[var(--color-text-secondary)]">Latest release</div>
                <div className="text-sm">
                  {upstream.latestReleaseUrl ? (
                    <a href={upstream.latestReleaseUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--color-primary)] hover:underline">
                      {upstream.latestReleaseTag}
                    </a>
                  ) : (
                    upstream.latestReleaseTag
                  )}
                </div>
                {upstream.latestReleasePublishedAt ? (
                  <div className="mt-1 text-xs text-[var(--color-text-secondary)]">
                    {formatDate(upstream.latestReleasePublishedAt)}
                    {upstream.latestReleaseIsPrerelease ? " | prerelease" : ""}
                    {upstream.latestReleaseIsDraft ? " | draft" : ""}
                  </div>
                ) : null}
              </div>
            ) : null}
            {upstream.latestTagName ? (
              <div>
                <div className="mb-1 text-xs text-[var(--color-text-secondary)]">Latest tag</div>
                <div className="text-sm">
                  {upstream.latestTagUrl ? (
                    <a href={upstream.latestTagUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--color-primary)] hover:underline">
                      {upstream.latestTagName}
                    </a>
                  ) : (
                    upstream.latestTagName
                  )}
                </div>
                {upstream.latestTagPublishedAt ? (
                  <div className="mt-1 text-xs text-[var(--color-text-secondary)]">
                    {formatDate(upstream.latestTagPublishedAt)}
                  </div>
                ) : null}
              </div>
            ) : null}
            {upstream.lastCommitAt ? (
              <DetailFact label="Last commit" value={formatDate(upstream.lastCommitAt) ?? "-"} />
            ) : null}
            {upstream.repoCreatedAt ? (
              <DetailFact label="Repository created" value={formatDate(upstream.repoCreatedAt) ?? "-"} />
            ) : null}
            {upstream.mergedPrs30d !== undefined ? (
              <DetailFact label="Merged PRs in 30d" value={upstream.mergedPrs30d.toLocaleString()} />
            ) : null}
            {upstream.closedIssues30d !== undefined ? (
              <DetailFact label="Closed issues in 30d" value={upstream.closedIssues30d.toLocaleString()} />
            ) : null}
          </div>
        </div>

        <div className="border-t border-[var(--color-border)] p-4 lg:border-l lg:border-t-0">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">
            Repository details
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <DetailFact label="Provider" value={<span className="capitalize">{upstream.provider}</span>} />
            {upstream.primaryLanguage ? (
              <DetailFact
                label="Primary language"
                value={(
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full border border-[var(--color-border)]"
                      style={{ backgroundColor: upstream.primaryLanguageColor || "transparent" }}
                    />
                    <span className="truncate">{upstream.primaryLanguage}</span>
                  </span>
                )}
              />
            ) : null}
            {showUpstreamHomepage ? (
              <DetailFact
                label="Project homepage"
                value={
                  <a href={upstream.homepageUrl} target="_blank" rel="noopener noreferrer" className="block truncate text-[var(--color-primary)] hover:underline" title={upstream.homepageUrl}>
                    {upstream.homepageUrl}
                  </a>
                }
              />
            ) : null}
            {upstream.licenseName || upstream.licenseSpdxId ? (
              <DetailFact label="Upstream license" value={upstream.licenseSpdxId ?? upstream.licenseName ?? "-"} />
            ) : null}
            {upstream.detectionConfidence !== undefined ? (
              <DetailFact label="Detection confidence" value={`${upstream.detectionConfidence}%`} />
            ) : null}
            {upstream.lastSuccessfulRefreshAt ? (
              <DetailFact label="Last successful refresh" value={formatDate(upstream.lastSuccessfulRefreshAt) ?? "-"} />
            ) : null}
          </div>
        </div>
      </section>

      {upstream.topics && upstream.topics.length > 0 ? (
        <section className="border-t border-[var(--color-border)] pt-4">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">
            Topics
          </div>
          <div className="flex flex-wrap gap-1.5">
            {upstream.topics.slice(0, 10).map((topic) => (
              <span key={topic} className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-2.5 py-1 text-xs text-[var(--color-text-secondary)]">
                {topic}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {upstream.topIssues && upstream.topIssues.length > 0 ? (
        <section className="border-t border-[var(--color-border)] pt-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">
                Top issues
              </div>
              <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                High-signal upstream issue activity captured from the repository.
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)]">
            {upstream.topIssues.map((issue) => {
              const bodyExcerpt = truncateText(issue.bodyText, 180);

              return (
                <div
                  key={issue.number}
                  className="border-b border-[var(--color-border)] px-4 py-3 last:border-b-0"
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="min-w-0">
                      <a href={issue.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium hover:text-[var(--color-primary)] hover:underline">
                        #{issue.number} {issue.title}
                      </a>
                      {bodyExcerpt ? (
                        <p className="mt-1.5 text-sm leading-5 text-[var(--color-text-secondary)]">{bodyExcerpt}</p>
                      ) : null}
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-medium ${
                      issue.state === "open"
                        ? "border-[var(--color-accent-green)] text-[var(--color-accent-green)]"
                        : "border-[var(--color-border)] text-[var(--color-text-secondary)]"
                    }`}>
                      {issue.state}
                    </span>
                  </div>

                  {issue.labels && issue.labels.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {issue.labels.slice(0, 6).map((label) => (
                        <span
                          key={label.name}
                          className="rounded-full border px-2 py-0.5 text-[11px] text-[var(--color-text-secondary)]"
                          style={{ borderColor: label.color ? `#${label.color}` : "var(--color-border)" }}
                          title={label.description}
                        >
                          {label.name}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--color-text-secondary)]">
                    <span>{issue.comments} comments</span>
                    {issue.reactions ? <span>{issue.reactions} reactions</span> : null}
                    {issue.createdAt ? <span>opened {formatDate(issue.createdAt)}</span> : null}
                    <span>updated {formatDate(issue.updatedAt)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function PortDetail() {
  const { name = "", version, portVersion } = useParams<{
    name: string;
    version?: string;
    portVersion?: string;
  }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedPortVersion = portVersion ? Number.parseInt(portVersion, 10) : undefined;
  const { data: port, isLoading, error } = useResolvedPortDetail({
    name,
    version,
    portVersion: Number.isNaN(requestedPortVersion ?? 0) ? undefined : requestedPortVersion,
  });
  const tab = (searchParams.get("tab") as TabName) || "readme";
  const backTo = (location.state as DetailLocationState | null)?.backTo;

  function setTab(next: TabName) {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("tab", next);
    setSearchParams(nextParams, { replace: true, preventScrollReset: true });
  }

  function handleBack() {
    if (backTo?.pathname) {
      navigate({
        pathname: backTo.pathname,
        search: backTo.search,
      });
      return;
    }

    navigate("/ports");
  }

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-[var(--color-surface)] border border-[var(--color-border)] rounded" />
          <div className="h-4 w-96 bg-[var(--color-surface)] border border-[var(--color-border)] rounded" />
          <div className="h-64 bg-[var(--color-surface)] border border-[var(--color-border)] rounded" />
        </div>
      </div>
    );
  }

  if (error || !port) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="text-center py-20">
          <h2 className="text-lg font-semibold mb-2">Port not found</h2>
          <p className="text-sm text-[var(--color-text-secondary)] mb-4">
            The port "{name}" could not be found.
          </p>
          <button
            onClick={() => navigate("/ports")}
            className="text-sm text-[var(--color-primary)] hover:underline"
          >
            Browse all ports
          </button>
        </div>
      </div>
    );
  }

  const lagInfo = port.view === "current" ? getUpstreamLagInfo(port, port.upstream) : null;
  const readmeContent = port.view === "current" ? port.upstream?.readmeMarkdown || port.upstream?.readmeSummary || null : null;
  const sourceReference = buildSourceReferenceInfo(port);
  const tabs: Array<{ value: TabName; label: string }> = [
    { value: "readme", label: "README" },
    { value: "dependencies", label: "Dependencies" },
  ];
  if (port.view !== "historical") {
    tabs.push({ value: "upstream", label: "Upstream" });
  }
  tabs.push(
    { value: "features", label: "Features" },
    { value: "versions", label: "Versions" },
    { value: "files", label: "Files" },
  );

  const activeTab = port.view === "historical" && tab === "upstream" ? "readme" : tab;
  const selectedVersion = port.selectedVersion ?? { version: port.version, portVersion: port.portVersion };

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <button
        onClick={handleBack}
        className="flex items-center gap-1 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      <HistoricalBanner port={port} />

      <section className="mb-8 border-b border-[var(--color-border)] pb-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 max-w-4xl">
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold">{port.name}</h1>
              {port.view !== "historical" ? <MaintenanceScorePopover maintenance={port.maintenance} variant="named" /> : null}
              {port.view !== "historical" && port.packagingRisk ? (
                <PackagingRiskPopover packagingRisk={port.packagingRisk} variant="named" />
              ) : null}
            </div>
            {port.displayName ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-[var(--color-text-secondary)]">
                <span>{port.displayName}</span>
              </div>
            ) : null}
            {port.description ? (
              <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--color-text-secondary)]">
                {port.description}
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-wrap gap-2 xl:justify-end">
            {port.upstream?.url ? (
              <a
                href={port.upstream.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] transition-colors hover:border-[var(--color-border-strong)]"
              >
                Repository
                <ExternalLink className="h-4 w-4" />
              </a>
            ) : null}
            {port.homepage ? (
              <a
                href={port.homepage}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] transition-colors hover:border-[var(--color-border-strong)]"
              >
                Homepage
                <ExternalLink className="h-4 w-4" />
              </a>
            ) : null}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2.5 text-sm text-[var(--color-text-secondary)]">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">Version</span>
            <span className="font-mono text-[var(--color-text)]">{formatVersionReference(port.version, port.portVersion)}</span>
          </span>
          {port.license ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5">
              <Scale className="w-4 h-4" />
              {port.license}
            </span>
          ) : null}
          {port.upstream?.stars !== undefined ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5">
              <Star className="w-4 h-4" />
              {port.upstream.stars.toLocaleString()}
            </span>
          ) : null}
          {port.upstream?.latestReleaseTag ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">Release</span>
              {port.upstream.latestReleaseUrl ? (
                <a href={port.upstream.latestReleaseUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--color-primary)] hover:underline">
                  {port.upstream.latestReleaseTag}
                </a>
              ) : (
                port.upstream.latestReleaseTag
              )}
            </span>
          ) : null}
          {port.upstream?.latestTagName && port.upstream.latestTagName !== port.upstream.latestReleaseTag ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">Tag</span>
              {port.upstream.latestTagUrl ? (
                <a href={port.upstream.latestTagUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--color-primary)] hover:underline">
                  {port.upstream.latestTagName}
                </a>
              ) : (
                port.upstream.latestTagName
              )}
            </span>
          ) : null}
          {port.upstream?.lastCommitAt ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5">
              <CalendarDays className="w-4 h-4" />
              Last commit {formatDate(port.upstream.lastCommitAt)}
            </span>
          ) : null}
        </div>
      </section>

      <div className="flex flex-col items-start gap-6 lg:flex-row">
        <div className="flex-1 min-w-0">
          <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)]">
            <div className="border-b border-[var(--color-border)] px-4 py-3.5 sm:px-5">
              <InstallCommandBuilder portName={port.name} features={port.features} framed={false} />
            </div>

            <Tabs.Root value={activeTab} onValueChange={(value) => setTab(value as TabName)}>
              <Tabs.List className="flex overflow-x-auto border-b border-[var(--color-border)] px-2 sm:px-3">
                {tabs.map((tabItem) => (
                  <Tabs.Trigger
                    key={tabItem.value}
                    value={tabItem.value}
                    className="shrink-0 px-3 py-3 text-sm text-[var(--color-text-secondary)] border-b-2 border-transparent data-[state=active]:border-[var(--color-primary)] data-[state=active]:text-[var(--color-text)] hover:text-[var(--color-text)] transition-colors"
                  >
                    {tabItem.label}
                  </Tabs.Trigger>
                ))}
              </Tabs.List>

              <div className="px-4 py-4 sm:px-5 sm:py-5">
                <Tabs.Content value="readme" className="space-y-6 outline-none">
                  <UsageSection usage={port.usage} />
                  {readmeContent ? (
                    <MarkdownContent content={readmeContent} />
                  ) : !port.usage ? (
                    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center shadow-[var(--shadow-sm)]">
                      <FileCode className="w-5 h-5 text-[var(--color-text-secondary)] mx-auto mb-2" />
                      <p className="text-sm text-[var(--color-text-secondary)]">No documentation available</p>
                    </div>
                  ) : null}
                </Tabs.Content>

                <Tabs.Content value="versions" className="outline-none">
                  <VersionsTabContent portName={port.name} versions={port.versions} selectedVersion={selectedVersion} />
                </Tabs.Content>

                <Tabs.Content value="features" className="outline-none">
                  <FeaturesTabContent portName={port.name} features={port.features} />
                </Tabs.Content>

                <Tabs.Content value="dependencies" className="outline-none">
                  <DependenciesTabContent
                    dependencies={port.dependencies}
                    splitHostDependencies={port.view !== "historical"}
                  />
                </Tabs.Content>

                <Tabs.Content value="files" className="outline-none">
                  <FilesTabContent portName={port.name} files={port.files} allowFetch={port.view !== "historical"} />
                </Tabs.Content>

                {port.view !== "historical" ? (
                  <Tabs.Content value="upstream" className="outline-none">
                    <UpstreamTabContent
                      name={port.name}
                      portVersion={port.version}
                      vcpkgUpdatedAt={port.vcpkgUpdatedAt}
                      updatedInRegistryAt={port.updatedInRegistryAt}
                      portHomepage={port.homepage}
                    />
                  </Tabs.Content>
                ) : null}
              </div>
            </Tabs.Root>
          </div>
        </div>

        <aside className="w-full space-y-4 lg:w-72 lg:shrink-0">
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-sm)]">
            <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">
              Port info
            </div>
            <div className="space-y-3 text-sm">
              <SidebarSection>
                {port.supports ? (
                  <InfoRow label="Supports" value={<code className="text-xs">{port.supports}</code>} layout="stacked" />
                ) : null}
                <InfoRow
                  label="Port directory"
                  layout="stacked"
                  value={(
                    <a
                      href={portDirectoryGithubUrl(port.name, port.registryCommit ?? VCPKG_DEFAULT_BRANCH)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline"
                    >
                      Open on GitHub
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                />
                {sourceReference ? (
                  <InfoRow
                    label="Source reference"
                    layout="stacked"
                    value={(
                      <a
                        href={sourceReference.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex max-w-full items-center gap-1 overflow-hidden text-xs text-[var(--color-primary)] hover:underline"
                        title={sourceReference.detail}
                      >
                        <span className="truncate">{sourceReference.label}</span>
                        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                      </a>
                    )}
                  />
                ) : null}
              </SidebarSection>
              {port.view !== "historical" && (port.dependencySummary || port.patching || port.sourceProvenance || port.packagingRisk) ? (
                <SidebarSection>
                  {port.dependencySummary ? (
                    <InfoRow
                      label="Dependencies"
                      value={`${port.dependencySummary.totalCount} total, ${port.dependencySummary.hostCount} host`}
                    />
                  ) : null}
                  {port.patching ? (
                    <>
                      <InfoRow label="Patches" value={port.patching.patchCount.toLocaleString()} />
                      <InfoRow label="Patch burden" value={formatPatchBurdenLabel(port.patching.burdenLabel)} />
                    </>
                  ) : null}
                  {port.sourceProvenance ? (
                    <InfoRow
                      label="Source tracking"
                      value={(
                        <span title={port.sourceProvenance.reason}>
                          {formatSourceProvenanceLabel(port.sourceProvenance.quality)}
                        </span>
                      )}
                    />
                  ) : null}
                  {port.packagingRisk ? (
                    <InfoRow label="Packaging" value={<PackagingRiskPopover packagingRisk={port.packagingRisk} variant="compact" />} />
                  ) : null}
                </SidebarSection>
              ) : null}
              {port.view !== "historical" && port.patching && (port.patching.patchFiles.length > 0 || port.patching.unreferencedPatchFiles?.length || port.patching.missingPatchFiles?.length) ? (
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 text-xs text-[var(--color-text-secondary)]">
                  {port.patching.patchFiles.length > 0 ? (
                    <div>Patch files: {port.patching.patchFiles.map((file) => file.path).join(", ")}</div>
                  ) : null}
                  {port.patching.unreferencedPatchFiles && port.patching.unreferencedPatchFiles.length > 0 ? (
                    <div>Unreferenced patches: {port.patching.unreferencedPatchFiles.join(", ")}</div>
                  ) : null}
                  {port.patching.missingPatchFiles && port.patching.missingPatchFiles.length > 0 ? (
                    <div>Missing patches: {port.patching.missingPatchFiles.join(", ")}</div>
                  ) : null}
                </div>
              ) : null}
              <SidebarSection>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  <button onClick={() => setTab("dependencies")} className="hover:text-[var(--color-text)] transition-colors">
                    {port.dependencies.length} deps
                  </button>
                  <button onClick={() => setTab("features")} className="hover:text-[var(--color-text)] transition-colors">
                    {port.features.length} features
                  </button>
                  <button onClick={() => setTab("versions")} className="hover:text-[var(--color-text)] transition-colors">
                    {port.versions.length} versions
                  </button>
                </div>
              </SidebarSection>
            </div>
          </div>

          {port.view !== "historical" && port.upstream ? (
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-sm)]">
              <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">
                Upstream
              </div>
              <div className="space-y-2 text-sm">
                {port.upstream?.repo ? (
                  <SidebarSection>
                    <InfoRow label="Repository" value={port.upstream.repo} layout="stacked" />
                  </SidebarSection>
                ) : null}
                {(port.upstream?.stars !== undefined || port.upstream?.forks !== undefined) ? (
                  <SidebarSection>
                    {port.upstream?.stars !== undefined ? <InfoRow label="Stars" value={port.upstream.stars.toLocaleString()} /> : null}
                    {port.upstream?.forks !== undefined ? <InfoRow label="Forks" value={port.upstream.forks.toLocaleString()} /> : null}
                  </SidebarSection>
                ) : null}
                {(port.upstream?.openIssues !== undefined || port.upstream?.openPrs !== undefined || port.upstream?.mergedPrs30d !== undefined) ? (
                  <SidebarSection>
                    {port.upstream?.openIssues !== undefined ? <InfoRow label="Open issues" value={port.upstream.openIssues.toLocaleString()} /> : null}
                    {port.upstream?.openPrs !== undefined ? <InfoRow label="Open PRs" value={port.upstream.openPrs.toLocaleString()} /> : null}
                    {port.upstream?.mergedPrs30d !== undefined ? <InfoRow label="Merged in 30d" value={port.upstream.mergedPrs30d.toLocaleString()} /> : null}
                  </SidebarSection>
                ) : null}
                {(port.upstream?.latestReleaseTag || port.upstream?.latestTagName || port.upstream?.lastCommitAt) ? (
                  <SidebarSection>
                    {port.upstream?.latestReleaseTag ? (
                      <InfoRow
                        label="Latest release"
                        layout="stacked"
                        value={
                          port.upstream.latestReleaseUrl ? (
                            <a href={port.upstream.latestReleaseUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--color-primary)] hover:underline">
                              {port.upstream.latestReleaseTag}
                            </a>
                          ) : (
                            port.upstream.latestReleaseTag
                          )
                        }
                      />
                    ) : null}
                    {port.upstream?.latestTagName ? (
                      <InfoRow
                        label="Latest tag"
                        layout="stacked"
                        value={
                          port.upstream.latestTagUrl ? (
                            <a href={port.upstream.latestTagUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--color-primary)] hover:underline">
                              {port.upstream.latestTagName}
                            </a>
                          ) : (
                            port.upstream.latestTagName
                          )
                        }
                      />
                    ) : null}
                    {port.upstream?.lastCommitAt ? <InfoRow label="Last commit" value={formatDate(port.upstream.lastCommitAt) ?? "-"} layout="stacked" /> : null}
                  </SidebarSection>
                ) : null}
              </div>
            </div>
          ) : null}

          {(port.createdInRegistryAt || port.updatedInRegistryAt || port.vcpkgUpdatedAt || port.registryStats) ? (
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-sm)]">
              <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">
                Registry
              </div>
              <div className="space-y-3 text-xs">
                {port.view !== "historical" && port.registryStats?.currentVersionPublishedAt ? (
                  <div>
                    <div className="text-[var(--color-text-secondary)] mb-1">Current version in vcpkg</div>
                    <div className="text-[var(--color-text-secondary)]">
                      {formatRelativeAge(port.registryStats.currentVersionAgeDays) ?? "-"}
                    </div>
                  </div>
                ) : null}
                {port.view !== "historical" && port.registryStats?.lastChangedAt ? (
                  <div>
                    <div className="text-[var(--color-text-secondary)] mb-1">Last changed in vcpkg</div>
                    <div className="flex items-center gap-1.5 text-[var(--color-text-secondary)]">
                      <CalendarDays className="w-3.5 h-3.5 shrink-0" />
                      {formatDate(port.registryStats.lastChangedAt)}
                      {port.registryStats.lastChangedAgeDays !== undefined ? (
                        <span>({formatRelativeAge(port.registryStats.lastChangedAgeDays)})</span>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {port.vcpkgUpdatedAt ? (
                  <div>
                    <div className="text-[var(--color-text-secondary)] mb-1">vcpkg updated</div>
                    <div className="flex items-center gap-1.5 text-[var(--color-text-secondary)]">
                      <CalendarDays className="w-3.5 h-3.5 shrink-0" />
                      {formatDate(port.vcpkgUpdatedAt)}
                    </div>
                  </div>
                ) : null}
                {port.createdInRegistryAt ? (
                  <div>
                    <div className="text-[var(--color-text-secondary)] mb-1">Added to registry</div>
                    <div className="flex items-center gap-1.5 text-[var(--color-text-secondary)]">
                      <CalendarDays className="w-3.5 h-3.5 shrink-0" />
                      {formatDate(port.createdInRegistryAt)}
                    </div>
                  </div>
                ) : null}
                {port.updatedInRegistryAt ? (
                  <div>
                    <div className="text-[var(--color-text-secondary)] mb-1">Last registry update</div>
                    <div className="flex items-center gap-1.5 text-[var(--color-text-secondary)]">
                      <CalendarDays className="w-3.5 h-3.5 shrink-0" />
                      {formatDate(port.updatedInRegistryAt)}
                    </div>
                  </div>
                ) : null}
                {port.view !== "historical" && port.registryStats ? (
                  <div>
                    <div className="text-[var(--color-text-secondary)] mb-1">Churn in 90d</div>
                    <div className="text-[var(--color-text-secondary)]">
                      {port.registryStats.churn90d} change{port.registryStats.churn90d === 1 ? "" : "s"}
                    </div>
                  </div>
                ) : null}
                {port.view !== "historical" && port.registryStats?.sameVersionPortBumps ? (
                  <div>
                    <div className="text-[var(--color-text-secondary)] mb-1">Port-version bumps</div>
                    <div className="text-[var(--color-text-secondary)]">
                      {port.registryStats.sameVersionPortBumps}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
