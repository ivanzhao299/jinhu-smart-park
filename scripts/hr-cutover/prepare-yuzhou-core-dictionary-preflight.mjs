#!/usr/bin/env node
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { captureCoreDictionaryReceipt, verifyCoreDictionaryCapture } from "./capture-yuzhou-core-dictionary-receipt.mjs";
import { verifyCoreDictionaryCaptureBinding } from "./verify-yuzhou-core-dictionary-preflight.mjs";
import { verifyT1EventTypeDecision } from "./verify-yuzhou-t1-event-type-decision.mjs";

const SHA256 = /^[0-9a-f]{64}$/u;
const mode = path => (statSync(path).mode & 0o777).toString(8).padStart(4, "0");
const fail = code => { throw new Error(code); };

function privateJson(path, label) {
  const requested = resolve(path);
  if (!existsSync(requested) || lstatSync(requested).isSymbolicLink() || !statSync(requested).isFile() || mode(requested) !== "0600") fail(`CORE_DICTIONARY_INPUT_UNSAFE:${label}`);
  try { return JSON.parse(readFileSync(requested, "utf8")); } catch { fail(`CORE_DICTIONARY_INPUT_INVALID:${label}`); }
}

function json(path, label) {
  const requested = resolve(path);
  if (!existsSync(requested) || lstatSync(requested).isSymbolicLink() || !statSync(requested).isFile()) fail(`CORE_DICTIONARY_INPUT_UNSAFE:${label}`);
  try { return JSON.parse(readFileSync(requested, "utf8")); } catch { fail(`CORE_DICTIONARY_INPUT_INVALID:${label}`); }
}

function privateRoot(path) {
  const root = resolve(path);
  if (!existsSync(root)) mkdirSync(root, { recursive: true, mode: 0o700 });
  if (lstatSync(root).isSymbolicLink() || !statSync(root).isDirectory() || mode(root) !== "0700") fail("CORE_DICTIONARY_OUTPUT_ROOT_UNSAFE");
  return root;
}

function writePrivate(path, value) {
  if (existsSync(path)) fail("CORE_DICTIONARY_OUTPUT_EXISTS");
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  chmodSync(path, 0o600);
  if (mode(path) !== "0600") fail("CORE_DICTIONARY_OUTPUT_UNSAFE");
}

function genericPackage({ dictionaryCode, sourceObject, sourceSnapshotSha256, sourceCaptureSha256, decisions }) {
  return { formatVersion: 1, artifactKind: "yuzhou_hr_dictionary_machine_decision", sourceSystem: "yuzhou-v10", sourceSnapshotSha256, sourceCaptureSha256, dictionaryCode, sourceObject, sourceRecordCount: decisions.reduce((total, row) => total + row.usageCount, 0), decisions, productionImport: "HOLD" };
}

// These packages prove source coverage and binding only. Semantic translation
// remains separately verified in materialize-core-non-t0-dictionaries.
function sourceBoundDecision(dictionaryCode, row, { sourceValue, sourceName = null, usageCount }) {
  if ((sourceValue !== null && (typeof sourceValue !== "string" || !sourceValue)) || (sourceName !== null && (typeof sourceName !== "string" || !sourceName)) || !Number.isSafeInteger(usageCount) || usageCount < 1) fail(`CORE_DICTIONARY_SOURCE_ROW_INVALID:${dictionaryCode}`);
  return { sourceValue, sourceName, usageCount, decision: "map", targetDomain: dictionaryCode, targetValue: sourceValue ?? sourceName ?? row.typeCode, reasonCode: "SOURCE_CAPTURE_BOUND_ONLY" };
}

