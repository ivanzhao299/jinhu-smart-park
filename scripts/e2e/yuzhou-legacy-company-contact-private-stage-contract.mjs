/* global process */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { buildLegacyCompanyDepartmentRootMergeReceipt } from "../hr-cutover/legacy-company-department-root-merge-receipt.mjs";
import {
  createLegacyCompanyContactPrivateStage,
  validateLegacyCompanyContactPrivateStage,
  writeLegacyCompanyContactPrivateStageFile,
} from "../hr-cutover/legacy-company-contact-private-stage.mjs";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const stageScript = resolve(repositoryRoot, "scripts/hr-cutover/legacy-company-contact-private-stage.mjs");
const stageContract = JSON.parse(readFileSync(resolve(repositoryRoot, "scripts/hr-cutover/contracts/legacy-company-contact-private-stage-v1.json"), "utf8"));
const mergeContract = JSON.parse(readFileSync(resolve(repositoryRoot, "scripts/hr-cutover/contracts/legacy-company-department-root-merge-receipt-v1.json"), "utf8"));
const hash = value => createHash("sha256").update(value).digest("hex");
const h = label => hash(`synthetic:${label}`);
const sourceRestoreReceiptSha256 = h("restore-receipt");
const databaseIdentitySha256 = h("database-identity");
const privateNeedles = ["Fixture Company", "ROOT-X", "+86-000-0000", "Fixture Road", "fixture@example.invalid", "legacy-manager-fixture"];

const catalog = [
  { table: "company", column: "id", type: "int", maxLength: null, nullable: false },
  { table: "company", column: "company", type: "varchar", maxLength: 100, nullable: true },
  { table: "departmentcode", column: "department", type: "varchar", maxLength: 30, nullable: true },
  { table: "departmentcode", column: "departmentname", type: "varchar", maxLength: 100, nullable: true },
];

const readyFacts = {
  companyRows: 1,
  departmentRows: 2,
  departmentRootRows: 1,
  companyBlankIdRows: 0,
  companyDistinctIdRows: 1,
  companyDuplicateIdGroups: 0,
  companyBlankMatchKeyRows: 0,
  companyDistinctMatchKeyRows: 1,
  companyDuplicateMatchKeyGroups: 0,
  departmentBlankKeyRows: 0,
  departmentDistinctKeyRows: 2,
  departmentDuplicateKeyGroups: 0,
  departmentRootBlankMatchKeyRows: 0,
  departmentRootDistinctMatchKeyRows: 1,
  departmentRootDuplicateMatchKeyGroups: 0,
  matchedPairRows: 1,
  companyZeroMatchRows: 0,
  companyUniqueMatchRows: 1,
  companyMultipleMatchRows: 0,
  departmentRootZeroMatchRows: 0,
  departmentRootUniqueMatchRows: 1,
  departmentRootMultipleMatchRows: 0,
};

function mergeReceipt(aggregate = readyFacts) {
  return buildLegacyCompanyDepartmentRootMergeReceipt({
    contract: mergeContract,
    repositoryRoot,
    catalog,
    aggregate,
    sourceRestoreReceiptSha256,
    databaseIdentitySha256,
  });
}

const companyRows = () => [{
  id: 7001,
  company: "Fixture Company",
  phone: "+86-000-0000",
  addr: "Fixture Road",
  email: "fixture@example.invalid",
  master: "legacy-manager-fixture",
}];

const departmentRows = () => [
  { department: "ROOT-X", departmentname: " fixture company " },
  { department: "ROOT-X-CHILD", departmentname: "Synthetic child" },
];

function input(overrides = {}) {
  return {
    contract: stageContract,
    repositoryRoot,
    mergeReceipt: mergeReceipt(),
    sourceRestoreReceiptSha256,
    databaseIdentitySha256,
    companyRows: companyRows(),
    departmentRows: departmentRows(),
    ...overrides,
  };
}

function writePrivateJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function runCli(directory, overrides = {}) {
  const companyPath = resolve(directory, "company-private.json");
  const departmentPath = resolve(directory, "department-private.json");
  const receiptPath = resolve(directory, "merge-receipt-private.json");
  const outputPath = resolve(directory, overrides.outputName ?? "contact-stage-private.json");
  writePrivateJson(companyPath, overrides.companyRows ?? companyRows());
  writePrivateJson(departmentPath, overrides.departmentRows ?? departmentRows());
  writePrivateJson(receiptPath, overrides.mergeReceipt ?? mergeReceipt());
  const result = spawnSync(process.execPath, [
    stageScript,
    "--company-source", companyPath,
    "--department-source", departmentPath,
    "--merge-receipt", receiptPath,
    "--output", outputPath,
    "--source-restore-receipt-sha256", overrides.sourceRestoreReceiptSha256 ?? sourceRestoreReceiptSha256,
    "--database-identity-sha256", databaseIdentitySha256,
  ], { cwd: repositoryRoot, encoding: "utf8" });
  return { result, outputPath, companyPath };
}

test("private transform conserves a ready one-to-one merge and writes only allowed contact columns", () => {
  const { stage, safeReceipt } = createLegacyCompanyContactPrivateStage(input());
  assert.deepEqual(stage.counts, { companyRows: 1, departmentRootRows: 1, candidateRows: 1 });
  assert.deepEqual(safeReceipt.counts, stage.counts);
  assert.equal(stage.postgresLoad, "NOT_EXECUTED");
  assert.equal(stage.productionImport, "HOLD");
  assert.equal(stage.compatibilityCredit, 0);
  assert.deepEqual(stage.records[0].lookup, { org_code: "ROOT-X" });
  assert.deepEqual(stage.records[0].patch, {
    contact_phone: "+86-000-0000",
    contact_address: "Fixture Road",
    contact_email: "fixture@example.invalid",
    legacy_company_manager_reference: "legacy-manager-fixture",
  });
  assert.deepEqual(Object.keys(stage.records[0].patch), stageContract.target.writableColumns);
  assert.equal(Object.prototype.hasOwnProperty.call(stage.records[0].patch, "leader_user_id"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(stage.records[0].patch, "org_name"), false);
  assert.deepEqual(validateLegacyCompanyContactPrivateStage(stage), stage);
});

test("CLI creates a 0600 private candidate while stdout and stderr disclose no source values", (t) => {
  const directory = mkdtempSync(resolve(tmpdir(), "company-contact-private-stage-"));
  chmodSync(directory, 0o700);
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const { result, outputPath } = runCli(directory);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(statSync(outputPath).mode & 0o777, 0o600);
  const stage = JSON.parse(readFileSync(outputPath, "utf8"));
  assert.equal(stage.records.length, 1);
  assert.equal(stage.records[0].patch.legacy_company_manager_reference, "legacy-manager-fixture");
  assert.equal(Object.prototype.hasOwnProperty.call(stage.records[0].patch, "leader_user_id"), false);
  const publicOutput = `${result.stdout}\n${result.stderr}`;
  for (const needle of privateNeedles) assert.doesNotMatch(publicOutput, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  const safeReceipt = JSON.parse(result.stdout);
  assert.equal(safeReceipt.containsSourceValues, false);
  assert.deepEqual(safeReceipt.counts, { companyRows: 1, departmentRootRows: 1, candidateRows: 1 });
  assert.equal(safeReceipt.postgresLoad, "NOT_EXECUTED");
  assert.equal(safeReceipt.productionImport, "HOLD");
});

test("source receipt hash mismatch and non-ready merge receipt HOLD before output creation", (t) => {
  const first = mkdtempSync(resolve(tmpdir(), "company-contact-hash-hold-"));
  const second = mkdtempSync(resolve(tmpdir(), "company-contact-match-hold-"));
  chmodSync(first, 0o700);
  chmodSync(second, 0o700);
  t.after(() => {
    rmSync(first, { recursive: true, force: true });
    rmSync(second, { recursive: true, force: true });
  });

  const hashMismatch = runCli(first, { sourceRestoreReceiptSha256: h("wrong-restore") });
  assert.notEqual(hashMismatch.result.status, 0);
  assert.equal(statAbsent(hashMismatch.outputPath), true);
  assert.match(hashMismatch.result.stderr, /COMPANY_CONTACT_SOURCE_BINDING_INVALID/u);

  const zeroMatchFacts = {
    ...readyFacts,
    matchedPairRows: 0,
    companyZeroMatchRows: 1,
    companyUniqueMatchRows: 0,
    departmentRootZeroMatchRows: 1,
    departmentRootUniqueMatchRows: 0,
  };
  const notReady = runCli(second, { mergeReceipt: mergeReceipt(zeroMatchFacts) });
  assert.notEqual(notReady.result.status, 0);
  assert.equal(statAbsent(notReady.outputPath), true);
  assert.match(notReady.result.stderr, /COMPANY_CONTACT_STAGE_HOLD/u);
  for (const needle of privateNeedles) assert.doesNotMatch(`${notReady.result.stdout}\n${notReady.result.stderr}`, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
});

test("aggregate drift and tampered receipt seal HOLD before private output", () => {
  const drift = input({ departmentRows: [{ department: "OTHER", departmentname: "Unmatched synthetic" }] });
  assert.throws(() => createLegacyCompanyContactPrivateStage(drift), /COMPANY_CONTACT_STAGE_HOLD/u);

  const tampered = mergeReceipt();
  tampered.safeFacts.companyRows = 2;
  assert.throws(
    () => createLegacyCompanyContactPrivateStage(input({ mergeReceipt: tampered })),
    /COMPANY_CONTACT_MERGE_RECEIPT_INVALID/u,
  );
});

test("empty and multiple-match receipts remain HOLD", () => {
  const emptyFacts = Object.fromEntries(Object.keys(readyFacts).map(key => [key, 0]));
  assert.equal(mergeReceipt(emptyFacts).decision, "HOLD_EMPTY_TABLE");
  assert.throws(
    () => createLegacyCompanyContactPrivateStage(input({ mergeReceipt: mergeReceipt(emptyFacts), companyRows: [], departmentRows: [] })),
    /COMPANY_CONTACT_STAGE_HOLD/u,
  );

  const multipleFacts = {
    ...readyFacts,
    departmentRootRows: 2,
    departmentRootDistinctMatchKeyRows: 1,
    departmentRootDuplicateMatchKeyGroups: 1,
    matchedPairRows: 2,
    companyUniqueMatchRows: 0,
    companyMultipleMatchRows: 1,
    departmentRootUniqueMatchRows: 2,
  };
  assert.equal(mergeReceipt(multipleFacts).decision, "HOLD_MULTIPLE_MATCH");
  assert.throws(
    () => createLegacyCompanyContactPrivateStage(input({ mergeReceipt: mergeReceipt(multipleFacts) })),
    /COMPANY_CONTACT_STAGE_HOLD/u,
  );
});

test("private boundary rejects permissive inputs and output overwrite", (t) => {
  const directory = mkdtempSync(resolve(tmpdir(), "company-contact-mode-hold-"));
  chmodSync(directory, 0o700);
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const permissive = runCli(directory, { outputName: "first.json" });
  assert.equal(permissive.result.status, 0, permissive.result.stderr);
  chmodSync(permissive.companyPath, 0o644);
  const rejected = spawnSync(process.execPath, [
    stageScript,
    "--company-source", permissive.companyPath,
    "--department-source", resolve(directory, "department-private.json"),
    "--merge-receipt", resolve(directory, "merge-receipt-private.json"),
    "--output", resolve(directory, "second.json"),
    "--source-restore-receipt-sha256", sourceRestoreReceiptSha256,
    "--database-identity-sha256", databaseIdentitySha256,
  ], { cwd: repositoryRoot, encoding: "utf8" });
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /COMPANY_CONTACT_PRIVATE_FILE_INVALID/u);
  assert.equal(statAbsent(resolve(directory, "second.json")), true);

  const stage = createLegacyCompanyContactPrivateStage(input()).stage;
  assert.throws(() => writeLegacyCompanyContactPrivateStageFile(permissive.outputPath, stage), /COMPANY_CONTACT_PRIVATE_OUTPUT_EXISTS/u);
});

test("implementation is a file-only adapter with no database loader or unsafe public serialization", () => {
  const source = readFileSync(stageScript, "utf8");
  assert.doesNotMatch(source, /(?:from\s+["'](?:pg|typeorm|node:child_process)["']|execSync\s*\(|spawnSync\s*\(|\bpsql\b)/u);
  assert.match(source, /openSync\(path, "wx", 0o600\)/u);
  assert.match(source, /databaseConnections: "forbidden"/u);
  assert.match(source, /legacy_company_manager_reference/u);
  assert.doesNotMatch(source, /patch:\s*\{[^}]*leader_user_id/su);
});

function statAbsent(path) {
  try { statSync(path); return false; }
  catch (error) {
    if (error?.code === "ENOENT") return true;
    throw error;
  }
}
