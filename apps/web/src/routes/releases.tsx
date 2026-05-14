import { VCPKG_REPO_URL } from "@pkg/shared";
import { useReleases } from "../api/queries";

export function Releases() {
  const { data, isLoading, error, refetch } = useReleases();

  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="text-center py-20">
          <h2 className="text-lg font-semibold mb-2">Failed to load releases</h2>
          <p className="text-sm text-[var(--color-text-secondary)] mb-4">
            Something went wrong while fetching release history.
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
      <h1 className="text-2xl font-semibold mb-6">vcpkg Releases</h1>

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

      {!isLoading && data && data.releases.length === 0 && (
        <div className="text-sm text-[var(--color-text-secondary)] py-8 text-center">
          No releases found
        </div>
      )}

      {data && data.releases.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--color-surface)] border-b border-[var(--color-border)]">
                <th className="text-left p-3 font-medium">Version</th>
                <th className="text-left p-3 font-medium">Date</th>
                <th className="text-left p-3 font-medium">Commit</th>
                <th className="text-right p-3 font-medium">Ports</th>
              </tr>
            </thead>
            <tbody>
              {data.releases.map((r) => (
                <tr
                  key={r.version}
                  className="border-b border-[var(--color-border)] bg-[var(--color-surface)] last:border-0"
                >
                  <td className="p-3 font-semibold">{r.version}</td>
                  <td className="p-3 text-[var(--color-text-secondary)]">
                    {new Date(r.publishedAt).toLocaleDateString()}
                  </td>
                  <td className="p-3 font-mono text-xs">
                    <a
                      href={`${VCPKG_REPO_URL}/commit/${r.commitSha}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--color-primary)] hover:underline"
                    >
                      {r.commitSha.slice(0, 12)}
                    </a>
                  </td>
                  <td className="p-3 text-right">{r.portsCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
