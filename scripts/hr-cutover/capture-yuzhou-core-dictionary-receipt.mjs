#!/usr/bin/env node
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { resolve } from "node:path";

const SHA256 = /^[0-9a-f]{64}$/u;
const DICTIONARY_CODES = Object.freeze(["employment_event_state", "contract_type", "contract_state"]);
const fail = (code, detail) => { const error = new Error(`${code}: ${detail}`); error.code = code; throw error; };
const sha256 = value => createHash("sha256").update(value).digest("hex");
const canonical = value => `${JSON.stringify(value)}\n`;
const exactKeys = (value, keys, code) => {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail(code, "shape");
};

function privateJsonFile(path, label) {
  const requested = resolve(path);
  let link, actual, info;
  try { link = lstatSync(requested); actual = realpathSync(requested); info = statSync(actual); }
  catch { fail("CORE_DICTIONARY_CAPTURE_FILE_INVALID", `${label}:missing`); }
  if (link.isSymbolicLink() || !info.isFile() || info.nlink !== 1 || (info.mode & 0o777) !== 0o600) fail("CORE_DICTIONARY_CAPTURE_FILE_INVALID", label);
  try {
    const value = JSON.parse(readFileSync(actual, "utf8"));
    if (!Array.isArray(value)) fail("CORE_DICTIONARY_CAPTURE_FILE_INVALID", `${label}:array`);
    return value;
  } catch (error) {
    if (error?.code) throw error;
    fail("CORE_DICTIONARY_CAPTURE_FILE_INVALID", `${label}:json`);
  }
}

function captureStates(rows, { sourceObject, sourceRecordCount, sourceDistinctValueCount }) {
  const values = new Set();
  const normalized = rows.map(row => {
    exactKeys(row, ["sourceValue", "usageCount"], "CORE_DICTIONARY_CAPTURE_ROW_INVALID");
    if ((row.sourceValue !== null && (typeof row.sourceValue !== "string" || !row.sourceValue))
      || !Number.isSafeInteger(row.usageCount) || row.usageCount < 1) fail("CORE_DICTIONARY_CAPTURE_ROW_INVALID", sourceObject);
    const sourceValue = row.sourceValue === null ? "<NULL>" : row.sourceValue;
    if (values.has(sourceValue)) fail("CORE_DICTIONARY_CAPTURE_DUPLICATE_VALUE", sourceObject);
    values.add(sourceValue);
    return { sourceValue: row.sourceValue, usageCount: row.usageCount };
  }).sort((left, right) => String(left.sourceValue).localeCompare(String(right.sourceValue), "zh-CN"));
  const total = normalized.reduce((sum, row) => sum + row.usageCount, 0);
  if (total !== sourceRecordCount || normalized.length !== sourceDistinctValueCount) fail("CORE_DICTIONARY_CAPTURE_COUNT_DRIFT", sourceObject);
  return { sourceObject, sourceRecordCount: total, sourceDistinctValueCount: normalized.length, sourceItemsSha256: sha256(canonical(normalized)) };
}

function captureContractTypes(rows) {
  const codes = new Set(), names = new Set();
  const normalized = rows.map(row => {
    exactKeys(row, ["typeName", "typeCode"], "CORE_DICTIONARY_CAPTURE_ROW_INVALID");
    if (typeof row.typeName !== "string" || !row.typeName || typeof row.typeCode !== "string" || !row.typeCode
      || codes.has(row.typeCode) || names.has(row.typeName)) fail("CORE_DICTIONARY_CAPTURE_DUPLICATE_VALUE", "dbo.compacttypecode");
    codes.add(row.typeCode); names.add(row.typeName);
    return { typeCode: row.typeCode, typeName: row.typeName };
  }).sort((left, right) => left.typeCode.localeCompare(right.typeCode, "zh-CN") || left.typeName.localeCompare(right.typeName, "zh-CN"));
  if (normalized.length !== 4) fail("CORE_DICTIONARY_CAPTURE_COUNT_DRIFT", "dbo.compacttypecode");
  return { sourceObject: "dbo.compacttypecode", sourceRecordCount: 4, sourceDistinctValueCount: 4, sourceItemsSha256: sha256(canonical(normalized)) };
}

