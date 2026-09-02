import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { parseT5ProductionPrivateStageArgs, prepareT5ProductionPrivateStage } from "../prepare-yuzhou-production-import-t5-private-stage.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
const privateWrite = (path, value) => { writeFileSync(path, `${typeof value === "string" ? value : JSON.stringify(value)}\n`, { mode: 0o600 }); chmodSync(path, 0o600); return hash(readFileSync(path)); };
const mode = path => (statSync(path).mode & 0o777).toString(8);

test("private-stage CLI turns a verified T5 stage into 0600 private files and a safe receipt", () => {
  const root = mkdtempSync(join(tmpdir(), "jinhu-t5-private-stage-"));
  try {
    const stage = join(root, "stage");
    const outputRoot = join(root, "out");
    const triple = join(root, "triple.json");
    for (const path of [stage, outputRoot]) { mkdirSync(path, { mode: 0o700 }); chmodSync(path, 0o700); }
    const source = hash("source");
    const rows = {
      family: "", ticket: "",
      person_core: JSON.stringify({ domain: "employee_profile_raw", employeeCode: "E-001", sourceTable: "dbo.person.core_residue", sourceKey: "profile-one", sourceIdentitySha256: hash("employee"), sourceRowSha256: hash("profile-row"), source: { ignored: true }, materialized: { kind: "profile", disposition: "loaded", gaps: [], idType: null, idNumber: { encrypted: null, masked: null, fingerprint: null }, gender: null, dateOfBirth: null, ethnicity: null, nativePlace: null, politicalStatus: null, maritalStatus: null, healthStatus: null, address: null, homePhone: null, personalMobile: null, personalEmail: null, highestEducation: null, major: null, degree: null, graduationSchool: null, graduationDate: null, foreignLanguage: null, jobTitle: null, jobGrade: null } }),
      knowhow: JSON.stringify({ domain: "skill", employeeCode: "E-001", sourceTable: "dbo.knowhow", sourceKey: "one", sourceIdentitySha256: hash("skill-source"), sourceRowSha256: hash("skill-row"), source: { ignored: true }, materialized: { disposition: "loaded", gaps: [], kind: "skill", legacyGrade: null, note: null, proficiency: null, skillName: "synthetic" } }),
    };
    const domains = {};
    for (const [name, line] of Object.entries(rows)) {
      const file = `${name}.jsonl`;
      domains[name] = { file, fileSha256: privateWrite(join(stage, file), line), rows: line ? 1 : 0 };
    }
    privateWrite(join(stage, "manifest.json"), { artifactKind: "yuzhou_t5_nonfile_materialization_stage", sourceSnapshotSha256: source, sourceRestoreReceiptSha256: hash("restore"), nonfileBusinessSha256: hash("business"), domains, filesExcluded: ["photo", "docs"], sourceRows: 2, productionImport: "HOLD" });
    privateWrite(triple, { codeSha: "1".repeat(40), sourceSnapshotHash: source, mappingContractHash: hash("mapping") });
    const result = prepareT5ProductionPrivateStage({ stagePath: stage, triplePath: triple, outputRoot, runId: "t5private01" });
    assert.equal(result.recordCount, 2);
    assert.equal(result.productionImport, "HOLD");
    assert.equal(mode(result.output), "700");
    assert.equal(mode(join(result.output, "private-stage.json")), "600");
    assert.equal(mode(join(result.output, "receipt.json")), "600");
    const receipt = JSON.parse(readFileSync(join(result.output, "receipt.json"), "utf8"));
    assert.equal(receipt.recordCount, 2);
    assert.equal(receipt.targetTableCounts.hr_employee_skill.insert, 1);
    assert.equal(JSON.stringify(receipt).includes("synthetic"), false);
    assert.equal(parseT5ProductionPrivateStageArgs(["--stage", stage, "--triple", triple, "--output-root", outputRoot, "--run-id", "t5private01"]).runId, "t5private01");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
