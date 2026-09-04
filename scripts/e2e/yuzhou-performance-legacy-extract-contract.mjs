import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const script = readFileSync(resolve(root, "scripts/extract-yuzhou-performance-legacy.sh"), "utf8");
const writer = readFileSync(resolve(root, "database/migrations/000301_hr_performance_yuzhou_legacy_writer.sql"), "utf8");

for (const table of [
  "assessmentcode", "assgradecode", "assitem", "assitemgradedes", "assessmentdetail",
  "asssession", "assessmentmaster", "asssour", "asssourperson",
]) {
  assert.match(script, new RegExp(`dbo\\.${table}`, "u"));
}
for (const marker of [
  "PERFORMANCE_EXTRACT_PRIVATE_OUTPUT_REQUIRED",
  "PERFORMANCE_EXTRACT_SA_FORBIDDEN",
  "PERFORMANCE_EXTRACT_SOURCE_AUTHORITY_INVALID",
  "PERFORMANCE_EXTRACT_PRIVATE_OUTPUT_EXISTS",
  "sourceReadOnly: true",
  "sourceSysadmin: false",
  "containsSourceValues: false",
  "containsPersonalData: false",
  "postgresLoad: \"NOT_EXECUTED\"",
  "productionImport: \"HOLD\"",
]) {
  assert.match(script, new RegExp(marker, "u"));
}

assert.match(script, /printf '%s\\n' "\$YUZHOU_SQLSERVER_ETL_PASSWORD" \| docker exec -i/u);
assert.match(script, /IFS= read -r SQLCMDPASSWORD; export SQLCMDPASSWORD/u);
assert.doesNotMatch(script, /sqlcmd[^\n]*\s-P\s/u);
assert.match(script, /openSync\(path, "wx", 0o600\)/u);
for (const output of ["OUTPUT", "MASTER_OUTPUT", "RELATION_OUTPUT"]) {
  assert.match(script, new RegExp(`writePrivate\\(process\\.env\\.${output},`, "u"));
}
assert.match(script, /for PRIVATE_OUTPUT in "\$OUTPUT" "\$MASTER_OUTPUT" "\$RELATION_OUTPUT"/u);
assert.match(script, /chmod 700 "\$PRIVATE_OUTPUT_DIR"/u);
assert.match(script, /HASHBYTES\('SHA2_256',canonical\.row_json\)/u);
assert.match(script, /duplicateKeyGroups/u);
assert.match(script, /unresolvedRelations/u);
assert.match(script, /const projectionNames = \["assessmentcode", "assgradecode", "assitem", "assitemgradedes", "assessmentdetail"\]/u);
assert.match(writer, /p_payload,ARRAY\['assessmentcode','assgradecode','assitem','assitemgradedes','assessmentdetail'\]/u);
assert.match(script, /const masterNames = \["assessmentmaster"\]/u);
assert.match(script, /const relationNames = \["asssession", "asssour", "asssourperson"\]/u);
assert.match(script, /YUZHOU_PERFORMANCE_MASTER_PRIVATE_OUTPUT/u);
assert.match(script, /YUZHOU_PERFORMANCE_RELATION_PRIVATE_OUTPUT/u);
assert.match(script, /masterPrivatePayloadSha256/u);
assert.match(script, /relationPrivatePayloadSha256/u);
for (const relation of ["detailSession", "masterSession", "scoreSourceSession", "scoreSourceItem", "scoreSourcePersonSession"]) {
  assert.match(script, new RegExp(relation, "u"));
}
assert.doesNotMatch(script, /process\.stdout\.write\([^;]*(?:payload|assitem|assessmentdetail)/su);

console.log("Yuzhou performance legacy extract contract passed (read-only, private payload, safe receipt).");
