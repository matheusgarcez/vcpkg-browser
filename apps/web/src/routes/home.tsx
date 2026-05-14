import { Link, useLocation, useNavigate } from "react-router";
import type { PortSummaryDto } from "@pkg/shared";
import { VCPKG_REPO_URL } from "@pkg/shared";
import {
  useMeta,
  usePopularPorts,
  useRecentlyAddedPorts,
  useRecentlyUpdatedPorts,
  useTriplets,
} from "../api/queries";
import { PortList } from "../components/ports/PortList";

const QUERY_EXAMPLES = [
  "supports:x64-windows",
  "repository:github stars:>5000",
  "license:mit",
  "feature:tools",
  "maintained:active",
  "updated:>2025-01-01",
];

function formatShortDate(value?: string) {
  if (!value) return null;
  return new Date(value).toLocaleDateString();
}

function filterHref(query: string) {
  return `/ports?q=${encodeURIComponent(query)}`;
}

export function Home() {
  const location = useLocation();
  const navigate = useNavigate();
  const meta = useMeta();
  const triplets = useTriplets();
  const recentlyAdded = useRecentlyAddedPorts({ pageSize: "6" });
  const recentlyUpdated = useRecentlyUpdatedPorts({ pageSize: "6" });
  const popular = usePopularPorts({ pageSize: "6" });

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <section className="border-b border-[var(--color-border)] pb-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_18rem] lg:items-start">
          <div className="min-w-0">
            <h1 className="mt-4 text-3xl font-semibold tracking-tight">
              Search the vcpkg port registry
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--color-text-secondary)]">
              Inspect supports, features, dependencies, versions, upstream repositories, and vcpkg update history.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              {QUERY_EXAMPLES.map((query) => (
                <button
                  key={query}
                  type="button"
                  onClick={() => navigate(filterHref(query))}
                  className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-mono text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]"
                >
                  {query}
                </button>
              ))}
            </div>
          </div>

          <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-sm)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">
              Registry
            </div>
            <div className="mt-3 divide-y divide-[var(--color-border)]">
              <RegistryFact label="Ports" value={meta.data?.portsCount ?? "..."} />
              <RegistryFact label="Features" value={meta.data?.featuresCount ?? "..."} />
              {meta.data?.latestRelease ? (
                <RegistryFact
                  label="Latest release"
                  value={meta.data.latestRelease.version}
                  detail={formatShortDate(meta.data.latestRelease.publishedAt)}
                  href="/releases"
                />
              ) : null}
              <RegistryFact
                label="Registry commit"
                value={meta.data?.registryCommit?.slice(0, 8) ?? "..."}
                mono
                href={meta.data?.registryCommit ? `${VCPKG_REPO_URL}/commit/${meta.data.registryCommit}` : undefined}
                external={!!meta.data?.registryCommit}
              />
            </div>
          </section>
        </div>
      </section>

      <section className="mt-8">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Browse collections</h2>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              Curated lists of ports to explore and discover new libraries.
            </p>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-3">
          <HomePortSection
            title="Popular"
            to="/ports/popular"
            loading={popular.isLoading}
            ports={popular.data?.items ?? []}
            onSelect={(name) => navigate(`/ports/${encodeURIComponent(name)}`, {
              state: {
                backTo: {
                  pathname: location.pathname,
                  search: location.search,
                },
              },
            })}
          />
          <HomePortSection
            title="Recently added"
            to="/ports/recently-added"
            loading={recentlyAdded.isLoading}
            ports={recentlyAdded.data?.items ?? []}
            onSelect={(name) => navigate(`/ports/${encodeURIComponent(name)}`, {
              state: {
                backTo: {
                  pathname: location.pathname,
                  search: location.search,
                },
              },
            })}
          />
          <HomePortSection
            title="Recently updated"
            to="/ports/recently-updated"
            loading={recentlyUpdated.isLoading}
            ports={recentlyUpdated.data?.items ?? []}
            onSelect={(name) => navigate(`/ports/${encodeURIComponent(name)}`, {
              state: {
                backTo: {
                  pathname: location.pathname,
                  search: location.search,
                },
              },
            })}
          />
        </div>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
        <div>
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Browse by triplet</h2>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                Clicking a platform applies the existing `supports:` search filter.
              </p>
            </div>
            <Link to="/triplets" className="text-sm text-[var(--color-primary)] hover:underline">
              View all
            </Link>
          </div>

          <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="p-3 text-left font-medium">Triplet</th>
                  <th className="p-3 text-right font-medium">Ports</th>
                </tr>
              </thead>
              <tbody>
                {(triplets.data?.triplets ?? []).slice(0, 10).map((triplet) => (
                  <tr
                    key={triplet.triplet}
                    onClick={() => navigate(filterHref(`supports:${triplet.triplet}`))}
                    className="cursor-pointer border-b border-[var(--color-border)] last:border-b-0 transition-colors hover:bg-[var(--color-surface-muted)]"
                  >
                    <td className="p-3 font-mono">{triplet.triplet}</td>
                    <td className="p-3 text-right text-[var(--color-text-secondary)]">{triplet.ports}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div className="mb-4">
            <h2 className="text-lg font-semibold">How to search</h2>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              Use plain text for names and descriptions, then narrow with operators.
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)]">
            <div className="divide-y divide-[var(--color-border)]">
              <SearchPattern
                label="Platform support"
                query="supports:x64-linux"
                onSelect={(query) => navigate(filterHref(query))}
              />
              <SearchPattern
                label="Upstream source"
                query="repository:github"
                onSelect={(query) => navigate(filterHref(query))}
              />
              <SearchPattern
                label="Features"
                query="feature:ssl"
                onSelect={(query) => navigate(filterHref(query))}
              />
              <SearchPattern
                label="Dependencies"
                query="dependency:openssl"
                onSelect={(query) => navigate(filterHref(query))}
              />
              <SearchPattern
                label="Maintenance"
                query="maintained:active"
                onSelect={(query) => navigate(filterHref(query))}
              />
              <SearchPattern
                label="Recent changes"
                query="updated:>2025-01-01"
                onSelect={(query) => navigate(filterHref(query))}
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function RegistryFact({
  label,
  value,
  detail,
  mono = false,
  href,
  external = false,
}: {
  label: string;
  value: string | number;
  detail?: string | null;
  mono?: boolean;
  href?: string;
  external?: boolean;
}) {
  const content = (
    <>
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        {detail ? <div className="mt-0.5 text-xs text-[var(--color-text-secondary)]">{detail}</div> : null}
      </div>
      <div className={mono ? "shrink-0 font-mono text-sm" : "shrink-0 text-sm font-medium"}>
        {value}
      </div>
    </>
  );

  if (href) {
    const commonClassName = "flex items-center justify-between gap-4 py-3 transition-colors hover:text-[var(--color-primary)]";
    return external ? (
      <a href={href} target="_blank" rel="noopener noreferrer" className={commonClassName}>
        {content}
      </a>
    ) : (
      <Link to={href} className={commonClassName}>
        {content}
      </Link>
    );
  }

  return (
    <div className="flex items-center justify-between gap-4 py-3">
      {content}
    </div>
  );
}

function HomePortSection({
  title,
  to,
  ports,
  loading,
  onSelect,
}: {
  title: string;
  to: string;
  ports: PortSummaryDto[];
  loading?: boolean;
  onSelect: (name: string) => void;
}) {
  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <Link to={to} className="text-sm text-[var(--color-primary)] hover:underline">
          View all
        </Link>
      </div>

      <PortList ports={ports} loading={loading} onSelect={onSelect} dense showPackagingScore={false} />
    </section>
  );
}

function SearchPattern({
  label,
  query,
  onSelect,
}: {
  label: string;
  query: string;
  onSelect: (query: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(query)}
      className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-[var(--color-surface-muted)]"
    >
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
      </div>
      <code className="shrink-0 text-xs text-[var(--color-text-secondary)]">{query}</code>
    </button>
  );
}
