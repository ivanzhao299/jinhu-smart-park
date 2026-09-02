#!/usr/bin/env node
import { existsSync, lstatSync, mkdirSync, readFileSync, statSync, writeFileSync, chmodSync, unlinkSync, rmdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

import { createT5NonfilePrivateStage, ProductionImportT5NonfilePrivateStageError } from "./hr-cutover/production-import-t5-nonfile-private-stage.mjs";

const SHA256 = /^[0-9a-f]{64}$/u;
const STAGE_DOMAINS = Object.freeze(["family", "knowhow", "person_core", "ticket"]);
const SAFE_RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{5,63}$/u;

const fail = code => { const error = new Error(code); error.code = code; throw error; };
const mode = path => (statSync(path).mode & 0o777).toString(8).padStart(3, "0");
const privateFile = path => {
  try { return lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink() && statSync(path).nlink === 1 && mode(path) === "600"; } catch { return false; }
};
const privateDirectory = path => {
  try { return lstatSync(path).isDirectory() && !lstatSync(path).isSymbolicLink() && mode(path) === "700"; } catch { return false; }
};
const sha256 = path => createHash("sha256").update(readFileSync(path)).digest("hex");
const parseJson = (path, code) => {
  if (!privateFile(path)) fail(code);
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { fail(code); }
};

export function parseT5ProductionPrivateStageArgs(argv) {
  const input = argv[0] === "--" ? argv.slice(1) : argv;
  const values = {};
  for (let index = 0; index < input.length; index += 2) {
    const key = input[index];
    const value = input[index + 1];
    if (!new Set(["--stage", "--employee-index", "--triple", "--output-root", "--run-id"]).has(key) || !value || Object.hasOwn(values, key)) fail("T5_PRIVATE_STAGE_ARGUMENT_INVALID");
    values[key] = value;
  }
  if (!Object.keys(values).every(key => ["--stage", "--employee-index", "--triple", "--output-root", "--run-id"].includes(key)) || Object.keys(values).length !== 5 || !SAFE_RUN_ID.test(values["--run-id"] ?? "")) fail("T5_PRIVATE_STAGE_ARGUMENT_INVALID");
  for (const key of ["--stage", "--employee-index", "--triple", "--output-root"]) if (!isAbsolute(values[key])) fail("T5_PRIVATE_STAGE_ARGUMENT_INVALID");
  return { stagePath: resolve(values["--stage"]), employeeIndexPath: resolve(values["--employee-index"]), triplePath: resolve(values["--triple"]), outputRoot: resolve(values["--output-root"]), runId: values["--run-id"] };
}

function readStage(stagePath) {
  if (!privateDirectory(stagePath)) fail("T5_PRIVATE_STAGE_SOURCE_UNSAFE");
  const manifest = parseJson(join(stagePath, "manifest.json"), "T5_PRIVATE_STAGE_MANIFEST_INVALID");
  if (manifest.artifactKind !== "yuzhou_t5_nonfile_materialization_stage" || manifest.productionImport !== "HOLD" || !Number.isSafeInteger(manifest.sourceRows) || manifest.sourceRows <= 0 || !SHA256.test(manifest.sourceSnapshotSha256 ?? "") || !SHA256.test(manifest.sourceRestoreReceiptSha256 ?? "") || !SHA256.test(manifest.nonfileBusinessSha256 ?? "") || JSON.stringify(manifest.filesExcluded) !== JSON.stringify(["photo", "docs"]) || JSON.stringify(Object.keys(manifest.domains ?? {}).sort()) !== JSON.stringify(STAGE_DOMAINS)) fail("T5_PRIVATE_STAGE_MANIFEST_INVALID");
  const records = [];
  for (const domain of STAGE_DOMAINS) {
    const item = manifest.domains[domain];
    const file = join(stagePath, item?.file ?? "");
    if (!item || typeof item.file !== "string" || !SHA256.test(item.fileSha256 ?? "") || basename(file) !== item.file || !privateFile(file) || sha256(file) !== item.fileSha256) fail("T5_PRIVATE_STAGE_SOURCE_UNSAFE");
    const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
    if (!Number.isSafeInteger(item.rows) || item.rows < 0 || lines.length !== item.rows) fail("T5_PRIVATE_STAGE_ROW_COUNT_INVALID");
    try { records.push(...lines.map(line => JSON.parse(line))); } catch { fail("T5_PRIVATE_STAGE_ROW_INVALID"); }
  }
  if (records.length !== manifest.sourceRows) fail("T5_PRIVATE_STAGE_ROW_COUNT_INVALID");
  return { manifest, records };
}

function writePrivate(path, value) {
  writeFileSync(path, `${JSON.stringify(value)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  chmodSync(path, 0o600);
  if (!privateFile(path)) fail("T5_PRIVATE_STAGE_OUTPUT_UNSAFE");
}

/**
 * Creates a new 0700 run directory containing a private T5 payload and an
 * aggregate-only receipt. It deliberately has no database connection and does
 * not activate or import data.
 */
export function prepareT5ProductionPrivateStage(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) || JSON.stringify(Object.keys(input).sort()) !== JSON.stringify(["employeeIndexPath", "outputRoot", "runId", "stagePath", "triplePath"])) fail("T5_PRIVATE_STAGE_INPUT_INVALID");
  if (!SAFE_RUN_ID.test(input.runId ?? "")) fail("T5_PRIVATE_STAGE_INPUT_INVALID");
  const stage = readStage(input.stagePath);
  const employeeIndex = parseJson(input.employeeIndexPath, "T5_PRIVATE_STAGE_EMPLOYEE_INDEX_INVALID");
  const triple = parseJson(input.triplePath, "T5_PRIVATE_STAGE_TRIPLE_INVALID");
  const outputRoot = resolve(input.outputRoot);
  if (existsSync(outputRoot) && !privateDirectory(outputRoot)) fail("T5_PRIVATE_STAGE_OUTPUT_UNSAFE");
  if (!existsSync(outputRoot)) { mkdirSync(outputRoot, { recursive: true, mode: 0o700 }); chmodSync(outputRoot, 0o700); }
  const output = join(outputRoot, `t5-private-${input.runId}`);
  if (existsSync(output)) fail("T5_PRIVATE_STAGE_OUTPUT_EXISTS");
  mkdirSync(output, { mode: 0o700 }); chmodSync(output, 0o700);
  try {
    const generated = createT5NonfilePrivateStage({
      triple,
      stageManifest: {
        artifactKind: stage.manifest.artifactKind,
        sourceSnapshotSha256: stage.manifest.sourceSnapshotSha256,
        sourceRestoreReceiptSha256: stage.manifest.sourceRestoreReceiptSha256,
        nonfileBusinessSha256: stage.manifest.nonfileBusinessSha256,
        domains: stage.manifest.domains,
        filesExcluded: stage.manifest.filesExcluded,
        productionImport: stage.manifest.productionImport,
      },
      employeeIndex,
      records: stage.records,
    });
    writePrivate(join(output, "private-stage.json"), generated.privateStage);
    writePrivate(join(output, "receipt.json"), generated.receipt);
    return Object.freeze({ output, privateStageSha256: generated.receipt.privateStageSha256, recordCount: generated.receipt.recordCount, productionImport: "HOLD" });
  } catch (error) {
    // Do not surface source values or leave a partially-written usable payload.
    for (const file of ["private-stage.json", "receipt.json"]) {
      const path = join(output, file);
      if (existsSync(path) && privateFile(path)) unlinkSync(path);
    }
    if (existsSync(output) && privateDirectory(output)) rmdirSync(output);
    if (error instanceof ProductionImportT5NonfilePrivateStageError) fail(error.code);
    fail(error?.code ?? "T5_PRIVATE_STAGE_GENERATION_FAILED");
  }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    const result = prepareT5ProductionPrivateStage(parseT5ProductionPrivateStageArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify({ status: "PASS", privateStageSha256: result.privateStageSha256, recordCount: result.recordCount, productionImport: result.productionImport })}\n`);
  } catch (error) {
    process.stderr.write(`${error?.code ?? "T5_PRIVATE_STAGE_FAILED"}\n`);
    process.exitCode = 1;
  }
}
