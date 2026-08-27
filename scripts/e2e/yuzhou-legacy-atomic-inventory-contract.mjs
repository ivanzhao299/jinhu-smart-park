#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildLegacyAtomicInventory, LegacyAtomicInventoryError, parseHelpTopics, parseTableCatalog, validateLegacyAtomicInventory } from "../hr-cutover/legacy-atomic-inventory-lib.mjs";

const root = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const generator = resolve(root, "scripts/hr-cutover/generate-legacy-atomic-inventory.mjs");
const verifier = resolve(root, "scripts/hr-cutover/verify-legacy-atomic-inventory.mjs");
const sandbox = mkdtempSync(join(tmpdir(), "yuzhou-atomic-contract-"));
const legacyRoot = join(sandbox, "legacy");
const routineRoot = join(legacyRoot, "存储过程源码");
const evidenceRoot = join(sandbox, "evidence");
mkdirSync(routineRoot, { recursive: true, mode: 0o700 });
mkdirSync(evidenceRoot, { mode: 0o700 });

const tables = Array.from({ length: 162 }, (_, index) => {
  const number = String(index + 1).padStart(3, "0");
  const columnCount = index < 96 ? 15 : 14;
  const columns = Array.from({ length: columnCount }, (_, columnIndex) => {
    const columnNumber = String(columnIndex + 1).padStart(2, "0");
    return `| column_${number}_${columnNumber} | varchar(20) | ${index % 2 ? "Y" : "N"} |  | 结构字段 ${number}-${columnNumber} |`;
  }).join("\n");
  return `### table_${number}\n\n| 列 | 类型 | 空 | 默认 | 说明 |\n|---|---|---|---|---|\n${columns}\n`;
}).join("\n");
writeFileSync(join(legacyRoot, "table_columns.md"), tables, { mode: 0o600 });

const help = Array.from({ length: 46 }, (_, index) => {
  const number = String(index + 1).padStart(3, "0");
  return `########## topic_${number}.htm\n 无标题文档 \n 业务页面 ${number}: \n 仅用于结构合同。\n`;
}).join("");
writeFileSync(join(legacyRoot, "帮助文档全文.txt"), help, { mode: 0o600 });

for (let index = 1; index <= 194; index += 1) writeFileSync(join(routineRoot, `SQL_STORED_PROCEDURE_proc_${String(index).padStart(3, "0")}_sql`), `procedure ${index}\n`, { mode: 0o600 });
for (let index = 1; index <= 15; index += 1) writeFileSync(join(routineRoot, `SQL_SCALAR_FUNCTION_func_${String(index).padStart(3, "0")}_sql`), `function ${index}\n`, { mode: 0o600 });
writeFileSync(join(routineRoot, "SQL_INLINE_TABLE_VALUED_FUNCTION_func_016_sql"), "function 16\n", { mode: 0o600 });
for (let index = 1; index <= 2; index += 1) writeFileSync(join(routineRoot, `SQL_TRIGGER_trigger_${String(index).padStart(3, "0")}_sql`), `trigger ${index}\n`, { mode: 0o600 });

const inventory = buildLegacyAtomicInventory(legacyRoot);
const report = validateLegacyAtomicInventory(inventory);
assert.deepEqual(report.summary, { tables: 162, columns: 2364, procedures: 194, functions: 16, triggers: 2, rules: 212, pages: 46 });
assert.equal(inventory.permissions.status, "pending_review");
assert.equal(inventory.permissions.expectedAuthorizationRows, 915);
assert.equal(inventory.tables[0].columns[0].description, "结构字段 001-01");
assert.equal(JSON.stringify(inventory).includes(sandbox), false);
assert.equal(JSON.stringify(inventory).includes("Downloads/"), false);

