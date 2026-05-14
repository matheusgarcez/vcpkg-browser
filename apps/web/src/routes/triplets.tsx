import { useState } from "react";
import { useNavigate } from "react-router";
import { useTriplets } from "../api/queries";

type SortField = "triplet" | "ports";
type SortDir = "asc" | "desc";

export function Triplets() {
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useTriplets();
  const [sortField, setSortField] = useState<SortField>("ports");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const triplets = data?.triplets ?? [];

  const sorted = [...triplets].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortField === "ports") return (a.ports - b.ports) * dir;
    return a.triplet.localeCompare(b.triplet) * dir;
  });

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  function sortIndicator(field: SortField) {
    if (sortField !== field) return null;
    return sortDir === "asc" ? " ▲" : " ▼";
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="text-center py-20">
          <h2 className="text-lg font-semibold mb-2">Failed to load triplets</h2>
          <p className="text-sm text-[var(--color-text-secondary)] mb-4">
            Something went wrong while fetching triplets data.
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
      <h1 className="text-2xl font-semibold mb-6">Platform Triplets</h1>

      {isLoading && (
        <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] animate-pulse shadow-[var(--shadow-sm)]">
          <div className="bg-[var(--color-surface)] border-b border-[var(--color-border)] p-3">
            <div className="h-4 w-full bg-[var(--color-border)] rounded" />
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="border-b border-[var(--color-border)] bg-[var(--color-surface)] last:border-0 p-3">
              <div className="h-4 w-full bg-[var(--color-border)] rounded" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && triplets.length === 0 && (
        <div className="text-sm text-[var(--color-text-secondary)] py-8 text-center">
          No triplets available
        </div>
      )}

      {!isLoading && triplets.length > 0 && (
        <>
          <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--color-surface)] border-b border-[var(--color-border)]">
                  <th
                    className="text-left p-3 font-medium cursor-pointer hover:opacity-80 select-none"
                    onClick={() => handleSort("triplet")}
                  >
                    Platform{sortIndicator("triplet")}
                  </th>
                  <th
                    className="text-right p-3 font-medium cursor-pointer hover:opacity-80 select-none"
                    onClick={() => handleSort("ports")}
                  >
                    Supported Ports{sortIndicator("ports")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((t) => (
                  <tr
                    key={t.triplet}
                    onClick={() =>
                      navigate(`/ports?q=${encodeURIComponent(`supports:${t.triplet}`)}`)
                    }
                    className="border-b border-[var(--color-border)] bg-[var(--color-surface)] last:border-0 cursor-pointer transition-colors hover:bg-[var(--color-surface-muted)]"
                  >
                    <td className="p-3 font-mono text-sm">{t.triplet}</td>
                    <td className="p-3 text-right">{t.ports}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
