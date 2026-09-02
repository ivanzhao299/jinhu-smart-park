import { createHash } from "node:crypto";

import { computeProductionImportPayloadHash } from "./production-import-sealed-plan-lib.mjs";
import { adaptT5NonfilePrivateStage, projectT5NonfileStagedRecord } from "./production-import-t5-nonfile-stage-adapter.mjs";

const SHA256 = /^[0-9a-f]{64}$/u;
const CODE_SHA = /^[0-9a-f]{40}$/u;
const STAGE_DOMAINS = Object.freeze(["family", "knowhow", "person_core", "ticket"]);
const TARGET_TABLES = Object.freeze(["hr_employee_profile", "hr_employee_family", "hr_employee_skill", "hr_employee_credential"]);

export class ProductionImportT5NonfilePrivateStageError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "ProductionImportT5NonfilePrivateStageError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new ProductionImportT5NonfilePrivateStageError(code, detail); };
const object = value => value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const exactKeys = (value, required, optional, label) => {
  if (!object(value)) fail("PRODUCTION_IMPORT_T5_NONFILE_PRIVATE_STAGE_INVALID", `${label} must be an object`);
  const allowed = new Set([...required, ...optional]);
  if (required.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => !allowed.has(key))) fail("PRODUCTION_IMPORT_T5_NONFILE_PRIVATE_STAGE_INVALID", `${label} keys differ`);
};

function validateTriple(value) {
  exactKeys(value, ["codeSha", "sourceSnapshotHash", "mappingContractHash"], [], "triple");
  if (!CODE_SHA.test(value.codeSha ?? "") || !SHA256.test(value.sourceSnapshotHash ?? "") || !SHA256.test(value.mappingContractHash ?? "")) fail("PRODUCTION_IMPORT_T5_NONFILE_PRIVATE_STAGE_INVALID", "triple invalid");
}

function validateStageManifest(value, triple) {
  exactKeys(value, ["artifactKind", "sourceSnapshotSha256", "sourceRestoreReceiptSha256", "nonfileBusinessSha256", "domains", "filesExcluded", "productionImport"], [], "stage manifest");
  if (value.artifactKind !== "yuzhou_t5_nonfile_materialization_stage" || value.sourceSnapshotSha256 !== triple.sourceSnapshotHash || !SHA256.test(value.sourceRestoreReceiptSha256 ?? "") || !SHA256.test(value.nonfileBusinessSha256 ?? "") || value.productionImport !== "HOLD" || JSON.stringify(value.filesExcluded) !== JSON.stringify(["photo", "docs"]) || JSON.stringify(Object.keys(value.domains).sort()) !== JSON.stringify(STAGE_DOMAINS)) {
    fail("PRODUCTION_IMPORT_T5_NONFILE_PRIVATE_STAGE_INVALID", "stage manifest binding invalid");
  }
}

function receipt(privateStage) {
  const domains = Object.fromEntries(TARGET_TABLES.map(table => [table, { insert: 0, quarantine: 0 }]));
  for (const record of privateStage.records) domains[record.targetTable][record.disposition] += 1;
  return Object.freeze({
    formatVersion: 1,
    artifactKind: "yuzhou_hr_production_import_t5_nonfile_private_stage_receipt",
    phase: "T5",
    triple: structuredClone(privateStage.triple),
    sourceSnapshotSha256: privateStage.sourceSnapshotHash,
    sourceRestoreReceiptSha256: privateStage.sourceRestoreReceiptSha256,
    sourceBusinessSha256: privateStage.sourceBusinessSha256,
    privateStageSha256: computeProductionImportPayloadHash(privateStage),
    recordCount: privateStage.records.length,
    targetTableCounts: domains,
    productionImport: "HOLD",
  });
}

/**
 * Produces a private, production-bound T5 artifact from reviewed staged rows.
 * The caller owns storage: this function never logs, returns source objects,
 * opens a connection, or provides an activation path.
 */
export function createT5NonfilePrivateStage(input) {
  exactKeys(input, ["triple", "stageManifest", "employeeIndex", "records"], [], "input");
  validateTriple(input.triple);
  validateStageManifest(input.stageManifest, input.triple);
  if (!Array.isArray(input.records)) fail("PRODUCTION_IMPORT_T5_NONFILE_PRIVATE_STAGE_INVALID", "records must be an array");
  let projected;
  try {
    projected = input.records.map(projectT5NonfileStagedRecord);
  } catch (error) {
    fail("PRODUCTION_IMPORT_T5_NONFILE_PRIVATE_STAGE_INVALID", error?.code ?? "staged row invalid");
  }
  let privateStage;
  try {
    privateStage = adaptT5NonfilePrivateStage({
      triple: structuredClone(input.triple),
      stageManifest: {
        sourceSnapshotHash: input.stageManifest.sourceSnapshotSha256,
        sourceRestoreReceiptSha256: input.stageManifest.sourceRestoreReceiptSha256,
        nonfileBusinessSha256: input.stageManifest.nonfileBusinessSha256,
        productionImport: "HOLD",
      },
      employeeIndex: structuredClone(input.employeeIndex),
      records: projected,
    });
  } catch (error) {
    fail("PRODUCTION_IMPORT_T5_NONFILE_PRIVATE_STAGE_INVALID", error?.code ?? "adapter rejected stage");
  }
  if (privateStage.records.length !== projected.length || privateStage.records.some(record => Object.hasOwn(record, "source"))) fail("PRODUCTION_IMPORT_T5_NONFILE_PRIVATE_STAGE_INVALID", "source projection invalid");
  return Object.freeze({ privateStage: Object.freeze(privateStage), receipt: receipt(privateStage) });
}
