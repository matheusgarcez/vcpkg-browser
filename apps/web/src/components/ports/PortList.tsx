import type { ReactNode } from "react";
import type { PortSummaryDto } from "@pkg/shared";
import { Star } from "lucide-react";

type PortListProps = {
  ports: PortSummaryDto[];
  loading?: boolean;
  selected?: string;
  onSelect?: (name: string) => void;
  onOpen?: (name: string) => void;
  dense?: boolean;
  showPackagingScore?: boolean;
  dateLabel?: string;
  dateField?: "updatedAt" | "createdInRegistryAt" | "updatedInRegistryAt";
  leftSlot?: (port: PortSummaryDto, index: number) => ReactNode;
};

const maintenanceTone: Record<string, string> = {
  active: "text-[var(--color-accent-green)]",
  healthy: "text-[var(--color-accent-green)]",
  moderate: "text-[var(--color-accent-yellow)]",
  stale: "text-[var(--color-accent-yellow)]",
  inactive: "text-[var(--color-accent-red)]",
  archived: "text-[var(--color-accent-red)]",
  "unknown-upstream": "text-[var(--color-text-secondary)]",
};

const packagingTone: Record<string, string> = {
  low: "text-[var(--color-accent-green)]",
  moderate: "text-[var(--color-accent-yellow)]",
  high: "text-[var(--color-accent-red)]",
  "very-high": "text-[var(--color-accent-red)]",
};

function formatPackagingScore(port: PortSummaryDto): number | null {
  if (typeof port.packagingRiskScore !== "number") return null;
  return Math.max(0, Math.min(100, 100 - port.packagingRiskScore));
}

function ScoreSummary({
  score,
  scoreTone,
  packagingScore,
  packagingToneClass,
}: {
  score?: number;
  scoreTone?: string;
  packagingScore?: number | null;
  packagingToneClass?: string;
}) {
  return (
    <div className="whitespace-nowrap text-right text-xs text-[var(--color-text-secondary)]">
      <span>(</span>
      {typeof score === "number" ? (
        <>
          <span>score: </span>
          <span className={`font-semibold ${scoreTone}`}>{score}</span>
          {typeof packagingScore === "number" ? <span> / </span> : null}
        </>
      ) : null}
      {typeof packagingScore === "number" ? (
        <>
          <span>packaging: </span>
          <span className={`font-semibold ${packagingToneClass}`}>{packagingScore}</span>
        </>
      ) : null}
      <span>)</span>
    </div>
  );
}

export function PortList({
  ports,
  loading,
  selected,
  onSelect,
  onOpen,
  dense,
  showPackagingScore = true,
  dateLabel = "Updated",
  dateField = "updatedAt",
  leftSlot,
}: PortListProps) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] animate-pulse" />
        ))}
      </div>
    );
  }

  if (ports.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-[var(--color-text-secondary)]">
        No ports found
      </div>
    );
  }

  return (
    <div className={dense ? "space-y-2" : "space-y-3"}>
      {ports.map((port, index) => {
        const packagingScore = formatPackagingScore(port);
        const visiblePackagingScore = showPackagingScore ? packagingScore : null;
        const slot = leftSlot?.(port, index);
        const showMaintenanceBadge = typeof port.maintenance.score === "number";
        const maintenanceScore = showMaintenanceBadge ? Math.round(port.maintenance.score ?? 0) : undefined;
        const maintenanceToneClass = maintenanceTone[port.maintenance.label] ?? maintenanceTone["unknown-upstream"];
        const packagingToneClass = packagingTone[port.packagingRiskLabel ?? "low"] ?? packagingTone.low;
        const itemPadding = dense ? "p-2.5" : "p-3";
        const dateValue = dateField === "updatedAt" ? port.updatedAt : port[dateField];

        return (
          <div
            key={port.name}
            className={`group rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] transition-colors hover:bg-[var(--color-surface-muted)] ${
              selected === port.name ? "border-[var(--color-primary)]" : ""
            }`}
          >
            <button
              type="button"
              onClick={() => {
                onSelect?.(port.name);
                onOpen?.(port.name);
              }}
              className={`w-full text-left ${itemPadding}`}
            >
              <div className="flex gap-3">
                {slot ? (
                  <div className="flex w-8 shrink-0 items-start justify-center border-r border-[var(--color-border)]/70 pr-3 pt-0.5">
                    <div className="text-xs font-semibold text-[var(--color-text-secondary)]">
                      {slot}
                    </div>
                  </div>
                ) : null}

                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <div className="truncate text-base font-semibold text-[var(--color-text)]">
                          {port.name}
                        </div>
                        <span className="shrink-0 text-xs text-[var(--color-text-secondary)]">
                          v{port.version}
                        </span>
                        {port.license ? (
                          <span className="min-w-0 max-w-[18rem] truncate text-xs text-[var(--color-text-secondary)] sm:max-w-[24rem]">
                            {port.license}
                          </span>
                        ) : null}
                      </div>
                      {port.upstream?.repo ? (
                        <div className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
                          {port.upstream.repo}
                        </div>
                      ) : null}
                    </div>

                    {(showMaintenanceBadge || visiblePackagingScore !== null) ? (
                      <div className="shrink-0 pt-0.5">
                        <ScoreSummary
                          score={maintenanceScore}
                          scoreTone={maintenanceToneClass}
                          packagingScore={visiblePackagingScore}
                          packagingToneClass={packagingToneClass}
                        />
                      </div>
                    ) : null}
                  </div>

                  {(port.description || port.supports) ? (
                    <div className="space-y-1">
                      {port.description ? (
                        <div className={`${dense ? "line-clamp-1" : "line-clamp-2"} text-sm text-[var(--color-text-secondary)]`}>
                          {port.description}
                        </div>
                      ) : null}
                      {port.supports ? (
                        <div
                          className="overflow-hidden text-ellipsis whitespace-nowrap text-xs text-[var(--color-text-secondary)]"
                          title={port.supports}
                        >
                          <code className="font-normal">{port.supports}</code>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-5 text-[var(--color-text-secondary)]">
                    {port.upstream?.stars !== undefined ? (
                      <span className="inline-flex items-center gap-1 font-medium text-[var(--color-text)]">
                        <Star className="h-3.5 w-3.5 text-[var(--color-accent-yellow)]" />
                        {port.upstream.stars.toLocaleString()}
                      </span>
                    ) : null}
                    {port.dependencyCount !== undefined ? (
                      <span>
                        {port.dependencyCount} deps
                        {port.hostDependencyCount && port.hostDependencyCount > 0 ? `, ${port.hostDependencyCount} host` : ""}
                      </span>
                    ) : null}
                    {port.patchCount !== undefined && port.patchCount > 0 ? (
                      <span>{port.patchCount} patches</span>
                    ) : null}
                    {port.featureCount !== undefined ? (
                      <span>{port.featureCount} features</span>
                    ) : null}
                    {dateValue ? (
                      <span>{dateLabel} {new Date(dateValue).toLocaleDateString()}</span>
                    ) : null}
                  </div>
                </div>
              </div>
            </button>
          </div>
        );
      })}
    </div>
  );
}
