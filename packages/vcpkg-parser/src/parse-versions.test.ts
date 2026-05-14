import { describe, expect, it } from "vitest";
import { isDateBasedVersion, normalizeVersionDateValue, normalizeVersionEntry } from "./parse-versions";

describe("normalizeVersionEntry", () => {
  it("prefers explicit version fields used by the vcpkg versions database", () => {
    expect(normalizeVersionEntry({ version: "1.2.3" })).toBe("1.2.3");
    expect(normalizeVersionEntry({ "version-string": "2.6.3", "port-version": 0 })).toBe("2.6.3");
    expect(normalizeVersionEntry({ "version-semver": "3.4.5" })).toBe("3.4.5");
    expect(normalizeVersionEntry({ "version-date": "2025-01-01" })).toBe("2025-01-01");
  });

  it("only treats actual date-based versions as version dates", () => {
    expect(isDateBasedVersion("2025-03-20")).toBe(true);
    expect(isDateBasedVersion("20250320.1")).toBe(true);
    expect(isDateBasedVersion("5.2.0")).toBe(false);
    expect(normalizeVersionDateValue("2025-03-20")).toBe("2025-03-20T00:00:00.000Z");
    expect(normalizeVersionDateValue("20250320.1")).toBe("2025-03-20T00:00:00.000Z");
    expect(normalizeVersionDateValue("5.2.0")).toBeUndefined();
  });
});
