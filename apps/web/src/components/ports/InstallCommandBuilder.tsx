import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Popover from "@radix-ui/react-popover";
import type { FeatureDto } from "@pkg/shared";
import { RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { CopyButton } from "../ui/CopyButton";

type InstallCommandBuilderProps = {
  portName: string;
  features: FeatureDto[];
  compact?: boolean;
  framed?: boolean;
};

function pluralize(count: number, noun: string): string {
  return count === 1 ? noun : `${noun}s`;
}

function buildInstallCommand(portName: string, selectedFeatures: string[], disableDefaultFeatures: boolean): string {
  const requestedFeatures = disableDefaultFeatures ? ["core", ...selectedFeatures] : selectedFeatures;
  if (requestedFeatures.length === 0) {
    return `vcpkg install ${portName}`;
  }

  return `vcpkg install ${portName}[${requestedFeatures.join(",")}]`;
}

function describeSelection(features: FeatureDto[], selectedCount: number, disableDefaultFeatures: boolean): string {
  if (features.length === 0) {
    return "No install-time feature flags are exposed for this port.";
  }

  const defaultFeatureCount = features.filter((feature) => feature.defaultFeature).length;

  if (disableDefaultFeatures) {
    if (selectedCount === 0) {
      return "Core only. Default features are excluded.";
    }

    return `${selectedCount} ${pluralize(selectedCount, "feature")} selected. Default features are excluded.`;
  }

  if (selectedCount === 0) {
    if (defaultFeatureCount > 0) {
      return `${defaultFeatureCount} default ${pluralize(defaultFeatureCount, "feature")} install automatically.`;
    }

    return "Default install, no extra features selected.";
  }

  if (defaultFeatureCount > 0) {
    return `${selectedCount} extra ${pluralize(selectedCount, "feature")} selected. Default features still install.`;
  }

  return `${selectedCount} ${pluralize(selectedCount, "feature")} selected.`;
}

export function InstallCommandBuilder({
  portName,
  features,
  compact = false,
  framed = true,
}: InstallCommandBuilderProps) {
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [disableDefaultFeatures, setDisableDefaultFeatures] = useState(false);
  const [isSmallViewport, setIsSmallViewport] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const installCommand = buildInstallCommand(portName, selectedFeatures, disableDefaultFeatures);
  const selectionDescription = describeSelection(features, selectedFeatures.length, disableDefaultFeatures);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const updateViewport = () => setIsSmallViewport(mediaQuery.matches);

    updateViewport();
    mediaQuery.addEventListener("change", updateViewport);
    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, []);

  function toggleFeature(featureName: string) {
    setSelectedFeatures((current) =>
      current.includes(featureName)
        ? current.filter((name) => name !== featureName)
        : [...current, featureName],
    );
  }

  function resetSelection() {
    setSelectedFeatures([]);
    setDisableDefaultFeatures(false);
  }

  const triggerLabel = selectedFeatures.length > 0 || disableDefaultFeatures ? "Customize" : "Features";
  const triggerButton = (
    <button
      type="button"
      className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-xs font-medium text-[var(--color-text)] transition-colors hover:border-[var(--color-border-strong)]"
    >
      <SlidersHorizontal className="h-3.5 w-3.5" />
      {triggerLabel}
    </button>
  );

  const pickerPanel = (
    <div className="space-y-2.5">
      <div>
        <div className="text-sm font-semibold text-[var(--color-text)]">Customize install</div>
        <p className="mt-1 text-xs leading-4 text-[var(--color-text-secondary)]">
          Add feature flags inline. Use <code>core</code> when you want to exclude the port&apos;s default features.
        </p>
      </div>

      <label className="flex gap-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-2.5">
        <input
          type="checkbox"
          checked={disableDefaultFeatures}
          onChange={(event) => setDisableDefaultFeatures(event.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]"
        />
        <div className="min-w-0">
          <div className="text-sm font-medium text-[var(--color-text)]">Core only</div>
          <p className="mt-1 text-xs leading-4 text-[var(--color-text-secondary)]">
            Generates <code>{portName}[core]</code> and lets you add back only the features you want.
          </p>
        </div>
      </label>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">
            Features
          </div>
          <div className="text-xs text-[var(--color-text-secondary)]">
            {selectedFeatures.length} selected
          </div>
        </div>

        <div className="max-h-[min(34vh,11rem)] space-y-1.5 overflow-y-auto pr-1 sm:max-h-[min(38vh,13rem)]">
          {features.map((feature) => {
            const checked = selectedFeatures.includes(feature.name);

            return (
              <label
                key={feature.name}
                className="flex gap-2.5 rounded-lg border border-[var(--color-border)] px-2.5 py-2 transition-colors hover:border-[var(--color-border-strong)]"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleFeature(feature.name)}
                  className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-[var(--color-text)]">{feature.name}</span>
                    {feature.defaultFeature ? (
                      <span className="rounded-full border border-[var(--color-accent-green)] bg-[var(--color-surface-muted)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-accent-green)]">
                        default
                      </span>
                    ) : null}
                  </div>

                  {feature.description ? (
                    <p className="mt-1 text-xs leading-4 text-[var(--color-text-secondary)]">
                      {feature.description}
                    </p>
                  ) : null}

                  {feature.supports ? (
                    <code className="mt-2 inline-flex rounded-md border border-[var(--color-border)] bg-[var(--color-code-bg)] px-2 py-1 text-[11px] text-[var(--color-text-secondary)]">
                      {feature.supports}
                    </code>
                  ) : null}
                </div>
              </label>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border)] pt-2.5">
        <button
          type="button"
          onClick={resetSelection}
          className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text)]"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </button>

        <div className="text-xs text-[var(--color-text-secondary)]">
          Updates the command preview live.
        </div>
      </div>
    </div>
  );

  return (
    <section
      className={
        framed
          ? `rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)] ${
              compact ? "p-3" : "p-4"
            }`
          : compact
            ? "p-0"
            : "p-0"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">
            Install command
          </div>
        </div>

        {features.length > 0 ? (
          isSmallViewport ? (
            <Dialog.Root open={pickerOpen} onOpenChange={setPickerOpen}>
              <Dialog.Trigger asChild>
                {triggerButton}
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70" />
                <Dialog.Content className="fixed inset-x-2 bottom-2 top-2 z-50 overflow-y-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-[var(--shadow-lg)]">
                  <div className="mb-3 flex items-center justify-between gap-3 border-b border-[var(--color-border)] pb-3">
                    <div className="text-sm font-semibold text-[var(--color-text)]">Feature selection</div>
                    <Dialog.Close asChild>
                      <button
                        type="button"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] text-[var(--color-text-secondary)]"
                        aria-label="Close feature picker"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </Dialog.Close>
                  </div>
                  {pickerPanel}
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          ) : (
            <Popover.Root open={pickerOpen} onOpenChange={setPickerOpen}>
              <Popover.Trigger asChild>
                {triggerButton}
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  side="bottom"
                  sideOffset={6}
                  align="end"
                  avoidCollisions={false}
                  collisionPadding={8}
                  className="z-50 max-h-[min(72vh,30rem)] w-[min(20rem,calc(100vw-1rem))] overflow-y-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5 shadow-[var(--shadow-lg)]"
                >
                  {pickerPanel}
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          )
        ) : null}
      </div>

      <div className="relative mt-3">
        <input
          readOnly
          value={installCommand}
          onFocus={(event) => event.currentTarget.select()}
          onClick={(event) => event.currentTarget.select()}
          aria-label="vcpkg install command"
          className={`${compact ? "text-xs" : "text-sm"} w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-code-bg)] py-3 pl-3 pr-14 font-mono text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-border-strong)]`}
        />
        <CopyButton
          text={installCommand}
          className="absolute right-2 top-1/2 -translate-y-1/2 border border-[var(--color-border)] bg-[var(--color-surface-muted)]"
        />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="min-w-0 text-xs leading-5 text-[var(--color-text-secondary)]">{selectionDescription}</p>
      </div>
    </section>
  );
}
