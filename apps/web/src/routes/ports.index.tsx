import { useMemo } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { X, Search, AlertTriangle } from "lucide-react";
import { usePorts } from "../api/queries";
import { PortList } from "../components/ports/PortList";
import { parseSearchQuery } from "@pkg/shared";
import type { SearchFilter } from "@pkg/shared";

type SortOption = {
  value: string;
  label: string;
};

type SortDirection = "asc" | "desc";

const BASE_SORT_OPTIONS: SortOption[] = [
  { value: "score", label: "Score" },
  { value: "packaging-risk", label: "Packaging" },
  { value: "name", label: "Name" },
  { value: "stars", label: "Stars" },
  { value: "churn", label: "Churn" },
  { value: "recently-updated", label: "Recently Updated" },
  { value: "recently-added", label: "Recently Added" },
];

const QUERY_EXAMPLES = [
  "repository:github",
  "stars:>1000",
  "license:mit",
  "has:upstream",
  "has:host-deps",
];

function opSymbol(op: string): string {
  switch (op) {
    case "gt": return ">";
    case "gte": return ">=";
    case "lt": return "<";
    case "lte": return "<=";
    default: return "";
  }
}

function filterLabel(f: SearchFilter): string {
  const op = opSymbol(f.op);
  const opStr = op ? ` ${op} ` : "";
  switch (f.field) {
    case "repository": return `Repository: ${f.value}`;
    case "stars": return `Stars${opStr}${f.value}`;
    case "score": return `Score${opStr}${f.value}`;
    case "risk": return `Risk${opStr}${f.value}`;
    case "maintained": return `Maintained: ${f.value}`;
    case "license": return `License: ${f.value}`;
    case "supports": return `Supports: ${f.value}`;
    case "dependency": return `Dependency: ${f.value}`;
    case "feature": return `Feature: ${f.value}`;
    case "has": return `Has: ${f.value}`;
    case "no": return `No: ${f.value}`;
    case "updated": return `Updated ${f.op === "lt" ? "<" : ">"} ${f.value}`;
    default: return JSON.stringify(f);
  }
}

function filterToQueryToken(f: SearchFilter): string {
  const op = opSymbol(f.op);
  switch (f.field) {
    case "repository": return `repository:${f.value}`;
    case "stars": return `stars:${op}${f.value}`;
    case "score": return `score:${op}${f.value}`;
    case "risk": return `risk:${op}${f.value}`;
    case "maintained": return `maintained:${f.value}`;
    case "license": return `license:${f.value}`;
    case "supports": return `supports:${f.value}`;
    case "dependency": return `dependency:${f.value}`;
    case "feature": return `feature:${f.value}`;
    case "has": return `has:${f.value}`;
    case "no": return `no:${f.value}`;
    case "updated": return `updated:${f.op}${f.value}`;
    default: return "";
  }
}

function getDefaultSortForQuery(query: string): string {
  return parseSearchQuery(query).text ? "relevance" : "score";
}

function getDefaultSortDirection(sort: string): SortDirection {
  return sort === "name" ? "asc" : "desc";
}

function parseSortDirection(value: string | null, sort: string): SortDirection {
  return value === "asc" || value === "desc" ? value : getDefaultSortDirection(sort);
}

function normalizeSearchInput(query: string): string {
  return query.trim().replace(/\s+/g, " ");
}

