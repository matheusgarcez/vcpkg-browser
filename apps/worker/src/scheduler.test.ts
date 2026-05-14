import { describe, expect, it } from "vitest";
import { getScheduledJobs } from "./scheduler.js";

describe("getScheduledJobs", () => {
  it("registers only the top-level recurring jobs", () => {
    expect(getScheduledJobs()).toEqual([
      expect.objectContaining({ name: "sync-vcpkg", interval: "24h" }),
      expect.objectContaining({ name: "refresh-github-hot", interval: "6h" }),
      expect.objectContaining({ name: "refresh-github-full", interval: "24h" }),
      expect.objectContaining({ name: "cleanup", interval: "7d" }),
    ]);
  });
});
