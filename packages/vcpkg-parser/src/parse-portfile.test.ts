import { describe, it, expect } from "vitest";
import { parsePortfile, detectUpstreamFromHomepage } from "./parse-portfile";

describe("parsePortfile", () => {
  it("detects GitHub from vcpkg_from_github with bare repo string", () => {
    const portfile = `vcpkg_from_github(\n    REPO owner/repo\n    REF v1.0\n    SHA512 abc123\n)`;
    const result = parsePortfile(portfile);
    expect(result.provider).toBe("github");
    expect(result.owner).toBe("owner");
    expect(result.repo).toBe("repo");
    expect(result.confidence).toBe(100);
  });

  it("detects GitHub from vcpkg_from_github with quoted repo string", () => {
    const portfile = `vcpkg_from_github(\n    REPO "owner/repo"\n    REF v1.0\n    SHA512 abc123\n)`;
    const result = parsePortfile(portfile);
    expect(result.provider).toBe("github");
    expect(result.owner).toBe("owner");
    expect(result.repo).toBe("repo");
  });

  it("detects GitHub from URL with archive refs", () => {
    const portfile = `vcpkg_from_url(\n    URLS https://github.com/owner/repo/archive/refs/tags/v1.0.tar.gz\n    SHA512 abc123\n)`;
    const result = parsePortfile(portfile);
    expect(result.provider).toBe("github");
    expect(result.owner).toBe("owner");
    expect(result.repo).toBe("repo");
  });

  it("detects custom GitLab hosts from vcpkg_from_gitlab", () => {
    const portfile = `vcpkg_from_gitlab(\n    GITLAB_URL "https://gitlab.freedesktop.org/xorg"\n    REPO "lib/libxau"\n    REF "libXau-1.0.0"\n    SHA512 abc123\n)`;
    const result = parsePortfile(portfile);
    expect(result.provider).toBe("url");
    expect(result.url).toBe("https://gitlab.freedesktop.org/xorg/lib/libxau");
    expect(result.detectedFrom).toBe("portfile.vcpkg_from_gitlab");
  });

  it("detects GitHub from vcpkg_download_distfile with GitHub URL", () => {
    const portfile = `vcpkg_download_distfile(archive\n    URLS "https://github.com/owner/repo/releases/download/v1.0/repo-v1.0.tar.gz"\n    SHA512 abc123\n)`;
    const result = parsePortfile(portfile);
    expect(result.provider).toBe("github");
    expect(result.owner).toBe("owner");
    expect(result.repo).toBe("repo");
  });

  it("detects googlesource repos from unquoted vcpkg_from_git URLs", () => {
    const portfile = `vcpkg_from_git(\n    OUT_SOURCE_PATH SOURCE_PATH\n    URL https://aomedia.googlesource.com/aom\n    REF deadbeef\n)`;
    const result = parsePortfile(portfile);
    expect(result.provider).toBe("url");
    expect(result.url).toBe("https://aomedia.googlesource.com/aom");
    expect(result.detectedFrom).toBe("portfile.vcpkg_from_git");
  });

  it("detects git.kernel.org repos from unquoted distfile URLs", () => {
    const portfile = `vcpkg_download_distfile(ARCHIVE\n    URLS https://git.kernel.org/pub/scm/libs/libgpiod/libgpiod.git/snapshot/libgpiod-2.2.tar.gz\n    SHA512 abc123\n)`;
    const result = parsePortfile(portfile);
    expect(result.provider).toBe("url");
    expect(result.url).toBe("https://git.kernel.org/pub/scm/libs/libgpiod/libgpiod.git");
    expect(result.detectedFrom).toBe("portfile.vcpkg_download_distfile");
  });

  it("returns url provider for non-GitHub URLs", () => {
    const portfile = `vcpkg_from_url(\n    URLS https://example.com/some-file.tar.gz\n    SHA512 abc123\n)`;
    const result = parsePortfile(portfile);
    expect(result.provider).toBe("url");
    expect(result.url).toBe("https://example.com/some-file.tar.gz");
  });

  it("does not classify non-GitHub GITHUB_HOST overrides as GitHub", () => {
    const portfile = `vcpkg_from_github(\n    GITHUB_HOST https://codeberg.org\n    REPO soundtouch/soundtouch\n    REF v1.0\n    SHA512 abc123\n)`;
    const result = parsePortfile(portfile);
    expect(result.provider).toBe("url");
    expect(result.url).toBe("https://codeberg.org/soundtouch/soundtouch");
    expect(result.detectedFrom).toBe("portfile.vcpkg_from_github_host");
  });

  it("returns none when no source is detected", () => {
    const portfile = `some_random_cmake_function()`;
    const result = parsePortfile(portfile);
    expect(result.provider).toBe("none");
  });
});

describe("detectUpstreamFromHomepage", () => {
  it("detects GitHub from homepage", () => {
    const result = detectUpstreamFromHomepage("https://github.com/owner/repo");
    expect(result).not.toBeNull();
    expect(result!.provider).toBe("github");
    expect(result!.owner).toBe("owner");
    expect(result!.repo).toBe("repo");
  });

  it("detects GitLab instance homepages as explicit upstream URLs", () => {
    const result = detectUpstreamFromHomepage("https://gitlab.gnome.org/GNOME/libnotify");
    expect(result).not.toBeNull();
    expect(result!.provider).toBe("url");
    expect(result!.url).toBe("https://gitlab.gnome.org/GNOME/libnotify");
  });

  it("detects Codeberg homepages as explicit upstream URLs", () => {
    const result = detectUpstreamFromHomepage("https://codeberg.org/tenacityteam/libmad");
    expect(result).not.toBeNull();
    expect(result!.provider).toBe("url");
    expect(result!.owner).toBe("tenacityteam");
    expect(result!.repo).toBe("libmad");
    expect(result!.url).toBe("https://codeberg.org/tenacityteam/libmad");
  });

  it("normalizes googlesource readme URLs to the repo root", () => {
    const result = detectUpstreamFromHomepage(
      "https://chromium.googlesource.com/crashpad/crashpad/+/master/README.md",
    );
    expect(result).not.toBeNull();
    expect(result!.provider).toBe("url");
    expect(result!.url).toBe("https://chromium.googlesource.com/crashpad/crashpad");
  });

  it("returns null for non-GitHub homepage", () => {
    const result = detectUpstreamFromHomepage("https://example.com");
    expect(result).toBeNull();
  });
});
