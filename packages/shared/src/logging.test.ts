import { describe, expect, it } from "vitest";
import { formatPrettyLogLine } from "./logging.js";

describe("formatPrettyLogLine", () => {
  it("formats dev logs onto a single line", () => {
    const line = formatPrettyLogLine({
      level: "info",
      name: "worker",
      message: "Sync complete",
      fields: {
        ports: 42,
        status: "ok",
      },
      now: new Date(2026, 4, 13, 21, 5, 6, 789),
    });

    expect(line).toBe("2026-05-13 21:05:06.789 INFO [worker] Sync complete ports=42 status=ok");
    expect(line.includes("\n")).toBe(false);
  });

  it("quotes string fields that contain spaces", () => {
    const line = formatPrettyLogLine({
      level: "warn",
      name: "server",
      message: "GET /ports",
      fields: {
        error: "rate limit hit",
      },
      now: new Date(2026, 4, 13, 21, 5, 6, 789),
    });

    expect(line).toContain('error="rate limit hit"');
  });
});
