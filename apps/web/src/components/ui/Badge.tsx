type BadgeProps = {
  label: string;
};

const labelColors: Record<string, string> = {
  active: "border-[var(--color-accent-green)] text-[var(--color-accent-green)]",
  healthy: "border-[var(--color-accent-green)] text-[var(--color-accent-green)]",
  moderate: "border-[var(--color-accent-yellow)] text-[var(--color-accent-yellow)]",
  stale: "border-[var(--color-accent-yellow)] text-[var(--color-accent-yellow)]",
  inactive: "border-[var(--color-accent-red)] text-[var(--color-accent-red)]",
  archived: "border-[var(--color-accent-red)] text-[var(--color-accent-red)]",
  "unknown-upstream": "border-[var(--color-border)] text-[var(--color-text-secondary)]",
};

export function Badge({ label }: BadgeProps) {
  const color = labelColors[label] ?? "border-[var(--color-border)] text-[var(--color-text-secondary)]";
  return (
    <span className={`text-xs px-1.5 py-0.5 border rounded ${color}`}>
      {label}
    </span>
  );
}