export function PortsIndex() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const parsed = useMemo(() => parseSearchQuery(q), [q]);
  const sort = searchParams.get("sort") ?? getDefaultSortForQuery(q);
  const dir = parseSortDirection(searchParams.get("dir"), sort);
  const page = searchParams.get("page") ?? "1";
  const pageSize = searchParams.get("pageSize") ?? "30";

  const { data, isLoading, error, refetch } = usePorts({ q, sort, dir, page, pageSize });
  const sortOptions = useMemo(
    () => (parsed.text ? [{ value: "relevance", label: "Relevance" }, ...BASE_SORT_OPTIONS] : BASE_SORT_OPTIONS),
    [parsed.text],
  );
  const directionDisabled = sort === "relevance";

  function handleSearch(query: string) {
    const normalizedQuery = normalizeSearchInput(query);
    const nextSort = getDefaultSortForQuery(normalizedQuery);
    const nextDir = getDefaultSortDirection(nextSort);

    if (normalizedQuery === q && sort === nextSort && dir === nextDir && page === "1" && pageSize === "30") {
      return;
    }

    setSearchParams({ q: normalizedQuery, sort: nextSort, dir: nextDir, page: "1", pageSize: "30" });
  }

  function handleSortChange(newSort: string) {
    setSearchParams({ q, sort: newSort, dir: getDefaultSortDirection(newSort), page: "1", pageSize });
  }

  function handleDirectionChange(newDir: SortDirection) {
    setSearchParams({ q, sort, dir: newDir, page: "1", pageSize });
  }

  function handlePageChange(newPage: number) {
    setSearchParams({ q, sort, dir, page: String(newPage), pageSize });
  }

  function handleRemoveFilter(idx: number) {
    const newFilters = parsed.filters.filter((_, i) => i !== idx);
    const newQ = [parsed.text, ...newFilters.map(filterToQueryToken)]
      .filter(Boolean)
      .join(" ");
    const nextSort = getDefaultSortForQuery(newQ);
    setSearchParams({
      q: newQ,
      sort: nextSort,
      dir: getDefaultSortDirection(nextSort),
      page: "1",
      pageSize,
    });
  }

  function handleExampleClick(example: string) {
    handleSearch(example);
  }

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 0;

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <section className="pb-4">
        <h1 className="text-2xl font-semibold">
          {q ? "Search ports" : "Browse ports"}
        </h1>
      </section>

      {parsed.filters.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {parsed.filters.map((f, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 text-xs px-2 py-1 border border-[var(--color-primary)] text-[var(--color-primary)] rounded-full"
            >
              {filterLabel(f)}
              <button
                onClick={() => handleRemoveFilter(i)}
                className="hover:bg-[var(--color-primary)]/10 rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 pb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--color-text-secondary)]">Sort:</span>
          <select
            value={sort}
            onChange={(e) => handleSortChange(e.target.value)}
            className="text-xs border border-[var(--color-border)] rounded px-2 py-1 bg-[var(--color-surface)]"
          >
            {sortOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        {!directionDisabled && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--color-text-secondary)]">Order:</span>
            <select
              value={dir}
              onChange={(e) => handleDirectionChange(e.target.value as SortDirection)}
              className="text-xs border border-[var(--color-border)] rounded px-2 py-1 bg-[var(--color-surface)]"
            >
              <option value="desc">Desc</option>
              <option value="asc">Asc</option>
            </select>
          </div>
        )}
        {data && (
          <span className="text-xs text-[var(--color-text-secondary)] ml-auto">
            {data.total} results
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-16 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg animate-pulse"
            />
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-8">
          <AlertTriangle className="w-6 h-6 text-[var(--color-accent-yellow)] mx-auto mb-3" />
          <p className="text-sm text-[var(--color-text-secondary)] mb-3">
            Failed to load ports
          </p>
          <button
            onClick={() => refetch()}
            className="text-sm text-[var(--color-primary)] hover:underline"
          >
            Retry
          </button>
        </div>
      ) : data && data.items.length === 0 ? (
        <div className="text-center py-8">
          <Search className="w-6 h-6 text-[var(--color-text-secondary)] mx-auto mb-3" />
          <p className="text-sm font-medium mb-1">No ports match this query</p>
          <p className="text-xs text-[var(--color-text-secondary)] mb-4">
            Try adjusting your search or filters
          </p>
          <div className="flex flex-wrap gap-1.5 justify-center">
            {QUERY_EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => handleExampleClick(ex)}
                className="text-xs px-2 py-1 border border-[var(--color-border)] rounded-full hover:bg-[var(--color-surface)] transition-colors"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <PortList
          ports={data?.items ?? []}
          loading={false}
          onOpen={(name) => navigate(`/ports/${encodeURIComponent(name)}`, {
            state: {
              backTo: {
                pathname: location.pathname,
                search: location.search,
              },
            },
          })}
        />
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            onClick={() => handlePageChange(Math.max(1, parseInt(page) - 1))}
            disabled={parseInt(page) <= 1}
            className="px-3 py-1 text-sm border border-[var(--color-border)] rounded disabled:opacity-50"
          >
            Prev
          </button>
          <span className="text-sm text-[var(--color-text-secondary)]">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => handlePageChange(Math.min(totalPages, parseInt(page) + 1))}
            disabled={parseInt(page) >= totalPages}
            className="px-3 py-1 text-sm border border-[var(--color-border)] rounded disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
