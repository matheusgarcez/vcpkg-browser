import { describe, it, expect } from "vitest";
import { evaluateSupports } from "./supports-expression";

describe("evaluateSupports", () => {
  it("returns all triplets for undefined", () => {
    const result = evaluateSupports(undefined);
    expect(result).toContain("x64-windows");
    expect(result).toContain("x64-linux");
    expect(result).toContain("x64-osx");
    expect(result.length).toBeGreaterThan(10);
  });

  it("returns all triplets for empty string", () => {
    const result = evaluateSupports("");
    expect(result).toContain("x64-windows");
  });

  it("excludes uwp triplets with !uwp", () => {
    const result = evaluateSupports("!uwp");
    expect(result).not.toContain("x64-uwp");
    expect(result).toContain("x64-windows");
  });

  it("handles windows & !uwp", () => {
    const result = evaluateSupports("windows & !uwp");
    expect(result).toContain("x64-windows");
    expect(result).not.toContain("x64-uwp");
    expect(result).not.toContain("x64-linux");
  });

  it("handles linux | osx", () => {
    const result = evaluateSupports("linux | osx");
    expect(result).toContain("x64-linux");
    expect(result).toContain("x64-osx");
    expect(result).not.toContain("x64-windows");
  });

  it("handles (windows | linux) & !uwp", () => {
    const result = evaluateSupports("(windows | linux) & !uwp");
    expect(result).toContain("x64-windows");
    expect(result).not.toContain("x64-uwp");
    expect(result).toContain("x64-linux");
  });

  it("handles static", () => {
    const result = evaluateSupports("static");
    expect(result).toContain("x64-windows-static");
    expect(result).not.toContain("x64-windows");
  });
});