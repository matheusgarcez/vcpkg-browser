import { useEffect, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import type { PackagingRiskDto } from "@pkg/shared";
import { Info } from "lucide-react";

const triggerBorderColors: Record<string, string> = {
  low: "border-[var(--color-accent-green)]",
  moderate: "border-[var(--color-accent-yellow)]",
  high: "border-[var(--color-accent-red)]",
  "very-high": "border-[var(--color-accent-red)]",
};

type PackagingRiskPopoverProps = {
  packagingRisk: PackagingRiskDto;
  variant?: "named" | "compact";
};

export function PackagingRiskPopover({ packagingRisk, variant = "named" }: PackagingRiskPopoverProps) {
  const named = variant === "named";
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<number | null>(null);
  const borderColor = triggerBorderColors[packagingRisk.label] ?? "border-[var(--color-border)]";
  const packagingScore = Math.max(0, Math.min(100, 100 - packagingRisk.score));
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
      aria-label="Explain packaging score"
    >
      <span>Packaging</span>
      <span className="text-[var(--color-text)]">{packagingScore}/100</span>
      <Info className="h-3.5 w-3.5" />
    </button>
  ) : (
    <div className="inline-flex items-center gap-2">
      <span className="text-sm font-medium text-[var(--color-text)]">{packagingScore}/100</span>
      <button
        type="button"
        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] transition-[background-color,border-color,color,box-shadow] hover:border-[var(--color-primary)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:bg-[var(--color-surface-muted)] focus-visible:text-[var(--color-text)] focus-visible:shadow-[var(--shadow-sm)] active:bg-[var(--color-surface-muted)]"
        aria-label="Explain packaging score"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
    </div>
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
                <div className="text-sm font-semibold">Packaging score</div>
                <div className="mt-1 text-xs text-[var(--color-text-secondary)]">
                  {packagingScore}/100 packaging score
                </div>
              </div>

              {packagingRisk.components.length > 0 ? (
                <div className="space-y-2 border-t border-[var(--color-border)] pt-3">
                  <div className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">
                    Risk breakdown
                  </div>
                  <ul className="space-y-2">
                    {packagingRisk.components.map((component) => {
                      const width = component.max > 0
                        ? `${Math.max(0, Math.min(100, (component.points / component.max) * 100))}%`
                        : "0%";

                      return (
                        <li key={component.key} className="space-y-1">
                          <div className="flex items-center justify-between gap-3 text-xs text-[var(--color-text-secondary)]">
                            <span>{component.label}</span>
                            <span>{component.points}/{component.max}</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-border)]/60">
                            <div className="h-full rounded-full bg-[var(--color-accent-yellow)]" style={{ width }} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}

              {packagingRisk.reasons.length > 0 ? (
                <ul className="space-y-2">
                  {packagingRisk.reasons.map((reason) => (
                    <li key={reason} className="text-sm leading-5 text-[var(--color-text-secondary)]">
                      {reason}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm leading-5 text-[var(--color-text-secondary)]">
                  No detailed packaging explanation is stored for this port yet.
                </p>
              )}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </div>
    </Popover.Root>
  );
}
