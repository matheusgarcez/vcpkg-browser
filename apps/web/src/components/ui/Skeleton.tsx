type SkeletonProps = {
  width?: string;
  height?: string;
  className?: string;
};

export function Skeleton({ width, height = "1rem", className }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-[var(--color-border)] rounded ${className ?? ""}`}
      style={{ width, height }}
    />
  );
}
