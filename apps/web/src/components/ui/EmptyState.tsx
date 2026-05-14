import type { LucideIcon } from "lucide-react";

type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
};

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {Icon && (
        <Icon className="w-12 h-12 text-[var(--color-text-secondary)] mb-4" />
      )}
      <h3 className="text-sm font-medium text-[var(--color-text)] mb-1">
        {title}
      </h3>
      <p className="text-sm text-[var(--color-text-secondary)] max-w-sm mb-4">
        {description}
      </p>
      {action && (
        <button
          onClick={action.onClick}
          className="px-4 py-2 text-sm border border-[var(--color-border)] rounded-lg bg-[var(--color-surface)] hover:bg-[var(--color-bg)] transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
