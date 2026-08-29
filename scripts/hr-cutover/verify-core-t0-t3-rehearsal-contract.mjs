/* global process */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const stable = value => `${JSON.stringify(value, null, 2)}\n`;
const fail = (code, message) => { const error = new Error(message); error.code = code; throw error; };
const exact = (actual, expected, code) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(code, "contract value drifted");
};

export function verifyCoreT0T3RehearsalContract(contract) {
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) fail("CORE_T0_T3_CONTRACT_INVALID", "contract must be an object");
  exact(Object.keys(contract), ["formatVersion", "profile", "executionStatus", "domainOrder", "rollbackOrder", "forbiddenDomains", "requiredStages", "sourceAuthority", "machineGate", "resourceIsolation", "residualClasses", "requiredFinalState", "productionImport"], "CORE_T0_T3_CONTRACT_INVALID");
  if (contract.formatVersion !== 1 || contract.profile !== "core_t0_t3" || contract.executionStatus !== "SPEC_FROZEN") fail("CORE_T0_T3_IDENTITY_INVALID", "contract identity drifted");
  exact(contract.domainOrder, ["T0", "T1", "T2", "T3"], "CORE_T0_T3_DOMAIN_ORDER_INVALID");
  exact(contract.rollbackOrder, ["T3", "T2", "T1", "T0"], "CORE_T0_T3_ROLLBACK_ORDER_INVALID");
  exact(contract.forbiddenDomains, ["T4", "T5"], "CORE_T0_T3_FORBIDDEN_DOMAIN_INVALID");
  exact(contract.requiredStages, ["provision", "extract_t0_t3", "machine_review_hold", "resume_t0_t3", "core_facts", "pair_compare", "rollback_t3_t0", "cleanup"], "CORE_T0_T3_STAGE_ORDER_INVALID");
  exact(contract.sourceAuthority, { readOnly: true, snapshotBinding: "source_backup_sha256", requiresT4Evidence: false, requiresT5MaterializationKey: false }, "CORE_T0_T3_SOURCE_AUTHORITY_INVALID");
  exact(contract.machineGate, { checkpointVersion: 2, decisionKind: "MACHINE_CANDIDATE", requiredArtifactsPerRehearsal: ["decision", "private_payload", "machine_attestation"], trustedRootExternal: true, legacyV1Writable: false }, "CORE_T0_T3_MACHINE_GATE_INVALID");
  if (!Array.isArray(contract.resourceIsolation) || new Set(contract.resourceIsolation).size !== contract.resourceIsolation.length || contract.resourceIsolation.length !== 12) fail("CORE_T0_T3_RESOURCE_ISOLATION_INVALID", "resource isolation set drifted");
  if (!Array.isArray(contract.residualClasses) || new Set(contract.residualClasses).size !== contract.residualClasses.length || contract.residualClasses.length !== 13) fail("CORE_T0_T3_RESIDUAL_CLASSES_INVALID", "residual classes drifted");
  exact(contract.requiredFinalState, { state: "cleaned", residualCount: 0 }, "CORE_T0_T3_FINAL_STATE_INVALID");
  if (contract.productionImport !== "HOLD") fail("CORE_T0_T3_PRODUCTION_IMPORT_REACHABLE", "production import must remain HOLD");
  return { status: "PASS", profile: contract.profile, executionStatus: contract.executionStatus, sha256: createHash("sha256").update(stable(contract)).digest("hex"), productionImport: "HOLD" };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const path = resolve(process.argv[2] ?? "scripts/hr-cutover/contracts/core-t0-t3-rehearsal-v1.json");
  process.stdout.write(`${JSON.stringify(verifyCoreT0T3RehearsalContract(JSON.parse(readFileSync(path, "utf8"))))}\n`);
}