export function sealCoreDictionaryCapture(input) {
  exactKeys(input, ["formatVersion", "artifactKind", "sourceSnapshotSha256", "dictionaries", "productionImport"], "CORE_DICTIONARY_CAPTURE_INVALID");
  if (input.formatVersion !== 1 || input.artifactKind !== "yuzhou_core_dictionary_capture_receipt"
    || !SHA256.test(input.sourceSnapshotSha256 ?? "") || input.productionImport !== "HOLD") fail("CORE_DICTIONARY_CAPTURE_INVALID", "identity");
  exactKeys(input.dictionaries, DICTIONARY_CODES, "CORE_DICTIONARY_CAPTURE_INVALID");
  const expected = {
    employment_event_state: ["dbo.readjust.state", 6887, 2],
    contract_type: ["dbo.compacttypecode", 4, 4],
    contract_state: ["dbo.compact.state", 802, 2]
  };
  for (const [dictionaryCode, [sourceObject, sourceRecordCount, sourceDistinctValueCount]] of Object.entries(expected)) {
    const capture = input.dictionaries[dictionaryCode];
    exactKeys(capture, ["sourceObject", "sourceRecordCount", "sourceDistinctValueCount", "sourceItemsSha256"], "CORE_DICTIONARY_CAPTURE_INVALID");
    if (capture.sourceObject !== sourceObject || capture.sourceRecordCount !== sourceRecordCount
      || capture.sourceDistinctValueCount !== sourceDistinctValueCount || !SHA256.test(capture.sourceItemsSha256 ?? "")) fail("CORE_DICTIONARY_CAPTURE_INVALID", dictionaryCode);
  }
  return { ...input, captureSha256: sha256(canonical(input)) };
}

export function verifyCoreDictionaryCapture(receipt) {
  exactKeys(receipt, ["formatVersion", "artifactKind", "sourceSnapshotSha256", "dictionaries", "productionImport", "captureSha256"], "CORE_DICTIONARY_CAPTURE_INVALID");
  const { captureSha256, ...body } = receipt;
  const sealed = sealCoreDictionaryCapture(body);
  if (captureSha256 !== sealed.captureSha256) fail("CORE_DICTIONARY_CAPTURE_TAMPERED", "capture hash");
  return receipt;
}

export function captureCoreDictionaryReceipt({ sourceSnapshotSha256, eventStatePath, contractTypePath, contractStatePath }) {
  if (!SHA256.test(sourceSnapshotSha256 ?? "")) fail("CORE_DICTIONARY_CAPTURE_INVALID", "source snapshot");
  return sealCoreDictionaryCapture({
    formatVersion: 1,
    artifactKind: "yuzhou_core_dictionary_capture_receipt",
    sourceSnapshotSha256,
    dictionaries: {
      employment_event_state: captureStates(privateJsonFile(eventStatePath, "employment event state"), { sourceObject: "dbo.readjust.state", sourceRecordCount: 6887, sourceDistinctValueCount: 2 }),
      contract_type: captureContractTypes(privateJsonFile(contractTypePath, "contract type")),
      contract_state: captureStates(privateJsonFile(contractStatePath, "contract state"), { sourceObject: "dbo.compact.state", sourceRecordCount: 802, sourceDistinctValueCount: 2 })
    },
    productionImport: "HOLD"
  });
}

function parseArgs(argv) {
  const names = new Map([["--source-snapshot", "sourceSnapshotSha256"], ["--event-state", "eventStatePath"], ["--contract-type", "contractTypePath"], ["--contract-state", "contractStatePath"]]);
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index], name = names.get(key);
    if (!name || !argv[index + 1] || Object.hasOwn(args, name)) fail("CORE_DICTIONARY_CAPTURE_ARGUMENT_INVALID", key ?? "missing");
    args[name] = argv[index + 1];
  }
  if (argv.length !== names.size * 2 || [...names.values()].some(name => !args[name])) fail("CORE_DICTIONARY_CAPTURE_ARGUMENT_INVALID", "required arguments");
  return args;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  try { process.stdout.write(`${JSON.stringify(captureCoreDictionaryReceipt(parseArgs(process.argv.slice(2))))}\n`); }
  catch (error) { process.stderr.write(`${error.code ?? "CORE_DICTIONARY_CAPTURE_FAILED"}\n`); process.exitCode = 1; }
}
