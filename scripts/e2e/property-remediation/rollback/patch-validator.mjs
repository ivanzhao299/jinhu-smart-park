import { closeSync, constants, fstatSync, openSync, readFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import { resolve } from "node:path";
import {
  assertCommitRef,
  assertFinalSha,
  assertHash,
  assertNoSensitiveData,
  canonicalSha256,
  canonicalReviewIdentity,
  exactKeys,
  isPathInside,
  resolveInside,
  sha256,
  validateTimestamp
} from "./lib.mjs";
import { assertRollbackPatchPathAllowed, immutablePathMatches, immutableSyntheticAnchorId } from "./semantic-contract.mjs";
const METADATA_KEYS = [
  "schemaVersion",
  "runId",
  "finalSha",
  "profileSha256",
  "caseId",
  "commits",
  "closureBindingSha256",
  "patchMode",
  "originalReverseSha256",
  "touchedPathsSha256",
  "patchPath",
  "manualPatchSha256",
  "deviationManifest",
  "author",
  "reviewer",
  "reviewedAt",
  "approved"
];

function semanticToken(line) {
  return line
    .replace(/^\s*(?:\/\/|\/\*|\*|\*\/|--|#).*$/u, "")
    .replace(/\/\/.*$/u, "")
    .replace(/\/\*.*?\*\//gu, "")
    .replace(/\s/gu, "");
}

function analyzePatch(text) {
  const paths = [];
  const semanticChangedPaths = new Set();
  let currentPath = null;
  for (const line of text.split(/\r?\n/u)) {
    const match = /^diff --git a\/(.+) b\/(.+)$/u.exec(line);
    if (match) { paths.push(match[1], match[2]); currentPath = match[2]; continue; }
    const header = /^(?:--- a|\+\+\+ b)\/(.+)$/u.exec(line);
    if (header) paths.push(header[1]);
    if (/^(?:---|\+\+\+) /u.test(line) && line !== "--- /dev/null" && line !== "+++ /dev/null" && !header) {
      throw new Error("rollback patch contains an unsupported or unsafe traditional path header");
    }
    const rename = /^(?:rename|copy) (?:from|to) (.+)$/u.exec(line);
    if (rename) paths.push(rename[1]);
    if (currentPath && /^[+-]/u.test(line) && !/^(?:---|\+\+\+)/u.test(line) && semanticToken(line.slice(1)).length > 0) semanticChangedPaths.add(currentPath);
  }
  return { paths: [...new Set(paths)], semanticChangedPaths: [...semanticChangedPaths] };
}

export function validatePatchMetadata({
  metadata,
  rehearsalCase,
  profile,
  runRoot,
  runId,
  finalSha,
  profileSha256,
  runCreatedAt,
  sourceBinding
}) {
  exactKeys(metadata, METADATA_KEYS, "rollback patch metadata");
  if (metadata.schemaVersion !== "property-track-c-reviewed-rollback-patch-v2") {
    throw new Error("invalid rollback patch metadata schema version");
  }
  if (metadata.runId !== runId || metadata.finalSha !== finalSha || metadata.profileSha256 !== profileSha256) {
    throw new Error("rollback patch metadata is bound to a different run/final/profile");
  }
  assertFinalSha(metadata.finalSha);
  assertHash(metadata.profileSha256, "profile SHA-256");
  if (metadata.caseId !== rehearsalCase.id) throw new Error("rollback patch case binding mismatch");
  if (JSON.stringify(metadata.commits) !== JSON.stringify(rehearsalCase.commits)) {
    throw new Error("rollback patch commit list differs from the frozen case");
  }
  for (const commit of metadata.commits) {
    assertCommitRef(commit);
    if (profile.forbiddenBlindRevertCommits.some((forbidden) => commit.startsWith(forbidden))) {
      throw new Error("cross-cutting commit cannot be blind-reverted");
    }
  }
  const closure = sourceBinding?.closures?.[rehearsalCase.id];
  if (!closure) throw new Error("source binding lacks the frozen closure reverse diff");
  const closureBindingSha256 = canonicalSha256(closure);
  if (metadata.closureBindingSha256 !== closureBindingSha256
    || metadata.originalReverseSha256 !== closure.reversePatchSha256
    || metadata.touchedPathsSha256 !== closure.touchedPathsSha256) {
    throw new Error("rollback patch closure/reverse binding mismatch");
  }
  if (metadata.patchMode !== "reviewed-manual-forward-port") throw new Error("rollback patch must be a reviewed manual forward-port, not a blind reverse patch");
  if (metadata.approved !== true || canonicalReviewIdentity(metadata.author, "patch author") === canonicalReviewIdentity(metadata.reviewer, "patch reviewer")) {
    throw new Error("rollback patch lacks explicit independent review approval");
  }
  validateTimestamp(metadata.reviewedAt, "patch review timestamp", {
    notBefore: Date.parse(runCreatedAt),
    notAfter: Date.now() + 60_000
  });
  const inputRoot = resolve(runRoot, "inputs/patches");
  const path = resolveInside(inputRoot, metadata.patchPath, "rollback patch path");
  if (!isPathInside(runRoot, path)) throw new Error("rollback patch path is unsafe");
  let descriptor;
  let bytes;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(descriptor);
    if (!stat.isFile()) throw new Error("rollback patch path is not a regular file");
    bytes = readFileSync(descriptor);
  } catch (error) {
    throw new Error(`rollback patch path is unsafe or unreadable: ${error.message}`);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  const actual = { sha256: sha256(bytes), size: bytes.length };
  assertHash(metadata.manualPatchSha256, "manual rollback patch SHA-256");
  if (actual.sha256 !== metadata.manualPatchSha256 || actual.size === 0) {
    throw new Error("rollback patch checksum/size mismatch");
  }
  const text = bytes.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(bytes)) throw new Error("rollback patch must be canonical UTF-8 text");
  assertNoSensitiveData(text, "rollback patch artifact");
  if (/GIT binary patch|Binary files .* differ/iu.test(text)) {
    throw new Error("binary rollback patches are forbidden");
  }
  if (/^(?:new file mode|old mode|new mode|index [0-9a-f.]+) 120000$/mu.test(text)) {
    throw new Error("rollback patches may not create or modify symlinks");
  }
  if (/^(?:new file mode|old mode|new mode|index [0-9a-f.]+) 160000$/mu.test(text)) {
    throw new Error("rollback patches may not create or modify gitlinks");
  }
  const { paths, semanticChangedPaths } = analyzePatch(text);
  if (paths.length === 0) throw new Error("rollback patch contains no unified git diff");
  if (semanticChangedPaths.length === 0) throw new Error("rollback patch contains only comments or whitespace");
  for (const changedPath of paths) {
    if (changedPath.includes("..") || changedPath.startsWith("/") || changedPath.includes("\\")) {
      throw new Error("rollback patch contains an unsafe path");
    }
    if (!rehearsalCase.allowedPatchPrefixes.some((prefix) => changedPath.startsWith(prefix))) {
      throw new Error(`rollback patch escapes case ownership: ${changedPath}`);
    }
    assertRollbackPatchPathAllowed(changedPath, profile, rehearsalCase);
  }
  const contract = rehearsalCase.rollbackSemanticContract;
  if (!contract) throw new Error("rollback patch case lacks its semantic contract");
  if (contract.mustChangeProductionPaths.some((required) => !semanticChangedPaths.includes(required))) throw new Error("rollback patch lacks a required non-comment production change");
  if (!Array.isArray(metadata.deviationManifest) || metadata.deviationManifest.length === 0) throw new Error("manual forward-port patch requires a deviation manifest");
  const deviationPaths = new Set();
  const patchPaths = new Set(paths); const semanticPaths = new Set(semanticChangedPaths);
  const anchors = [...contract.postApply, ...contract.retainedShell, ...contract.protectedExternalPaths];
  const anchorById = new Map(anchors.map((anchor) => [anchor.id, anchor]));
  for (const entry of metadata.deviationManifest) {
    exactKeys(entry, ["path", "action", "reason", "preservedInvariant", "test", "contractAnchorId"], "manual patch deviation");
    const immutableDeviation = immutablePathMatches(entry.path, contract.immutableTestPaths) && entry.contractAnchorId === immutableSyntheticAnchorId(entry.path);
    const anchor = immutableDeviation ? { path: entry.path } : anchorById.get(entry.contractAnchorId);
    const validTest = contract.allowedGateIds.includes(entry.test) || contract.immutableTestPaths.includes(entry.test);
    const allowsOmission = immutableDeviation || [...contract.retainedShell, ...contract.protectedExternalPaths].some(({ id, allowsIntentionalOmission }) => id === entry.contractAnchorId && allowsIntentionalOmission);
    const retainedShellAction = contract.retainedShell.some(({ id }) => id === entry.contractAnchorId);
    const changesProduction = ["modified", "facade-reroute"].includes(entry.action);
    const preservesProduction = ["retained-shell", "intentionally-omitted"].includes(entry.action);
    if (deviationPaths.has(entry.path) || !["modified", "retained-shell", "facade-reroute", "intentionally-omitted"].includes(entry.action)
      || !anchor || anchor.path !== entry.path || !validTest || !contract.allowedInvariantIds.includes(entry.preservedInvariant)
      || (entry.action === "intentionally-omitted" && !allowsOmission) || (entry.action === "retained-shell" && !retainedShellAction)
      || (immutableDeviation && entry.action !== "intentionally-omitted")
      || (changesProduction && !semanticPaths.has(entry.path))
      || (preservesProduction && patchPaths.has(entry.path))
      || typeof entry.reason !== "string" || entry.reason.trim().length < 3) throw new Error("invalid or duplicate manual patch deviation");
    deviationPaths.add(entry.path);
  }
  const requiredDeviationPaths = new Set([...closure.touchedPaths, ...paths]);
  if (deviationPaths.size !== requiredDeviationPaths.size || [...requiredDeviationPaths].some((changedPath) => !deviationPaths.has(changedPath))) throw new Error("manual patch has an undeclared path or omitted closure deviation");
  return { bytes, paths, semanticChangedPaths, deviations: metadata.deviationManifest, sha256: actual.sha256, size: actual.size, deviationManifestSha256: canonicalSha256(metadata.deviationManifest) };
}
