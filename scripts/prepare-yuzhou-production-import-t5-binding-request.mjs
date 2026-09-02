#!/usr/bin/env node
import { existsSync, lstatSync, readFileSync, statSync, writeFileSync, chmodSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

const SHA256 = /^[0-9a-f]{64}$/u;
const CODE_SHA = /^[0-9a-f]{40}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SAFE_REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{5,63}$/u;
const TARGET_TABLES = Object.freeze(["hr_employee_profile", "hr_employee_family", "hr_employee_skill", "hr_employee_credential"]);

const fail = code => { const error = new Error(code); error.code = code; throw error; };
const object = value => value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const exactKeys = (value, required, label) => {
  if (!object(value) || required.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => !required.includes(key))) fail(`${label}_INVALID`);
};
const mode = path => (statSync(path).mode & 0o777).toString(8).padStart(3, "0");
const privateFile = path => {
  try { return lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink() && statSync(path).nlink === 1 && mode(path) === "600"; } catch { return false; }
};
const privateDirectory = path => {
  try { return lstatSync(path).isDirectory() && !lstatSync(path).isSymbolicLink() && mode(path) === "700"; } catch { return false; }
};
const readJson = (path, code) => {
  if (!privateFile(path)) fail(code);
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { fail(code); }
};

function validateTriple(value) {
  exactKeys(value, ["codeSha", "sourceSnapshotHash", "mappingContractHash"], "T5_BINDING_REQUEST_TRIPLE");
  if (!CODE_SHA.test(value.codeSha ?? "") || !SHA256.test(value.sourceSnapshotHash ?? "") || !SHA256.test(value.mappingContractHash ?? "")) fail("T5_BINDING_REQUEST_TRIPLE_INVALID");
  return structuredClone(value);
}

function validateReceipt(value, triple) {
  exactKeys(value, ["formatVersion", "artifactKind", "phase", "triple", "sourceSnapshotSha256", "sourceRestoreReceiptSha256", "sourceBusinessSha256", "privateStageSha256", "recordCount", "targetTableCounts", "productionImport"], "T5_BINDING_REQUEST_RECEIPT");
  if (value.formatVersion !== 1 || value.artifactKind !== "yuzhou_hr_production_import_t5_nonfile_private_stage_receipt" || value.phase !== "T5" || value.productionImport !== "HOLD" || JSON.stringify(value.triple) !== JSON.stringify(triple) || value.sourceSnapshotSha256 !== triple.sourceSnapshotHash || !SHA256.test(value.sourceRestoreReceiptSha256 ?? "") || !SHA256.test(value.sourceBusinessSha256 ?? "") || !SHA256.test(value.privateStageSha256 ?? "") || !Number.isSafeInteger(value.recordCount) || value.recordCount <= 0) fail("T5_BINDING_REQUEST_RECEIPT_INVALID");
  if (!object(value.targetTableCounts) || JSON.stringify(Object.keys(value.targetTableCounts).sort()) !== JSON.stringify([...TARGET_TABLES].sort())) fail("T5_BINDING_REQUEST_RECEIPT_INVALID");
  const count = TARGET_TABLES.reduce((total, table) => {
    const item = value.targetTableCounts[table];
    if (!object(item) || JSON.stringify(Object.keys(item).sort()) !== JSON.stringify(["insert", "quarantine"]) || !Number.isSafeInteger(item.insert) || item.insert < 0 || !Number.isSafeInteger(item.quarantine) || item.quarantine < 0) fail("T5_BINDING_REQUEST_RECEIPT_INVALID");
    return total + item.insert + item.quarantine;
  }, 0);
  if (count !== value.recordCount) fail("T5_BINDING_REQUEST_RECEIPT_INVALID");
  return Object.freeze({
    privateStageSha256: value.privateStageSha256,
    sourceSnapshotSha256: value.sourceSnapshotSha256,
    sourceRestoreReceiptSha256: value.sourceRestoreReceiptSha256,
    sourceBusinessSha256: value.sourceBusinessSha256,
    recordCount: value.recordCount,
  });
}

