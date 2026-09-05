import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { materializeContractSemantics } from "../hr-cutover/t2-contract-semantics.mjs";

const root = resolve(import.meta.dirname, "../..");
const staging = mkdtempSync(join(tmpdir(), "staging-yuzhou-t2-semantic-"));
const write = (name, value) => writeFileSync(join(staging, name), `${JSON.stringify(value)}\n`, { mode: 0o600 });
try {
  write("contract-types.raw.json", [{ typeCode: "1", typeName: "fixed" }]);
  write("contract-states.raw.json", []);
  write("contract-changes.raw.json", []);
  write("contracts.raw.json", [
    { contractNo: "C-1", typeName: "fixed", employeeCode: "E-1", startDate: "2024-01-01", endDate: "2026-12-31", signedDate: "2023-12-20", continuetimes: "2", contractMonths: "999", totalContractMonths: "100" },
    { contractNo: "C-2", typeName: "fixed", employeeCode: "E-2", startDate: "2024-01-15", endDate: "2024-02-14", signedDate: null, continuetimes: null, contractMonths: "7", totalContractMonths: null },
  ]);
  const result = spawnSync(process.execPath, ["scripts/transform-yuzhou-t2-contracts.mjs", staging], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const rows = readFileSync(join(staging, "contracts.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
  const rawRows = JSON.parse(readFileSync(join(staging, "contracts.raw.json"), "utf8"));
  assert.deepEqual(rows.map(row => row.source), rawRows.map(materializeContractSemantics), "CLI and projection must share exactly the same pure owner");
  const helperPath = "scripts/hr-cutover/t2-contract-semantics.mjs";
  const fullContract = JSON.parse(readFileSync(join(root, "scripts/hr-cutover/contracts/full-domain-contract-v1.json"), "utf8"));
  assert.equal(fullContract.triple.mappingContractComponents.filter(path => path === helperPath).length, 1);
  const driver = readFileSync(join(root, "scripts/hr-cutover/core-drivers/postgres-lab-v1.mjs"), "utf8");
  assert.ok(driver.slice(driver.indexOf("const DRIVER_CONTRACT_PATHS"), driver.indexOf("const DEFAULT_TENANT")).includes(`"${helperPath}"`));
  assert.deepEqual(rows.map(row => ({ term: row.source.derivedContractTermMonths, signature: row.source.signedDate, renewal: row.source.legacyRenewalCount, termDecision: row.source.contractTermDecision, signatureDecision: row.source.signatureDateDecision, renewalDecision: row.source.renewalCountDecision })), [
    { term: 36, signature: "2023-12-20", renewal: 2, termDecision: "DERIVED_FROM_DATE_BOUNDARY", signatureDecision: "DIRECT_LEGACY_DATE", renewalDecision: "DIRECT_NONNEGATIVE_LEGACY_COUNT" },
    { term: 1, signature: null, renewal: null, termDecision: "DERIVED_FROM_DATE_BOUNDARY", signatureDecision: "ABSENT", renewalDecision: "ABSENT_DEFAULT_ZERO" },
  ]);
  assert.equal(rows[0].source.contractMonths, "999", "ambiguous legacy term must remain source evidence, not become the target term");
  write("contracts.raw.json", [{ contractNo: "C-invalid", typeName: "fixed", employeeCode: "E-invalid", startDate: "2024-02-30", endDate: "2024-03-31" }]);
  const invalid = spawnSync(process.execPath, ["scripts/transform-yuzhou-t2-contracts.mjs", staging], { cwd: root, encoding: "utf8" });
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /dbo\.compact invalid ISO date/);
} finally {
  rmSync(staging, { recursive: true, force: true });
}
console.log("Yuzhou T2 contract semantic materialization contract passed.");
