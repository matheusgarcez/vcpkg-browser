import { Link } from "react-router";

export function NotFound() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <section className="border-b border-[var(--color-border)] pb-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">
          404
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Page not found</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--color-text-secondary)]">
          The requested route does not exist, or the page failed while rendering.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            to="/"
            className="inline-flex items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm transition-colors hover:border-[var(--color-border-strong)]"
          >
            Go home
          </Link>
          <Link
            to="/ports"
            className="inline-flex items-center px-1 py-2 text-sm text-[var(--color-primary)] hover:underline"
          >
            Browse ports
          </Link>
        </div>
      </section>
    </div>
  );
}
