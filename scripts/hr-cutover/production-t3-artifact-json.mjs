import { createHash } from "node:crypto";
import { stableProductionImportCanonicalJson as canonical } from "./production-import-target-model.mjs";

/** Match the existing canonical JSON bytes without copying/stringifying the
 * complete records array. Metadata and each individual record remain bounded
 * by the private owner. This is serialization, not source authentication. */
export function* productionT3ArtifactJsonChunks(artifact) {
  if (artifact === null || typeof artifact !== "object" || Object.getPrototypeOf(artifact) !== Object.prototype
    || !Object.hasOwn(artifact, "records") || !Array.isArray(artifact.records)) {
    throw new Error("T3_ARTIFACT_JSON_INVALID");
  }
  // JSON.stringify enumerates integer-like keys numerically even after lexical
  // sorting. Obtain that same order from the small metadata-only envelope.
  const keys = Object.keys(JSON.parse(canonical({ ...artifact, records: [] })));
  yield "{";
  for (const [index, key] of keys.entries()) {
    if (index) yield ",";
    yield `${JSON.stringify(key)}:`;
    if (key !== "records") { yield canonical(artifact[key]); continue; }
    yield "[";
    for (let rowIndex = 0; rowIndex < artifact.records.length; rowIndex++) {
      if (rowIndex) yield ",";
      // Match Array.map/JSON.stringify hole behavior in the canonical encoder.
      yield rowIndex in artifact.records ? canonical(artifact.records[rowIndex]) : "null";
    }
    yield "]";
  }
  yield "}\n";
}

export function hashProductionT3ArtifactJson(artifact) {
  const digest = createHash("sha256");
  for (const chunk of productionT3ArtifactJsonChunks(artifact)) digest.update(chunk);
  return digest.digest("hex");
}
