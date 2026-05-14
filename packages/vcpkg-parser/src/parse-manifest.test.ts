import { describe, expect, it } from "vitest";
import { parseFeatures } from "./parse-manifest";

describe("parseFeatures", () => {
  it("normalizes array descriptions and preserves supports", () => {
    const result = parseFeatures({
      d3d: {
        description: [
          "Use Direct3D for GPU detection.",
          "This choice has priority over opencl and opengl.",
        ],
        supports: "windows",
      },
    });

    expect(result).toEqual([
      {
        name: "d3d",
        description: "Use Direct3D for GPU detection. This choice has priority over opencl and opengl.",
        dependencies: undefined,
        supports: "windows",
        defaultFeature: false,
      },
    ]);
  });

  it("preserves structured feature dependencies and default features", () => {
    const result = parseFeatures(
      {
        tools: {
          description: "Install helper tools.",
          dependencies: [
            "zlib",
            {
              name: "vcpkg-cmake",
              host: true,
              "default-features": false,
              features: ["core"],
              platform: "windows",
              "dependency-type": "test",
            },
          ],
        },
      },
      ["tools"],
    );

    expect(result).toEqual([
      {
        name: "tools",
        description: "Install helper tools.",
        dependencies: [
          { name: "zlib" },
          {
            name: "vcpkg-cmake",
            host: true,
            defaultFeatures: false,
            features: ["core"],
            platform: "windows",
            dependencyType: "test",
          },
        ],
        supports: undefined,
        defaultFeature: true,
      },
    ]);
  });
});
