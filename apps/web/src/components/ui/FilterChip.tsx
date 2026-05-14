import { X } from "lucide-react";

type FilterChipProps = {
  label: string;
  onRemove?: () => void;
};

export function FilterChip({ label, onRemove }: FilterChipProps) {
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-1 border border-[var(--color-border)] rounded bg-[var(--color-surface)] text-[var(--color-text)]">
      {label}
      {onRemove && (
        <button
          onClick={onRemove}
          className="p-0.5 rounded hover:bg-[var(--color-bg)] transition-colors"
          title="Remove filter"
        >
          <X className="w-3 h-3 text-[var(--color-text-secondary)]" />
        </button>
      )}
    </span>
  );
}
