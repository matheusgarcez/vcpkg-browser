import type { PortSummaryDto } from "@pkg/shared";
import { Badge } from "../ui/Badge";
import { usePortDetail } from "../../api/queries";
import { AlertTriangle, ArrowUpRight, ExternalLink, GitFork, Scale, Sparkles, Star } from "lucide-react";
import { Link } from "react-router";
import { MaintenanceScorePopover } from "./MaintenanceScorePopover";
import { CodeBlock } from "../ui/CodeBlock";
import { InstallCommandBuilder } from "./InstallCommandBuilder";

type PortPreviewProps = {
  port: PortSummaryDto;
};

export function PortPreview({ port }: PortPreviewProps) {
  const { data: detail, isLoading, error } = usePortDetail(port.name);
  const upstream = detail?.upstream;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-lg font-semibold">{port.name}</h3>
            {detail ? (
              <MaintenanceScorePopover maintenance={detail.maintenance} variant="named" />
            ) : (
              <Badge label={port.maintenance.label} />
            )}
          </div>
          <div className="text-sm text-[var(--color-text-secondary)]">{detail?.version ?? port.version}</div>
          {detail?.description ?? port.description ? (
            <p className="mt-2 text-sm text-[var(--color-text-secondary)] line-clamp-3">
              {detail?.description ?? port.description}
            </p>
          ) : null}
        </div>
        <Link
          to={`/ports/${encodeURIComponent(port.name)}`}
          className="shrink-0 inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors"
        >
          Open page
          <ArrowUpRight className="w-4 h-4" />
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-3 animate-pulse">
          <div className="h-20 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)]" />
          <div className="h-28 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)]" />
        </div>
      ) : error || !detail ? (
        <div className="border border-[var(--color-border)] rounded-lg p-4 text-sm text-[var(--color-text-secondary)] bg-[var(--color-surface)]">
          <div className="inline-flex items-center gap-2 mb-2 text-[var(--color-text)]">
            <AlertTriangle className="w-4 h-4" />
            Failed to load live detail preview
          </div>
          Use the details button to open the full page.
        </div>
      ) : (
        <div className="space-y-4">
          <section className="space-y-2">
            <InstallCommandBuilder portName={detail.name} features={detail.features} compact />
          </section>

          <section className="border-t border-[var(--color-border)] pt-4">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-8 gap-y-4">
              <div className="space-y-3 text-sm">
                <div className="text-xs text-[var(--color-text-secondary)]">Package</div>
                {detail.license ? (
                  <div className="flex items-center gap-2 text-[var(--color-text-secondary)]">
                    <Scale className="w-4 h-4" />
                    <span>{detail.license}</span>
                  </div>
                ) : null}
                {detail.supports ? (
                  <div>
                    <div className="text-xs text-[var(--color-text-secondary)] mb-1">Supports</div>
                    <code className="text-xs">{detail.supports}</code>
                  </div>
                ) : null}
                {detail.versionsPath ? (
                  <div>
                    <div className="text-xs text-[var(--color-text-secondary)] mb-1">Versions path</div>
                    <code className="text-xs break-all">{detail.versionsPath}</code>
                  </div>
                ) : null}
                <div className="flex gap-4 text-xs text-[var(--color-text-secondary)] pt-1">
                  <span>{detail.dependencies.length} deps</span>
                  <span>{detail.features.length} features</span>
                  <span>{detail.versions.length} versions</span>
                </div>
              </div>

              <div className="space-y-3 text-sm">
                <div className="text-xs text-[var(--color-text-secondary)]">Upstream</div>
                {upstream ? (
                  <>
                    <div className="flex flex-wrap gap-3 text-[var(--color-text-secondary)]">
                      {upstream.stars !== undefined ? (
                        <span className="inline-flex items-center gap-1"><Star className="w-4 h-4" />{upstream.stars}</span>
                      ) : null}
                      {upstream.forks !== undefined ? (
                        <span className="inline-flex items-center gap-1"><GitFork className="w-4 h-4" />{upstream.forks}</span>
                      ) : null}
                      {upstream.openIssues !== undefined ? <span>{upstream.openIssues} open issues</span> : null}
                      {upstream.openPrs !== undefined ? <span>{upstream.openPrs} open PRs</span> : null}
                    </div>
                    {upstream.url ? (
                      <a
                        href={upstream.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[var(--color-primary)] hover:underline"
                      >
                        Repository
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    ) : null}
                    {upstream.lastCommitAt ? (
                      <div className="text-xs text-[var(--color-text-secondary)]">
                        Last commit: {new Date(upstream.lastCommitAt).toLocaleString()}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="text-sm text-[var(--color-text-secondary)]">No upstream metadata available.</div>
                )}
              </div>
            </div>
          </section>

          {upstream?.readmeSummary ? (
            <section className="border-t border-[var(--color-border)] pt-4">
              <div className="text-xs text-[var(--color-text-secondary)] mb-2 inline-flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                Summary
              </div>
              <p className="text-sm text-[var(--color-text-secondary)] line-clamp-6 whitespace-pre-line">
                {upstream.readmeSummary}
              </p>
            </section>
          ) : null}

          {detail.usage ? (
            <section className="border-t border-[var(--color-border)] pt-4 space-y-2">
              <div className="text-xs text-[var(--color-text-secondary)]">Usage</div>
              <CodeBlock code={detail.usage} language="cmake" maxHeight="180px" />
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
