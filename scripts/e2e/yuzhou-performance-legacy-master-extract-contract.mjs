import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const script = readFileSync(resolve(root, "scripts/extract-yuzhou-performance-master.sh"), "utf8");

for (const marker of [
  "PERFORMANCE_MASTER_EXTRACT_PRIVATE_OUTPUT_REQUIRED",
  "PERFORMANCE_MASTER_EXTRACT_SA_FORBIDDEN",
  "PERFORMANCE_MASTER_EXTRACT_SOURCE_AUTHORITY_INVALID",
  "PERFORMANCE_MASTER_EXTRACT_PRIVATE_OUTPUT_EXISTS",
  "sourceReadOnly: true",
  "sourceSysadmin: false",
  "privatePayloadMode: \"0600\"",
  "receiptContainsSourceValues: false",
  "postgresLoad: \"NOT_EXECUTED\"",
  "productionImport: \"HOLD\"",
]) assert.match(script, new RegExp(marker, "u"));

assert.match(script, /dbo\.assessmentmaster/u);
assert.match(script, /source\.mastervalue/u);
assert.match(script, /source\.timekeepvalue/u);
assert.match(script, /source\.bonusvalue/u);
assert.match(script, /source\.totalvalue/u);
assert.match(script, /HASHBYTES\('SHA2_256',canonical\.row_json\)/u);
assert.match(script, /printf '%s\\n' "\$YUZHOU_SQLSERVER_ETL_PASSWORD" \| docker exec -i/u);
assert.doesNotMatch(script, /sqlcmd[^\n]*\s-P\s/u);
assert.match(script, /openSync\(process\.env\.OUTPUT, "wx", 0o600\)/u);
assert.match(script, /duplicateSessionPersonGroups/u);
assert.match(script, /nullCounts/u);
assert.doesNotMatch(script, /process\.stdout\.write\([^;]*JSON\.stringify\((?:rows|payload)\)/su);

console.log("Yuzhou performance master extract contract passed (read-only, separate private payload, safe aggregate receipt).")
