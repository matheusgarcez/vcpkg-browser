import { describe, expect, it } from "vitest";
import { extractDeclaredPatchPaths, parseSourceProvenance } from "./packaging-signals";

describe("extractDeclaredPatchPaths", () => {
  it("extracts literal patch refs from PATCHES clauses", () => {
    const portfile = `vcpkg_from_github(
      REPO owner/repo
      REF v1.0.0
      PATCHES fix-build.patch "compat.diff"
    )`;

    expect(extractDeclaredPatchPaths(portfile)).toEqual(["compat.diff", "fix-build.patch"]);
  });

  it("normalizes CURRENT_PORT_DIR patch refs", () => {
    const portfile = `vcpkg_from_git(
      URL https://example.com/repo.git
      REF deadbeef
      PATCHES \${CURRENT_PORT_DIR}/v8.patch
    )`;

    expect(extractDeclaredPatchPaths(portfile)).toEqual(["v8.patch"]);
  });

  it("skips unresolved variable-built patch lists", () => {
    const portfile = `vcpkg_list(SET PATCHES)
    vcpkg_list(APPEND PATCHES "enable-asm.diff")
    vcpkg_from_github(
      REPO owner/repo
      REF \${VERSION}
      PATCHES \${PATCHES}
    )`;

    expect(extractDeclaredPatchPaths(portfile)).toEqual([]);
  });
});

describe("parseSourceProvenance", () => {
  it("classifies exact commit refs", () => {
    const result = parseSourceProvenance(`vcpkg_from_github(
      REPO owner/repo
      REF 6957fc8383d6c7db25b60b8c849b29caab1caaee
    )`);

    expect(result.quality).toBe("exact-commit");
    expect(result.refKind).toBe("commit");
    expect(result.referenceUrl).toContain("/tree/");
  });

  it("resolves VERSION placeholders for tags", () => {
    const result = parseSourceProvenance(`vcpkg_from_github(
      REPO owner/repo
      REF v\${VERSION}
    )`, { version: "1.2.3" });

    expect(result.quality).toBe("exact-tag");
    expect(result.ref).toBe("v1.2.3");
  });

  it("resolves refs built through string(REPLACE) variables", () => {
    const result = parseSourceProvenance(`string(REPLACE "." "-" ref "asio-\${VERSION}")
    vcpkg_from_github(
      REPO chriskohlhoff/asio
      REF "\${ref}"
    )`, { version: "1.32.0" });

    expect(result.quality).toBe("exact-tag");
    expect(result.ref).toBe("asio-1-32-0");
  });

  it("classifies release asset urls", () => {
    const result = parseSourceProvenance(`vcpkg_download_distfile(archive
      URLS "https://github.com/owner/repo/releases/download/v1.0/repo-v1.0.tar.gz"
    )`);

    expect(result.quality).toBe("release-asset");
    expect(result.refKind).toBe("release");
  });

  it("classifies archive refs", () => {
    const result = parseSourceProvenance(`vcpkg_from_url(
      URLS https://github.com/owner/repo/archive/refs/tags/v1.0.tar.gz
    )`);

    expect(result.quality).toBe("archive-ref");
    expect(result.ref).toBe("v1.0");
  });

  it("classifies branch refs", () => {
    const result = parseSourceProvenance(`vcpkg_from_git(
      URL https://example.com/repo.git
      REF master
    )`);

    expect(result.quality).toBe("branch-ref");
    expect(result.refKind).toBe("branch");
  });

  it("returns unknown when refs still contain unresolved placeholders", () => {
    const result = parseSourceProvenance(`vcpkg_from_github(
      REPO owner/repo
      REF \${SOME_OTHER_VAR}
    )`);

    expect(result.quality).toBe("unknown");
  });
});
