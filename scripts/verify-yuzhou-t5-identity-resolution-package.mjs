#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { readT5ProfileIdentityRows } from "./prepare-yuzhou-t5-identity-ambiguity-receipt.mjs";

const SHA256 = /^[0-9a-f]{64}$/u;
const REASON = /^T5_IDENTITY_[A-Z0-9_]{3,63}$/u;
const fail = detail => { const error = new Error(`T5_IDENTITY_RESOLUTION_PACKAGE_INVALID: ${detail}`); error.code = "T5_IDENTITY_RESOLUTION_PACKAGE_INVALID"; throw error; };
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : value && typeof value === "object" ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}` : JSON.stringify(value);
const exactKeys = (value, keys, label) => { if (!value || typeof value !== "object" || Array.isArray(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail(`${label} shape`); };

function privateJson(path) {
  const actual = resolve(path);
  if (!existsSync(actual) || lstatSync(actual).isSymbolicLink() || !statSync(actual).isFile() || (statSync(actual).mode & 0o777) !== 0o600) fail("decision file");
  try { return JSON.parse(readFileSync(actual, "utf8")); } catch { fail("decision JSON"); }
}

function ambiguityCandidateIds(stagePath) {
  const { manifest, rows } = readT5ProfileIdentityRows({ stagePath }), groups = new Map();
  for (const row of rows) if (row.fingerprint) groups.set(row.fingerprint, [...(groups.get(row.fingerprint) ?? []), row]);
  return {
    manifest,
    candidates: new Set([...groups.values()].filter(group => group.length > 1).flat().filter(row => row.disposition !== "quarantined").map(row => row.sourceIdentitySha256))
  };
}

export function verifyT5IdentityResolutionPackage({ stagePath, decisionPath }) {
  const { manifest, candidates } = ambiguityCandidateIds(stagePath), input = privateJson(decisionPath);
  exactKeys(input, ["formatVersion", "artifactKind", "sourceSystem", "sourceBusinessSha256", "sourceCatalogSha256", "nonfileBusinessSha256", "reviewerSubjectSha256", "decisions", "productionImport"], "package");
  if (input.formatVersion !== 1 || input.artifactKind !== "yuzhou_t5_profile_identity_resolution" || input.sourceSystem !== "yuzhou-v10" || input.sourceBusinessSha256 !== manifest.sourceBusinessSha256 || input.sourceCatalogSha256 !== manifest.sourceCatalogSha256 || input.nonfileBusinessSha256 !== manifest.nonfileBusinessSha256 || !SHA256.test(input.reviewerSubjectSha256 ?? "") || !Array.isArray(input.decisions) || input.productionImport !== "HOLD") fail("package binding");
  const actual = new Set(); let mapCount = 0, quarantineCount = 0;
  for (const decision of input.decisions) {
    exactKeys(decision, ["profileSourceIdentitySha256", "targetPersonSourceIdentitySha256", "disposition", "reasonCode"], "decision");
    if (!SHA256.test(decision.profileSourceIdentitySha256 ?? "") || actual.has(decision.profileSourceIdentitySha256) || !["map", "quarantine"].includes(decision.disposition) || !REASON.test(decision.reasonCode ?? "")) fail("decision value");
    if ((decision.disposition === "map" && !SHA256.test(decision.targetPersonSourceIdentitySha256 ?? "")) || (decision.disposition === "quarantine" && decision.targetPersonSourceIdentitySha256 !== null)) fail("decision target");
    actual.add(decision.profileSourceIdentitySha256);
    if (decision.disposition === "map") mapCount += 1; else quarantineCount += 1;
  }
  if (actual.size !== candidates.size || [...actual].some(value => !candidates.has(value))) fail("candidate coverage");
  return Object.freeze({ status: "PASS", candidateCount: candidates.size, mapCount, quarantineCount, resolutionSha256: createHash("sha256").update(`${canonical(input)}\n`).digest("hex"), productionImport: "HOLD" });
}

function args(argv) {
  const input = argv[0] === "--" ? argv.slice(1) : argv;
  if (input[0] !== "verify" || input.length !== 5 || input[1] !== "--stage" || input[3] !== "--decision") fail("arguments");
  return { stagePath: input[2], decisionPath: input[4] };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  try { process.stdout.write(`${JSON.stringify(verifyT5IdentityResolutionPackage(args(process.argv.slice(2))))}\n`); }
  catch (error) { process.stderr.write(`${error.code ?? "T5_IDENTITY_RESOLUTION_PACKAGE_INVALID"}\n`); process.exitCode = 1; }
}
