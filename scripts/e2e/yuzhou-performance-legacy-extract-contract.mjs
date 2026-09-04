import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const script = readFileSync(resolve(root, "scripts/extract-yuzhou-performance-legacy.sh"), "utf8");

for (const table of ["assessmentcode", "assgradecode", "assitem", "assitemgradedes", "assessmentdetail"]) {
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
assert.match(script, /openSync\(process\.env\.OUTPUT, "wx", 0o600\)/u);
assert.match(script, /chmod 700 "\$OUTPUT_DIR"/u);
assert.match(script, /HASHBYTES\('SHA2_256',canonical\.row_json\)/u);
assert.match(script, /duplicateKeyGroups/u);
assert.match(script, /unresolvedRelations/u);
assert.doesNotMatch(script, /process\.stdout\.write\([^;]*(?:payload|assitem|assessmentdetail)/su);

console.log("Yuzhou performance legacy extract contract passed (read-only, private payload, safe receipt).");
