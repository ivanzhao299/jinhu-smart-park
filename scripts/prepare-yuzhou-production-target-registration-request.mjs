#!/usr/bin/env node
import { chmodSync, existsSync, lstatSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { createHash } from "node:crypto";

const SHA256 = /^[0-9a-f]{64}$/u;
const SAFE_REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{5,63}$/u;

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

function readPrivateAttestation(path) {
  if (!privateFile(path)) fail("PRODUCTION_TARGET_REGISTRATION_ATTESTATION_UNSAFE");
  const bytes = readFileSync(path);
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); } catch { fail("PRODUCTION_TARGET_REGISTRATION_ATTESTATION_INVALID"); }
  return { value, sha256: createHash("sha256").update(bytes).digest("hex") };
}

function validateAttestation(value) {
  exactKeys(value, ["formatVersion", "kind", "status", "productionImport", "executionReachable", "scopeAssignmentCount", "validScopeCount", "targetIdentitySha256", "targetScopeSha256", "reasonCodes"], "PRODUCTION_TARGET_REGISTRATION_ATTESTATION");
  if (value.formatVersion !== 1 || value.kind !== "yuzhou_hr_production_target_readonly_attestation" || value.status !== "HOLD" || value.productionImport !== "HOLD" || value.executionReachable !== false || value.scopeAssignmentCount !== 1 || value.validScopeCount !== 1 || !SHA256.test(value.targetIdentitySha256 ?? "") || !SHA256.test(value.targetScopeSha256 ?? "") || JSON.stringify(value.reasonCodes) !== JSON.stringify(["PRODUCTION_IMPORT_TARGET_NOT_ALLOWLISTED", "PRODUCTION_IMPORT_PREBACKUP_RECEIPT_REQUIRED"])) fail("PRODUCTION_TARGET_REGISTRATION_ATTESTATION_INVALID");
  return Object.freeze({ targetIdentitySha256: value.targetIdentitySha256, targetScopeSha256: value.targetScopeSha256 });
}

/**
 * Creates a private signing input only. It cannot alter the repository allowlist,
 * create a backup, connect to a database, or enable a production writer.
 */
export function createProductionTargetRegistrationRequest({ attestation, attestationSha256 }) {
  if (!SHA256.test(attestationSha256 ?? "")) fail("PRODUCTION_TARGET_REGISTRATION_ATTESTATION_INVALID");
  const target = validateAttestation(attestation);
  return Object.freeze({
    formatVersion: 1,
    artifactKind: "yuzhou_hr_production_target_registration_request",
    attestationSha256,
    target,
    preparedBy: "machine_policy_engine",
    requestedAction: "separate_allowlist_review_required",
    requiredNextEvidence: ["current_production_prebackup_receipt", "t0_t3_before_image_snapshots", "t0_t3_active_legacy_record_map_snapshots"],
    productionImport: "HOLD",
    executionReachable: false,
  });
}

export function parseProductionTargetRegistrationRequestArgs(argv) {
  const input = argv[0] === "--" ? argv.slice(1) : argv;
  const values = {};
  for (let index = 0; index < input.length; index += 2) {
    const key = input[index]; const value = input[index + 1];
    if (!new Set(["--attestation", "--output-dir", "--request-id"]).has(key) || !value || Object.hasOwn(values, key)) fail("PRODUCTION_TARGET_REGISTRATION_ARGUMENT_INVALID");
    values[key] = value;
  }
  if (Object.keys(values).length !== 3 || !SAFE_REQUEST_ID.test(values["--request-id"] ?? "")) fail("PRODUCTION_TARGET_REGISTRATION_ARGUMENT_INVALID");
  for (const key of ["--attestation", "--output-dir"]) if (!isAbsolute(values[key])) fail("PRODUCTION_TARGET_REGISTRATION_ARGUMENT_INVALID");
  return { attestationPath: resolve(values["--attestation"]), outputDir: resolve(values["--output-dir"]), requestId: values["--request-id"] };
}

export function prepareProductionTargetRegistrationRequest(input) {
  if (!input || !object(input) || JSON.stringify(Object.keys(input).sort()) !== JSON.stringify(["attestationPath", "outputDir", "requestId"])) fail("PRODUCTION_TARGET_REGISTRATION_INPUT_INVALID");
  if (!SAFE_REQUEST_ID.test(input.requestId ?? "")) fail("PRODUCTION_TARGET_REGISTRATION_INPUT_INVALID");
  if (!privateDirectory(input.outputDir)) fail("PRODUCTION_TARGET_REGISTRATION_OUTPUT_UNSAFE");
  const output = join(input.outputDir, `production-target-registration-request-${input.requestId}.json`);
  if (existsSync(output)) fail("PRODUCTION_TARGET_REGISTRATION_OUTPUT_EXISTS");
  const { value: attestation, sha256: attestationSha256 } = readPrivateAttestation(input.attestationPath);
  const request = createProductionTargetRegistrationRequest({ attestation, attestationSha256 });
  writeFileSync(output, `${JSON.stringify(request)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  chmodSync(output, 0o600);
  if (!privateFile(output)) fail("PRODUCTION_TARGET_REGISTRATION_OUTPUT_UNSAFE");
  return Object.freeze({ output, productionImport: "HOLD", executionReachable: false });
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    const result = prepareProductionTargetRegistrationRequest(parseProductionTargetRegistrationRequestArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify({ status: "PASS", registration: "HOLD", productionImport: result.productionImport, executionReachable: result.executionReachable })}\n`);
  } catch (error) {
    process.stderr.write(`${error?.code ?? "PRODUCTION_TARGET_REGISTRATION_FAILED"}\n`);
    process.exitCode = 1;
  }
}
