import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useRecentlyUpdatedPorts } from "../api/queries";
import { PortList } from "../components/ports/PortList";

const PAGE_SIZE = 30;

export function RecentlyUpdated() {
  const location = useLocation();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const { data, isLoading, error, refetch } = useRecentlyUpdatedPorts({
    page: String(page),
    pageSize: String(PAGE_SIZE),
  });

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 0;

  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="text-center py-20">
          <h2 className="text-lg font-semibold mb-2">Failed to load ports</h2>
          <p className="text-sm text-[var(--color-text-secondary)] mb-4">
            Something went wrong while fetching recently updated ports.
          </p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 text-sm border border-[var(--color-border)] rounded hover:bg-[var(--color-surface)] transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-semibold mb-6">Recently Updated Ports</h1>

      <PortList
        ports={data?.items ?? []}
        loading={isLoading}
        dateLabel="Updated"
        dateField="updatedInRegistryAt"
        onSelect={(name) => navigate(`/ports/${encodeURIComponent(name)}`, {
          state: {
            backTo: {
              pathname: location.pathname,
              search: location.search,
            },
          },
        })}
      />

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1 text-sm border border-[var(--color-border)] rounded disabled:opacity-50"
          >
            Prev
          </button>
          <span className="text-sm text-[var(--color-text-secondary)]">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1 text-sm border border-[var(--color-border)] rounded disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