export function prepareCoreDictionaryPreflight({ sourceSnapshotSha256, eventTypePackagePath, eventStatePath, contractTypePath, contractStatePath, outputRoot }) {
  if (!SHA256.test(sourceSnapshotSha256 ?? "")) fail("CORE_DICTIONARY_SOURCE_SNAPSHOT_INVALID");
  const eventType = json(eventTypePackagePath, "employment_event_type");
  if (verifyT1EventTypeDecision(eventType).sourceSnapshotSha256 !== sourceSnapshotSha256) fail("CORE_DICTIONARY_EVENT_TYPE_SOURCE_DRIFT");
  const receipt = captureCoreDictionaryReceipt({ sourceSnapshotSha256, eventStatePath, contractTypePath, contractStatePath });
  const eventStates = privateJson(eventStatePath, "employment_event_state");
  const contractTypes = privateJson(contractTypePath, "contract_type");
  const contractStates = privateJson(contractStatePath, "contract_state");
  const packages = {
    employment_event_type: eventType,
    employment_event_state: genericPackage({ dictionaryCode: "employment_event_state", sourceObject: "dbo.readjust.state", sourceSnapshotSha256, sourceCaptureSha256: receipt.captureSha256, decisions: eventStates.map(row => sourceBoundDecision("employment_event_state", row, row)) }),
    contract_type: genericPackage({ dictionaryCode: "contract_type", sourceObject: "dbo.compacttypecode", sourceSnapshotSha256, sourceCaptureSha256: receipt.captureSha256, decisions: contractTypes.map(row => sourceBoundDecision("contract_type", row, { sourceValue: row.typeCode, sourceName: row.typeName, usageCount: 1 })) }),
    contract_state: genericPackage({ dictionaryCode: "contract_state", sourceObject: "dbo.compact.state", sourceSnapshotSha256, sourceCaptureSha256: receipt.captureSha256, decisions: contractStates.map(row => sourceBoundDecision("contract_state", row, row)) })
  };
  verifyCoreDictionaryCapture(receipt);
  verifyCoreDictionaryCaptureBinding(packages, receipt);
  const root = privateRoot(outputRoot);
  const paths = { eventTypePackage: resolve(root, "employment-event-type-decision.json"), eventStatePackage: resolve(root, "employment-event-state-decision.json"), contractTypePackage: resolve(root, "contract-type-decision.json"), contractStatePackage: resolve(root, "contract-state-decision.json"), dictionaryCaptureReceipt: resolve(root, "dictionary-capture-receipt.json") };
  for (const path of Object.values(paths)) if (!path.startsWith(`${root}/`)) fail("CORE_DICTIONARY_OUTPUT_PATH_UNSAFE");
  writePrivate(paths.eventTypePackage, packages.employment_event_type);
  writePrivate(paths.eventStatePackage, packages.employment_event_state);
  writePrivate(paths.contractTypePackage, packages.contract_type);
  writePrivate(paths.contractStatePackage, packages.contract_state);
  writePrivate(paths.dictionaryCaptureReceipt, receipt);
  return { ...paths, sourceSnapshotSha256, captureSha256: receipt.captureSha256, packageCount: 4, productionImport: "HOLD" };
}

function parseArgs(argv) {
  const names = new Map([["--source-snapshot", "sourceSnapshotSha256"], ["--event-type-package", "eventTypePackagePath"], ["--event-state", "eventStatePath"], ["--contract-type", "contractTypePath"], ["--contract-state", "contractStatePath"], ["--output-root", "outputRoot"]]);
  const args = {};
  for (let index = 0; index < argv.length; index += 2) { const key = argv[index], name = names.get(key); if (!name || !argv[index + 1] || Object.hasOwn(args, name)) fail("CORE_DICTIONARY_ARGUMENT_INVALID"); args[name] = argv[index + 1]; }
  if (argv.length !== names.size * 2 || [...names.values()].some(name => !args[name])) fail("CORE_DICTIONARY_ARGUMENT_INVALID");
  return args;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const result = prepareCoreDictionaryPreflight(parseArgs(process.argv.slice(2))); process.stdout.write(`${JSON.stringify({ status: "PASS", packageCount: result.packageCount, productionImport: result.productionImport })}\n`); }
  catch (error) { process.stderr.write(`${String(error.message).split(":")[0]}\n`); process.exitCode = 1; }
}
