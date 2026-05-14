import { parsePortfile, detectUpstreamFromHomepage, type PortfileSource } from "./parse-portfile.js";

export function detectUpstream(
  portfile?: string,
  homepage?: string
): PortfileSource {
  if (portfile) {
    const result = parsePortfile(portfile);
    if (result.provider !== "none") {
      return result;
    }
  }

  if (homepage) {
    const result = detectUpstreamFromHomepage(homepage);
    if (result) {
      return result;
    }
  }

  return {
    provider: "unknown",
    confidence: 0,
    detectedFrom: "none",
  };
}