const firstOutput = join(evidenceRoot, "inventory-a.json");
const secondOutput = join(evidenceRoot, "inventory-b.json");
for (const output of [firstOutput, secondOutput]) {
  const result = spawnSync(process.execPath, [generator, "--legacy-root", legacyRoot, "--output", output], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}
assert.equal(readFileSync(firstOutput, "utf8"), readFileSync(secondOutput, "utf8"), "generation must be byte-for-byte deterministic");
const verifyResult = spawnSync(process.execPath, [verifier, "--inventory", firstOutput], { encoding: "utf8" });
assert.equal(verifyResult.status, 0, verifyResult.stderr);

function expectCode(code, mutate) {
  const candidate = structuredClone(inventory);
  mutate(candidate);
  assert.throws(() => validateLegacyAtomicInventory(candidate), (error) => error instanceof LegacyAtomicInventoryError && error.code === code, `expected ${code}`);
}

expectCode("DUPLICATE_TABLE_NAME", (candidate) => {
  candidate.tables[1].name = candidate.tables[0].name;
  candidate.tables[1].id = candidate.tables[0].id;
});
expectCode("STRUCTURAL_HASH_DRIFT", (candidate) => {
  candidate.tables[0].columns[0].description = "被篡改但未重算哈希";
});
expectCode("SOURCE_ARTIFACT_HASH_DRIFT", (candidate) => {
  candidate.tables[0].sourceArtifactSha256 = candidate.pages[0].sourceArtifactSha256;
});
expectCode("SOURCE_ARTIFACT_HASH_DRIFT", (candidate) => {
  candidate.routines[0].sourceArtifactSha256 = candidate.routines[1].sourceArtifactSha256;
});
expectCode("COLUMN_COUNT_MISMATCH", (candidate) => {
  candidate.tables[0].columns.pop();
  candidate.tables[0].columnCount -= 1;
  candidate.summary.columns -= 1;
});
expectCode("PAGE_COUNT_MISMATCH", (candidate) => {
  candidate.pages.pop();
  candidate.summary.pages -= 1;
});
expectCode("SENSITIVE_STRUCTURAL_TEXT", (candidate) => {
  candidate.tables[0].columns[0].description = "employee@example.com";
});
expectCode("ABSOLUTE_PATH_FORBIDDEN", (candidate) => {
  candidate.pages[0].title = "/Users/example/Downloads/source";
});
expectCode("PERMISSION_CONTRACT_INVALID", (candidate) => {
  candidate.permissions.status = "approved";
});
expectCode("RULE_COUNT_MISMATCH", (candidate) => {
  candidate.routines.pop();
  candidate.summary.rules -= 1;
});
assert.throws(() => parseTableCatalog(Buffer.from("### broken\n| wrong |\n"), "a".repeat(64)), (error) => error.code === "TABLE_FORMAT_UNKNOWN");
assert.throws(() => parseHelpTopics(Buffer.from("content without marker"), "a".repeat(64)), (error) => error.code === "HELP_FORMAT_UNKNOWN");

const escapeResult = spawnSync(process.execPath, [generator, "--legacy-root", legacyRoot, "--output", join(legacyRoot, "escaped.json")], { encoding: "utf8" });
assert.notEqual(escapeResult.status, 0);
assert.match(escapeResult.stderr, /OUTPUT_PATH_ESCAPE/);
const reviewedResult = spawnSync(process.execPath, [generator, "--legacy-root", legacyRoot, "--output", join(evidenceRoot, "legacy-compatibility-ledger-v1.json")], { encoding: "utf8" });
assert.notEqual(reviewedResult.status, 0);
assert.match(reviewedResult.stderr, /REVIEWED_LEDGER_OVERWRITE_FORBIDDEN/);
const reviewedCaseAliasResult = spawnSync(process.execPath, [generator, "--legacy-root", legacyRoot, "--output", join(evidenceRoot, "LEGACY-COMPATIBILITY-LEDGER-V1.JSON")], { encoding: "utf8" });
assert.notEqual(reviewedCaseAliasResult.status, 0);
assert.match(reviewedCaseAliasResult.stderr, /REVIEWED_LEDGER_OVERWRITE_FORBIDDEN/);

writeFileSync(join(routineRoot, "UNKNOWN_FORMAT"), "unknown\n", { mode: 0o600 });
assert.throws(() => buildLegacyAtomicInventory(legacyRoot), (error) => error instanceof LegacyAtomicInventoryError && error.code === "ROUTINE_FORMAT_UNKNOWN");

console.log("Yuzhou legacy atomic inventory contract passed (deterministic structural inventory plus fail-closed negatives). ");
