/* global process */
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CENSUS_TABLES, CENSUS_MAX_BYTES, CENSUS_MAX_ROWS, censusExact, censusFail,
  censusHash, censusTableHash, productionIdCensusSql } from "./production-import-id-census.mjs";
import { DEFAULT_PRODUCTION_IMPORT_EXECUTION_CONTRACT as CONTRACT } from "./production-import-sealed-plan-lib.mjs";
import { stableProductionImportCanonicalJson as canonical } from "./production-import-target-model.mjs";
import { verifyProductionSourceManifest } from "../prepare-yuzhou-production-source-manifest.mjs";

export const ASSIGNED_CENSUS_EXECUTOR_SHA = "dafe8b54510dada1c7bf90663557c54debc89b16";
export const ASSIGNED_CENSUS_ARTIFACT = "yuzhou-hr-production-assigned-scope-id-census";
const target = CONTRACT.activation.allowedTargets;
if (target.length !== 1) censusFail("ASSIGNED_TARGET_AMBIGUOUS");
const scopeSha = target[0].targetScopeSha256;
if (!/^[a-f0-9]{64}$/u.test(scopeSha)) censusFail("ASSIGNED_TARGET_INVALID");
const selection = `encode(sha256(convert_to('yuzhou-hr-production-target-scope-v1','UTF8')||decode('00','hex')||convert_to(tenant_id,'UTF8')||decode('00','hex')||convert_to(park_id,'UTF8')),'hex')='${scopeSha}'`;

/** Select the already allowlisted scope. ID sets still cover every row in every
 * target table, including soft-deleted rows and rows belonging to other scopes.
 * Preserve the actual global assignment counts; never turn three into one. */
