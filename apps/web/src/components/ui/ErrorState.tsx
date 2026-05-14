import { AlertTriangle } from "lucide-react";

type ErrorStateProps = {
  message: string;
  onRetry?: () => void;
};

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <AlertTriangle className="w-12 h-12 text-[var(--color-accent-red)] mb-4" />
      <p className="text-sm text-[var(--color-text-secondary)] max-w-sm mb-4">
        {message}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 text-sm border border-[var(--color-border)] rounded-lg bg-[var(--color-surface)] hover:bg-[var(--color-bg)] transition-colors"
        >
          Try again
        </button>
      )}
    </div>
  );
}
