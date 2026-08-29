#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

const SHA256 = /^[0-9a-f]{64}$/u;
const PROFILE_ROWS = 2949;
const fail = detail => { throw new Error(`T5_IDENTITY_AMBIGUITY_RECEIPT_INVALID: ${detail}`); };
const mode = path => (statSync(path).mode & 0o777).toString(8);
const sha = bytes => createHash("sha256").update(bytes).digest("hex");

function privateDirectory(path, label) {
  if (!existsSync(path) || lstatSync(path).isSymbolicLink() || !statSync(path).isDirectory() || mode(path) !== "700") fail(`${label} directory`);
  return path;
}

function privateFile(path, label) {
  if (!existsSync(path) || lstatSync(path).isSymbolicLink() || !statSync(path).isFile() || mode(path) !== "600") fail(`${label} file`);
  return path;
}

function stage(stagePath) {
  const root = privateDirectory(resolve(stagePath), "stage");
  const manifestPath = privateFile(join(root, "manifest.json"), "manifest");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const item = manifest.domains?.person_core;
  if (manifest.artifactKind !== "yuzhou_t5_nonfile_materialization_stage" || manifest.productionImport !== "HOLD" || manifest.sourceRows !== 7752
    || manifest.filesExcluded?.join(",") !== "photo,docs" || !SHA256.test(manifest.sourceBusinessSha256 ?? "") || !SHA256.test(manifest.sourceCatalogSha256 ?? "")
    || !SHA256.test(manifest.nonfileBusinessSha256 ?? "") || !item || item.rows !== PROFILE_ROWS || item.sourceObject !== "dbo.person.core_residue" || !SHA256.test(item.fileSha256 ?? "")) fail("stage boundary");
  const profilePath = privateFile(join(root, item.file), "profile stage");
  const bytes = readFileSync(profilePath);
  if (sha(bytes) !== item.fileSha256) fail("profile stage hash");
  return { manifest, profilePath };
}

export function buildT5IdentityAmbiguityReceipt({ stagePath }) {
  const input = stage(stagePath);
  const groups = new Map();
  let profileRows = 0, missingFingerprintRows = 0;
  for (const line of readFileSync(input.profilePath, "utf8").trimEnd().split("\n")) {
    if (!line) continue;
    const row = JSON.parse(line), materialized = row.materialized;
    if (row.sourceTable !== "dbo.person.core_residue" || materialized?.kind !== "profile" || !SHA256.test(row.sourceIdentitySha256 ?? "") || !SHA256.test(row.sourceRowSha256 ?? "")) fail("profile row shape");
    profileRows += 1;
    const fingerprint = materialized.idNumber?.fingerprint;
    if (fingerprint === null || fingerprint === undefined || fingerprint === "") { missingFingerprintRows += 1; continue; }
    // The protected materializer owns the fingerprint algorithm.  This
    // aggregate receipt only needs a non-empty opaque equality token; it must
    // not constrain or expose the token's implementation-specific encoding.
    if (typeof fingerprint !== "string" || !fingerprint || fingerprint.length > 256) fail("profile fingerprint shape");
    groups.set(fingerprint, (groups.get(fingerprint) ?? 0) + 1);
  }
  if (profileRows !== PROFILE_ROWS) fail("profile row count");
  const ambiguousGroups = [...groups.values()].filter(count => count > 1);
  const groupSizeHistogram = Object.fromEntries([...new Set(ambiguousGroups)].sort((left, right) => left - right).map(size => [String(size), ambiguousGroups.filter(count => count === size).length]));
  const ambiguousProfileRows = ambiguousGroups.reduce((sum, count) => sum + count, 0);
  const body = {
    formatVersion: 1,
    artifactKind: "yuzhou_t5_profile_identity_ambiguity_receipt",
    sourceSystem: "yuzhou-v10",
    sourceBusinessSha256: input.manifest.sourceBusinessSha256,
    sourceCatalogSha256: input.manifest.sourceCatalogSha256,
    nonfileBusinessSha256: input.manifest.nonfileBusinessSha256,
    sourceProfileRows: profileRows,
    uniqueFingerprintGroups: groups.size,
    missingFingerprintRows,
    ambiguousFingerprintGroups: ambiguousGroups.length,
    ambiguousProfileRows,
    groupSizeHistogram,
    automaticResolution: "prohibited",
    resolutionRequirement: "reviewed_one_to_one_employee_binding",
    containsPersonalData: false,
    productionImport: "HOLD"
  };
  return { ...body, receiptSha256: sha(`${JSON.stringify(body)}\n`) };
}

export function writeT5IdentityAmbiguityReceipt({ stagePath, outputPath }) {
  const output = resolve(outputPath), parent = dirname(output);
  if (!existsSync(parent)) { mkdirSync(parent, { recursive: true, mode: 0o700 }); chmodSync(parent, 0o700); }
  privateDirectory(parent, "output");
  if (existsSync(output)) fail(`output exists ${basename(output)}`);
  const receipt = buildT5IdentityAmbiguityReceipt({ stagePath });
  writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  chmodSync(output, 0o600);
  privateFile(output, "output");
  return receipt;
}

function args(argv) {
  const input = argv[0] === "--" ? argv.slice(1) : argv;
  const values = {};
  for (let index = 0; index < input.length; index += 2) {
    const key = input[index], value = input[index + 1];
    if (!value || !["--stage", "--output"].includes(key) || values[key]) fail("arguments");
    values[key] = value;
  }
  if (Object.keys(values).length !== 2) fail("arguments");
  return values;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    const input = args(process.argv.slice(2));
    const result = writeT5IdentityAmbiguityReceipt({ stagePath: input["--stage"], outputPath: input["--output"] });
    process.stdout.write(`${JSON.stringify({ status: "PASS", sourceProfileRows: result.sourceProfileRows, ambiguousFingerprintGroups: result.ambiguousFingerprintGroups, ambiguousProfileRows: result.ambiguousProfileRows, automaticResolution: result.automaticResolution, productionImport: result.productionImport })}\n`);
  } catch (error) {
    process.stderr.write(`${String(error.message).replace(/^.*?: /u, "")}\n`);
    process.exitCode = 1;
  }
}
