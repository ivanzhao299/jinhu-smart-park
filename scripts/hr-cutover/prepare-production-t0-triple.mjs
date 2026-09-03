#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { verifyProductionSourceManifest } from "../prepare-yuzhou-production-source-manifest.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const CODE_SHA = /^[0-9a-f]{40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;

export class ProductionT0TripleError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.code = code;
  }
}

const fail = (code, detail) => { throw new ProductionT0TripleError(code, detail); };
const sha256 = value => createHash("sha256").update(value).digest("hex");
const mode = path => statSync(path).mode & 0o777;

function requirePrivateDirectory(path, label) {
  if (!isAbsolute(path) || !existsSync(path)) fail("PRODUCTION_IMPORT_T0_TRIPLE_PATH_INVALID", label);
  const link = lstatSync(path);
  if (link.isSymbolicLink() || !link.isDirectory() || mode(path) !== 0o700) fail("PRODUCTION_IMPORT_T0_TRIPLE_PATH_INVALID", label);
  return resolve(path);
}

function requirePrivateFile(path, label) {
  if (!isAbsolute(path) || !existsSync(path)) fail("PRODUCTION_IMPORT_T0_TRIPLE_INPUT_MISSING", label);
  const link = lstatSync(path);
  if (link.isSymbolicLink() || !link.isFile() || mode(path) !== 0o600) fail("PRODUCTION_IMPORT_T0_TRIPLE_PATH_INVALID", label);
  return resolve(path);
}

function currentHead() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const value = String(result.stdout ?? "").trim();
  if (result.status !== 0 || !CODE_SHA.test(value)) fail("PRODUCTION_IMPORT_T0_TRIPLE_CODE_INVALID", "HEAD");
  return value;
}

function readSourceManifest(path) {
  let manifest;
  try { manifest = JSON.parse(readFileSync(path, "utf8")); } catch { fail("PRODUCTION_IMPORT_T0_TRIPLE_SOURCE_MANIFEST_INVALID", "JSON"); }
  try { verifyProductionSourceManifest(manifest); }
  catch { fail("PRODUCTION_IMPORT_T0_TRIPLE_SOURCE_MANIFEST_INVALID", "contract"); }
  return manifest;
}

function writePrivateNew(path, value) {
  if (!isAbsolute(path) || basename(path) !== path.split("/").at(-1) || existsSync(path)) fail("PRODUCTION_IMPORT_T0_TRIPLE_OUTPUT_INVALID", "output");
  requirePrivateDirectory(dirname(path), "output parent");
  writeFileSync(path, `${JSON.stringify(value)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
  chmodSync(path, 0o600);
  requirePrivateFile(path, "output");
}

/**
 * Derives the private C/S/M binding consumed by T0 source materialization.
 * It accepts only a verified hash-only source manifest and never opens a
 * database, reads staging rows, creates a plan, or writes business data.
 */
export function prepareProductionT0Triple({ sourceManifestPath, outputPath }, { head = currentHead } = {}) {
  const sourceManifest = readSourceManifest(requirePrivateFile(sourceManifestPath, "source manifest"));
  const codeSha = head();
  if (!CODE_SHA.test(codeSha) || !SHA256.test(sourceManifest.sourceSnapshotSha256 ?? "") || !SHA256.test(sourceManifest.mappingContractSha256 ?? "")) {
    fail("PRODUCTION_IMPORT_T0_TRIPLE_INPUT_INVALID", "C/S/M");
  }
  const triple = Object.freeze({ codeSha, sourceSnapshotHash: sourceManifest.sourceSnapshotSha256, mappingContractHash: sourceManifest.mappingContractSha256 });
  writePrivateNew(resolve(outputPath), triple);
  return Object.freeze({ status: "READY_FOR_REVIEW", tripleSha256: sha256(Buffer.from(`${JSON.stringify(triple)}\n`, "utf8")), productionImport: "HOLD" });
}

function parseArgs(argv) {
  const input = argv[0] === "--" ? argv.slice(1) : argv;
  if (input.length !== 4) fail("PRODUCTION_IMPORT_T0_TRIPLE_ARGUMENT_INVALID", "arguments");
  const values = {};
  for (let index = 0; index < input.length; index += 2) {
    const key = input[index];
    const value = input[index + 1];
    if (!value || !["--source-manifest", "--output"].includes(key) || values[key] || !isAbsolute(value)) fail("PRODUCTION_IMPORT_T0_TRIPLE_ARGUMENT_INVALID", "arguments");
    values[key] = resolve(value);
  }
  return { sourceManifestPath: values["--source-manifest"], outputPath: values["--output"] };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${JSON.stringify(prepareProductionT0Triple(parseArgs(process.argv.slice(2))))}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof ProductionT0TripleError ? error.code : "PRODUCTION_IMPORT_T0_TRIPLE_FAILED"}\n`);
    process.exitCode = 1;
  }
}