export function createT5ProductionBindingRequest({ triple, receipt, actorId }) {
  const verifiedTriple = validateTriple(triple);
  if (!UUID.test(actorId ?? "")) fail("T5_BINDING_REQUEST_ACTOR_INVALID");
  const t5Nonfile = { ...validateReceipt(receipt, verifiedTriple), actorId: actorId.toLowerCase() };
  return Object.freeze({
    formatVersion: 1,
    artifactKind: "yuzhou_hr_production_import_t5_nonfile_binding_request",
    phase: "T5",
    triple: verifiedTriple,
    t5Nonfile,
    authorizationBinding: { t5NonfilePrivateStageSha256: t5Nonfile.privateStageSha256 },
    requiredPlanFields: ["t5Nonfile", "authorization.binding.t5NonfilePrivateStageSha256", "rollback.order[0]=T5"],
    productionImport: "HOLD",
  });
}

export function parseT5ProductionBindingRequestArgs(argv) {
  const input = argv[0] === "--" ? argv.slice(1) : argv;
  const values = {};
  for (let index = 0; index < input.length; index += 2) {
    const key = input[index]; const value = input[index + 1];
    if (!new Set(["--receipt", "--triple", "--actor-id", "--output-dir", "--request-id"]).has(key) || !value || Object.hasOwn(values, key)) fail("T5_BINDING_REQUEST_ARGUMENT_INVALID");
    values[key] = value;
  }
  if (Object.keys(values).length !== 5 || !SAFE_REQUEST_ID.test(values["--request-id"] ?? "") || !UUID.test(values["--actor-id"] ?? "")) fail("T5_BINDING_REQUEST_ARGUMENT_INVALID");
  for (const key of ["--receipt", "--triple", "--output-dir"]) if (!isAbsolute(values[key])) fail("T5_BINDING_REQUEST_ARGUMENT_INVALID");
  return { receiptPath: resolve(values["--receipt"]), triplePath: resolve(values["--triple"]), actorId: values["--actor-id"].toLowerCase(), outputDir: resolve(values["--output-dir"]), requestId: values["--request-id"] };
}

/** Builds a signing input only. It has no source connection, DB connection, or activation path. */
export function prepareT5ProductionBindingRequest(input) {
  if (!input || !object(input) || JSON.stringify(Object.keys(input).sort()) !== JSON.stringify(["actorId", "outputDir", "receiptPath", "requestId", "triplePath"])) fail("T5_BINDING_REQUEST_INPUT_INVALID");
  if (!SAFE_REQUEST_ID.test(input.requestId ?? "") || !UUID.test(input.actorId ?? "")) fail("T5_BINDING_REQUEST_INPUT_INVALID");
  if (!privateDirectory(input.outputDir)) fail("T5_BINDING_REQUEST_OUTPUT_UNSAFE");
  const output = join(input.outputDir, `t5-binding-request-${input.requestId}.json`);
  if (existsSync(output)) fail("T5_BINDING_REQUEST_OUTPUT_EXISTS");
  const request = createT5ProductionBindingRequest({ triple: readJson(input.triplePath, "T5_BINDING_REQUEST_TRIPLE_UNSAFE"), receipt: readJson(input.receiptPath, "T5_BINDING_REQUEST_RECEIPT_UNSAFE"), actorId: input.actorId });
  writeFileSync(output, `${JSON.stringify(request)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  chmodSync(output, 0o600);
  if (!privateFile(output)) fail("T5_BINDING_REQUEST_OUTPUT_UNSAFE");
  return Object.freeze({ output, privateStageSha256: request.t5Nonfile.privateStageSha256, recordCount: request.t5Nonfile.recordCount, productionImport: "HOLD" });
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    const result = prepareT5ProductionBindingRequest(parseT5ProductionBindingRequestArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify({ status: "PASS", privateStageSha256: result.privateStageSha256, recordCount: result.recordCount, productionImport: result.productionImport })}\n`);
  } catch (error) {
    process.stderr.write(`${error?.code ?? "T5_BINDING_REQUEST_FAILED"}\n`);
    process.exitCode = 1;
  }
}
