import type { SearchFilter, SearchSort, SearchSortDirection } from "./api-types";

type CompareOp = "gt" | "gte" | "lt" | "lte";

function parseCompareOp(raw: string | undefined, fallback: CompareOp = "gte"): CompareOp {
  switch (raw) {
    case ">": return "gt";
    case ">=": return "gte";
    case "<": return "lt";
    case "<=": return "lte";
    case undefined:
    case "": return fallback;
    default: return fallback;
  }
}

function parseUpdatedFilter(match: RegExpExecArray): SearchFilter {
  const value = match[2].toLowerCase();
  const fallback: CompareOp = /^\d+d$/i.test(value) ? "lt" : "gte";
  return {
    field: "updated",
    op: parseCompareOp(match[1], fallback),
    value,
  };
}

const FILTER_PATTERNS: Array<{
  regex: RegExp;
  parse: (match: RegExpExecArray) => SearchFilter;
}> = [
  {
    regex: /^repository:\s*(\S+)$/i,
    parse: (m) => ({ field: "repository", op: "eq", value: m[1].toLowerCase() }),
  },
  {
    regex: /^(has|no):\s*(upstream)$/i,
    parse: (m) => {
      if (m[1].toLowerCase() === "has") {
        return { field: "has", op: "eq", value: "upstream" };
      }
      return { field: "no", op: "eq", value: "upstream" };
    },
  },
  {
    regex: /^has:\s*(usage)$/i,
    parse: () => ({ field: "has", op: "eq", value: "usage" }),
  },
  {
    regex: /^has:\s*(features)$/i,
    parse: () => ({ field: "has", op: "eq", value: "features" }),
  },
  {
    regex: /^has:\s*(host-deps)$/i,
    parse: () => ({ field: "has", op: "eq", value: "host-deps" }),
  },
  {
    regex: /^stars:\s*(>=|<=|>|<)?\s*(\d+)$/i,
    parse: (m) => ({ field: "stars", op: parseCompareOp(m[1]), value: parseInt(m[2], 10) }),
  },
  {
    regex: /^score:\s*(>=|<=|>|<)?\s*(\d+)$/i,
    parse: (m) => ({ field: "score", op: parseCompareOp(m[1]), value: parseInt(m[2], 10) }),
  },
  {
    regex: /^risk:\s*(>=|<=|>|<)?\s*(\d+)$/i,
    parse: (m) => ({ field: "risk", op: parseCompareOp(m[1]), value: parseInt(m[2], 10) }),
  },
  {
    regex: /^maintained:\s*(\S+)$/i,
    parse: (m) => ({ field: "maintained", op: "eq", value: m[1].toLowerCase() }),
  },
  {
    regex: /^license:\s*(\S+)$/i,
    parse: (m) => ({ field: "license", op: "eq", value: m[1].toLowerCase() }),
  },
  {
    regex: /^supports:\s*(\S+)$/i,
    parse: (m) => ({ field: "supports", op: "eq", value: m[1].toLowerCase() }),
  },
  {
    regex: /^dependency:\s*(\S+)$/i,
    parse: (m) => ({ field: "dependency", op: "eq", value: m[1].toLowerCase() }),
  },
  {
    regex: /^feature:\s*(\S+)$/i,
    parse: (m) => ({ field: "feature", op: "eq", value: m[1].toLowerCase() }),
  },
  {
    regex: /^updated:\s*(>=|<=|>|<)?\s*(\d+d|\d{4}-\d{2}-\d{2})$/i,
    parse: parseUpdatedFilter,
  },
];

export function parseSearchQuery(q: string): { text?: string; filters: SearchFilter[] } {
  const tokens = q.trim().split(/\s+/).filter(Boolean);
  const filters: SearchFilter[] = [];
  const textParts: string[] = [];

  for (const token of tokens) {
    let matched = false;
    for (const pattern of FILTER_PATTERNS) {
      const m = pattern.regex.exec(token);
      if (m) {
        filters.push(pattern.parse(m));
        matched = true;
        break;
      }
    }
    if (!matched) {
      textParts.push(token);
    }
  }

  return {
    text: textParts.length > 0 ? textParts.join(" ") : undefined,
    filters,
  };
}

export function parseSortParam(sort?: string): SearchSort {
  const valid: SearchSort[] = [
    "relevance",
    "name",
    "recently-added",
    "recently-updated",
    "stars",
    "score",
    "packaging-risk",
    "churn",
    "last-upstream-commit",
    "dependency-count",
    "feature-count",
  ];
  if (sort && valid.includes(sort as SearchSort)) {
    return sort as SearchSort;
  }
  return "score";
}

export function parseSortDirectionParam(direction?: string): SearchSortDirection {
  return direction === "asc" ? "asc" : "desc";
}
