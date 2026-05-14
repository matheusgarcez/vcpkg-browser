import { describe, expect, it } from "vitest";
import { getResultCount } from "./issues";

describe("getResultCount", () => {
  it("returns counts from pagination headers instead of current page length", () => {
    expect(
      getResultCount([{ number: 1 }], {
        link: '<https://api.github.com/repositories/1/issues?page=25>; rel="last"',
      })
    ).toBe(25);

    expect(
      getResultCount([{ number: 2 }], {
        link: '<https://api.github.com/repositories/1/issues?page=7>; rel="last"',
      })
    ).toBe(7);

    expect(getResultCount([], {})).toBe(0);
    expect(getResultCount([{ number: 3 }], {})).toBe(1);
  });
});