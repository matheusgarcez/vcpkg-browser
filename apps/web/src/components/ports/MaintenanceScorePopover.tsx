import { useEffect, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import type { MaintenanceDto } from "@pkg/shared";
import { Info } from "lucide-react";
import { Link } from "react-router";
import { Badge } from "../ui/Badge";

const triggerBorderColors: Record<string, string> = {
  active: "border-[var(--color-accent-green)]",
  healthy: "border-[var(--color-accent-green)]",
  moderate: "border-[var(--color-accent-yellow)]",
  stale: "border-[var(--color-accent-yellow)]",
  inactive: "border-[var(--color-accent-red)]",
  archived: "border-[var(--color-accent-red)]",
};

type MaintenanceScorePopoverProps = {
  maintenance: MaintenanceDto;
  variant?: "named" | "compact";
};

export function MaintenanceScorePopover({ maintenance, variant = "named" }: MaintenanceScorePopoverProps) {
  const reasons = maintenance.reasons ?? [];
  const components = maintenance.components ?? [];
  const named = variant === "named";
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<number | null>(null);
  const borderColor = triggerBorderColors[maintenance.label] ?? "border-[var(--color-border)]";
  const namedStateClasses = open
    ? "bg-[var(--color-surface-muted)] text-[var(--color-text)] shadow-[var(--shadow-sm)]"
    : "bg-[var(--color-surface)] text-[var(--color-text-secondary)]";

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  function clearCloseTimer() {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  function openPopover() {
    clearCloseTimer();
    setOpen(true);
  }

  function scheduleClose() {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      closeTimerRef.current = null;
    }, 140);
  }

  const trigger = named ? (
    <button
      type="button"
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-[background-color,color,box-shadow] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:bg-[var(--color-surface-muted)] focus-visible:text-[var(--color-text)] focus-visible:shadow-[var(--shadow-sm)] active:bg-[var(--color-surface-muted)] ${borderColor} ${namedStateClasses}`}
      aria-label="Explain maintenance score"
    >
      <span>Score</span>
      {typeof maintenance.score === "number" ? (
        <span className="text-[var(--color-text)]">{maintenance.score}/100</span>
      ) : null}
      <Info className="h-3.5 w-3.5" />
    </button>
  ) : (
    <button
      type="button"
      className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] transition-[background-color,border-color,color,box-shadow] hover:border-[var(--color-primary)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:bg-[var(--color-surface-muted)] focus-visible:text-[var(--color-text)] focus-visible:shadow-[var(--shadow-sm)] active:bg-[var(--color-surface-muted)]"
      aria-label="Explain maintenance score"
    >
      <Info className="w-3.5 h-3.5" />
    </button>
  );

  return (
    <Popover.Root
      open={open}
      onOpenChange={(nextOpen) => {
        clearCloseTimer();
        setOpen(nextOpen);
      }}
    >
      <div
        className={named ? "inline-flex items-center" : "inline-flex items-center gap-2"}
        onMouseEnter={openPopover}
        onMouseLeave={scheduleClose}
      >
        {named ? null : <Badge label={maintenance.label} />}
        {!named && typeof maintenance.score === "number" ? (
          <span className="text-sm font-medium text-[var(--color-text)]">{maintenance.score}/100</span>
        ) : null}
        <Popover.Trigger asChild>
          {trigger}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            sideOffset={8}
            align="start"
            className="z-50 w-[22rem] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-lg)]"
            onMouseEnter={openPopover}
            onMouseLeave={scheduleClose}
          >
            <div className="space-y-3">
              <div>
                <div className="text-sm font-semibold">Maintenance score</div>
                <div className="text-xs text-[var(--color-text-secondary)] mt-1">
                  {typeof maintenance.score === "number"
                    ? `${maintenance.score}/100 · ${maintenance.label}`
                    : maintenance.label}
                </div>
                {typeof maintenance.confidence === "number" ? (
                  <div className="text-xs text-[var(--color-text-secondary)] mt-1">
                    Confidence {maintenance.confidence}%
                  </div>
                ) : null}
              </div>

              {components.length > 0 ? (
                <div className="space-y-2 border-t border-[var(--color-border)] pt-3">
                  <div className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">
                    Score breakdown
                  </div>
                  <ul className="space-y-2">
                    {components.map((component) => {
                      const width = component.available && component.max > 0
                        ? `${Math.max(0, Math.min(100, (component.points / component.max) * 100))}%`
                        : "0%";
                      const points = Number.isInteger(component.points)
                        ? component.points.toFixed(0)
                        : component.points.toFixed(1);

                      return (
                        <li key={component.key} className="space-y-1">
                          <div className="flex items-center justify-between gap-3 text-xs text-[var(--color-text-secondary)]">
                            <span>{component.label}</span>
                            <span>{component.available ? `${points}/${component.max}` : "No data"}</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-border)]/60">
                            <div
                              className="h-full rounded-full bg-[var(--color-primary)]"
                              style={{ width }}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}

              {reasons.length > 0 ? (
                <ul className="space-y-2">
                  {reasons.map((reason) => (
                    <li key={reason} className="text-sm text-[var(--color-text-secondary)] leading-5">
                      {reason}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[var(--color-text-secondary)] leading-5">
                  No detailed score explanation is stored for this port yet.
                </p>
              )}

              <div className="border-t border-[var(--color-border)] pt-3">
                <Link to="/about/data" className="text-sm text-[var(--color-primary)] hover:underline">
                  Read the scoring methodology
                </Link>
              </div>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </div>
    </Popover.Root>
  );
}