export function assignedScopeIdCensusSql() {
  let sql = productionIdCensusSql();
  const old = "FROM scopes WHERE (SELECT count(*) FROM scopes)=1;";
  if (sql.split(old).length !== 2) censusFail("ASSIGNED_SQL_CONTRACT_DRIFT");
  sql = sql.replace(old, `FROM scopes WHERE valid AND ${selection};`);
  const marker = "'scopeCounts',jsonb_build_object('assigned',(SELECT count(*) FROM scopes),'valid',(SELECT count(*) FROM scopes WHERE valid))";
  if (sql.split(marker).length !== 2) censusFail("ASSIGNED_SQL_CONTRACT_DRIFT");
  return sql.replace(marker, `${marker},'selection',jsonb_build_object('scopeSha256','${scopeSha}','assigned',(SELECT count(*) FROM scopes WHERE ${selection}),'valid',(SELECT count(*) FROM scopes WHERE valid AND ${selection}))`);
}
export function assignedScopeIdCensusShell() {
  return `#!/bin/sh
set -eu
case "\${1:-}" in /*) cd "$1" ;; *) echo ASSIGNED_CENSUS_PATH_INVALID >&2; exit 1;; esac
if ! result="$(docker compose --env-file .env.production -f infra/docker/docker-compose.prod.yml exec -T postgres sh -c 'exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' 2>/dev/null <<'CENSUS_SQL'
${assignedScopeIdCensusSql()}CENSUS_SQL
)"; then echo ASSIGNED_CENSUS_QUERY_FAILED >&2; exit 1; fi
[ -n "$result" ] || { echo ASSIGNED_CENSUS_SELECTION_INVALID >&2; exit 1; }
printf '%s\\n' "$result"
`;
}
export function validateAssignedScopeIdCensus(c, now = new Date()) {
  censusExact(c, ["formatVersion", "kind", "targetIdentitySha256", "targetScopeSha256", "observedAt", "expiresAt", "tables", "scopeCounts", "selection", "complete", "productionImport"]);
  censusExact(c.scopeCounts, ["assigned", "valid"]);
  censusExact(c.selection, ["scopeSha256", "assigned", "valid"]);
  if (!Number.isSafeInteger(c.scopeCounts.assigned) || c.scopeCounts.assigned < 1
    || !Number.isSafeInteger(c.scopeCounts.valid) || c.scopeCounts.valid < 1 || c.scopeCounts.valid > c.scopeCounts.assigned
    || c.selection.scopeSha256 !== scopeSha || c.selection.assigned !== 1 || c.selection.valid !== 1) censusFail("ASSIGNED_SELECTION_INVALID");
  if (c.formatVersion !== 1 || c.kind !== "yuzhou_global_id_census_v1" || c.complete !== true || c.productionImport !== "HOLD"
    || c.targetIdentitySha256 !== target[0].identitySha256 || c.targetScopeSha256 !== scopeSha) censusFail("ASSIGNED_IDENTITY_INVALID");
  const a = Date.parse(c.observedAt), b = Date.parse(c.expiresAt), n = +new Date(now);
  if (![a, b, n].every(Number.isFinite) || a > n || n >= b || b <= a || b - a > 3600000) censusFail("ASSIGNED_STALE");
  censusExact(c.tables, CENSUS_TABLES); let total = 0;
  for (const name of CENSUS_TABLES) {
    const t = c.tables[name]; censusExact(t, ["count", "hashes", "sha256"]);
    if (!Number.isSafeInteger(t.count) || t.count < 0 || !Array.isArray(t.hashes) || t.hashes.length !== t.count
      || (total += t.count) > CENSUS_MAX_ROWS || t.hashes.some((h, i) => !/^[a-f0-9]{64}$/u.test(h) || (i > 0 && h <= t.hashes[i - 1]))
      || t.sha256 !== censusTableHash(name, t.hashes)) censusFail("ASSIGNED_COMPLETENESS_INVALID");
  }
  return c;
}
export function bindAssignedScopeIdCensus(census, source, workflow, now = new Date()) {
  validateAssignedScopeIdCensus(census, now); verifyProductionSourceManifest(source);
  censusExact(workflow, ["repository", "runId", "runAttempt", "observerCodeSha"]);
  if (workflow.repository !== "ivanzhao299/jinhu-smart-park" || !/^[1-9][0-9]*$/u.test(workflow.runId)
    || !/^[1-9][0-9]*$/u.test(workflow.runAttempt) || !/^[a-f0-9]{40}$/u.test(workflow.observerCodeSha)) censusFail("ASSIGNED_WORKFLOW_INVALID");
  return { formatVersion: 1, kind: "yuzhou_assigned_scope_workflow_id_census_v1",
    triple: { codeSha: ASSIGNED_CENSUS_EXECUTOR_SHA, sourceSnapshotHash: source.sourceSnapshotSha256, mappingContractHash: source.mappingContractSha256 },
    workflow, census, censusSha256: censusHash(canonical(census)), productionImport: "HOLD" };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length === 3 && process.argv[2] === "--shell") process.stdout.write(assignedScopeIdCensusShell());
    else if (process.argv.length === 4 && process.argv[2] === "--bind") {
      if (statSync(process.argv[3]).size > CENSUS_MAX_BYTES) censusFail("ASSIGNED_BUDGET");
      const sourceText = process.env.YUZHOU_SOURCE_MANIFEST_JSON ?? "";
      if (sourceText.length > 65535) censusFail("ASSIGNED_BUDGET");
      process.stdout.write(JSON.stringify(bindAssignedScopeIdCensus(JSON.parse(readFileSync(process.argv[3], "utf8")), JSON.parse(sourceText),
        { repository: process.env.GITHUB_REPOSITORY, runId: process.env.GITHUB_RUN_ID, runAttempt: process.env.GITHUB_RUN_ATTEMPT, observerCodeSha: process.env.GITHUB_SHA })) + "\n");
    } else censusFail("ASSIGNED_USAGE");
  } catch (error) { process.stderr.write(`${/^PRODUCTION_IMPORT_CENSUS_[A-Z_]+$/u.test(error?.code ?? "") ? error.code : "ASSIGNED_CENSUS_FAILED"}\n`); process.exitCode = 1; }
}
