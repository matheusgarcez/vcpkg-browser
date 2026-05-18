export { parseManifest, normalizeDescription, normalizeVersion, parseDependencies, parseFeatures } from "./parse-manifest.js";
export type { VcpkgManifest, VcpkgDependency, VcpkgFeature } from "./parse-manifest.js";
export { parsePortfile, detectUpstreamFromHomepage } from "./parse-portfile.js";
export type { PortfileSource } from "./parse-portfile.js";
export { extractDeclaredPatchPaths, parseSourceProvenance } from "./packaging-signals.js";
export type { ParsedSourceProvenance, SourceProvenanceQuality, SourceProvenanceProvider } from "./packaging-signals.js";
export { parseUsage } from "./parse-usage.js";
export {
  MAX_INLINE_PORT_FILE_BYTES,
  classifyPortFilePath,
  isLikelyTextBuffer,
} from "./port-files.js";
export {
  parseVersionDatabase,
  parseBaseline,
  parseVersionsArray,
  normalizeVersionEntry,
  isDateBasedVersion,
  normalizeVersionDateValue,
} from "./parse-versions.js";
export type { VersionEntry, VersionDatabase, BaselineEntry, BaselineDatabase } from "./parse-versions.js";
export { evaluateSupports } from "./supports-expression.js";
export { detectUpstream } from "./detect-upstream.js";
export {
  InvalidHistoricalTreeError,
  materializeHistoricalSnapshot,
} from "./materialize-historical-snapshot.js";
export type {
  MaterializeHistoricalSnapshotInput,
  MaterializedHistoricalSnapshot,
} from "./materialize-historical-snapshot.js";
