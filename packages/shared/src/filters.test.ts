import { describe, it, expect } from "vitest";
import { parseSearchQuery } from "./filters";

describe("parseSearchQuery", () => {
  describe("comparison operators", () => {
    it("parses stars:>1000 as gt", () => {
      const result = parseSearchQuery("stars:>1000");
      expect(result.filters[0]).toEqual({ field: "stars", op: "gt", value: 1000 });
    });

    it("parses stars:>=1000 as gte", () => {
      const result = parseSearchQuery("stars:>=1000");
      expect(result.filters[0]).toEqual({ field: "stars", op: "gte", value: 1000 });
    });

    it("parses stars:<1000 as lt", () => {
      const result = parseSearchQuery("stars:<1000");
      expect(result.filters[0]).toEqual({ field: "stars", op: "lt", value: 1000 });
    });

    it("parses stars:<=1000 as lte", () => {
      const result = parseSearchQuery("stars:<=1000");
      expect(result.filters[0]).toEqual({ field: "stars", op: "lte", value: 1000 });
    });

    it("parses stars:1000 with no operator as gte (default)", () => {
      const result = parseSearchQuery("stars:1000");
      expect(result.filters[0]).toEqual({ field: "stars", op: "gte", value: 1000 });
    });

    it("parses score:>80 as gt", () => {
      const result = parseSearchQuery("score:>80");
      expect(result.filters[0]).toEqual({ field: "score", op: "gt", value: 80 });
    });

    it("parses score:<=80 as lte", () => {
      const result = parseSearchQuery("score:<=80");
      expect(result.filters[0]).toEqual({ field: "score", op: "lte", value: 80 });
    });

    it("parses risk:>45 as gt", () => {
      const result = parseSearchQuery("risk:>45");
      expect(result.filters[0]).toEqual({ field: "risk", op: "gt", value: 45 });
    });
  });

  describe("updated filter", () => {
    it("parses updated:<30d as lt (within last 30 days)", () => {
      const result = parseSearchQuery("updated:<30d");
      expect(result.filters[0]).toEqual({ field: "updated", op: "lt", value: "30d" });
    });

    it("parses updated:>30d as gt (older than 30 days)", () => {
      const result = parseSearchQuery("updated:>30d");
      expect(result.filters[0]).toEqual({ field: "updated", op: "gt", value: "30d" });
    });

    it("parses updated:30d with no operator as lt (default)", () => {
      const result = parseSearchQuery("updated:30d");
      expect(result.filters[0]).toEqual({ field: "updated", op: "lt", value: "30d" });
    });

    it("parses updated:>2025-01-01 as gt", () => {
      const result = parseSearchQuery("updated:>2025-01-01");
      expect(result.filters[0]).toEqual({ field: "updated", op: "gt", value: "2025-01-01" });
    });

    it("parses updated:2025-01-01 with no operator as gte (default)", () => {
      const result = parseSearchQuery("updated:2025-01-01");
      expect(result.filters[0]).toEqual({ field: "updated", op: "gte", value: "2025-01-01" });
    });
  });

  describe("other filters", () => {
    it("parses repository:github", () => {
      const result = parseSearchQuery("repository:github");
      expect(result.filters[0]).toEqual({ field: "repository", op: "eq", value: "github" });
    });

    it("parses has:upstream", () => {
      const result = parseSearchQuery("has:upstream");
      expect(result.filters[0]).toEqual({ field: "has", op: "eq", value: "upstream" });
    });

    it("parses has:host-deps", () => {
      const result = parseSearchQuery("has:host-deps");
      expect(result.filters[0]).toEqual({ field: "has", op: "eq", value: "host-deps" });
    });

    it("parses no:upstream", () => {
      const result = parseSearchQuery("no:upstream");
      expect(result.filters[0]).toEqual({ field: "no", op: "eq", value: "upstream" });
    });

    it("parses combined text and filters", () => {
      const result = parseSearchQuery("repository:github has:upstream");
      expect(result.text).toBeUndefined();
      expect(result.filters).toHaveLength(2);
      expect(result.filters[0]).toEqual({ field: "repository", op: "eq", value: "github" });
      expect(result.filters[1]).toEqual({ field: "has", op: "eq", value: "upstream" });
    });

    it("parses text with filters", () => {
      const result = parseSearchQuery("ffmpeg stars:>1000");
      expect(result.text).toBe("ffmpeg");
      expect(result.filters).toHaveLength(1);
      expect(result.filters[0]).toEqual({ field: "stars", op: "gt", value: 1000 });
    });
  });
});
