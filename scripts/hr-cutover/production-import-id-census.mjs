/* global Buffer, process */
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL as MODEL, stableProductionImportCanonicalJson as canonical } from "./production-import-target-model.mjs";
import { DEFAULT_PRODUCTION_IMPORT_EXECUTION_CONTRACT as CONTRACT } from "./production-import-sealed-plan-lib.mjs";
import { verifyProductionSourceManifest } from "../prepare-yuzhou-production-source-manifest.mjs";

export const CENSUS_TABLES = Object.freeze(Object.keys(MODEL.targetTables).sort());
export const CENSUS_ARTIFACT = "yuzhou-hr-production-id-census";
export const CENSUS_FILE = "id-census.json";
export const CENSUS_MAX_BYTES = 192 * 1024 ** 2;
export const CENSUS_MAX_ROWS = 2_000_000;
export const censusHash = s => createHash("sha256").update(s).digest("hex");
export const censusFail = code => { const e = new Error(`PRODUCTION_IMPORT_CENSUS_${code}`); e.code = e.message; throw e; };
export const censusExact = (v, keys) => { if (!v || typeof v !== "object" || Array.isArray(v) || Object.keys(v).sort().join("|") !== [...keys].sort().join("|")) censusFail("SHAPE_INVALID"); };
export const censusIdHash = (table, id) => {
  if (!CENSUS_TABLES.includes(table) || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(id ?? "")) censusFail("ID_INVALID");
  return censusHash(`yuzhou-global-id-v1\x1fpublic.${table}\x1f${id}`);
};
export const censusTableHash = (table, hashes) => censusHash(`yuzhou-global-id-set-v1\x1fpublic.${table}\x1f${hashes.join("\n")}`);

export function validateIdCensus(c, now = new Date()) {
  censusExact(c, ["formatVersion", "kind", "targetIdentitySha256", "targetScopeSha256", "observedAt", "expiresAt", "tables", "scopeCounts", "complete", "productionImport"]);
  censusExact(c.scopeCounts, ["assigned", "valid"]);
  if (c.scopeCounts.assigned !== 1 || c.scopeCounts.valid !== 1) censusFail("SCOPE_INVALID");
  if (c.formatVersion !== 1 || c.kind !== "yuzhou_global_id_census_v1" || c.complete !== true || c.productionImport !== "HOLD" ||
    ![c.targetIdentitySha256, c.targetScopeSha256].every(x => /^[a-f0-9]{64}$/u.test(x))) censusFail("IDENTITY_INVALID");
  const a = Date.parse(c.observedAt), b = Date.parse(c.expiresAt), n = new Date(now).getTime();
  if (![a, b, n].every(Number.isFinite) || a > n || n >= b || b <= a || b - a > 3600000) censusFail("STALE");
  censusExact(c.tables, CENSUS_TABLES); let total = 0;
  for (const table of CENSUS_TABLES) {
    const v = c.tables[table]; censusExact(v, ["count", "hashes", "sha256"]);
    if (!Number.isSafeInteger(v.count) || v.count < 0 || !Array.isArray(v.hashes) || v.count !== v.hashes.length || (total += v.count) > CENSUS_MAX_ROWS) censusFail("COMPLETENESS_INVALID");
    if (v.hashes.some((h, i) => !/^[a-f0-9]{64}$/u.test(h) || (i > 0 && h <= v.hashes[i - 1])) || v.sha256 !== censusTableHash(table, v.hashes)) censusFail("DIGEST_INVALID");
  }
  return c;
}

/** Fixed SQL only. No caller identifiers/SQL, no row security bypass, no business values. */
export function productionIdCensusSql() {
  const tables = CENSUS_TABLES.map(t => `'${t}'`).join(",");
  const sets = CENSUS_TABLES.map(t => `SELECT '${t}' AS name, jsonb_build_object('count',count(*),'hashes',coalesce(jsonb_agg(h ORDER BY h COLLATE "C"),'[]'::jsonb),'sha256',encode(sha256(convert_to('yuzhou-global-id-set-v1'||chr(31)||'public.${t}'||chr(31)||coalesce(string_agg(h,E'\\n' ORDER BY h COLLATE "C"),''),'UTF8')),'hex')) AS value FROM (SELECT encode(sha256(convert_to('yuzhou-global-id-v1'||chr(31)||'public.${t}'||chr(31)||id::text,'UTF8')),'hex') h FROM public.${t}) ids`).join("\nUNION ALL\n");
  return `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='60s';
SET LOCAL idle_in_transaction_session_timeout='60s';
SET LOCAL search_path=pg_catalog,public;
LOCK TABLE ${[...CENSUS_TABLES, "rel_tenant_module", "sys_module", "sys_tenant", "biz_park"].map(t => `public.${t}`).join(",")} IN ACCESS SHARE MODE;
DO $$ DECLARE t text; r record; n bigint; total bigint:=0;
BEGIN
FOREACH t IN ARRAY ARRAY['rel_tenant_module','sys_module','sys_tenant','biz_park'] LOOP
 SELECT c.oid,c.relkind,c.relrowsecurity,c.relforcerowsecurity INTO r FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE ns.nspname='public' AND c.relname=t;
 IF NOT FOUND OR r.relkind<>'r' OR r.relrowsecurity OR r.relforcerowsecurity
 OR EXISTS(SELECT 1 FROM pg_inherits WHERE inhrelid=r.oid OR inhparent=r.oid)
 THEN RAISE EXCEPTION 'CENSUS_SCOPE_SCHEMA_DENIED'; END IF;
END LOOP;
FOREACH t IN ARRAY ARRAY[${tables}] LOOP
 SELECT c.oid,c.relkind,c.relrowsecurity,c.relforcerowsecurity,a.attnum,a.attnotnull,a.atttypid INTO r
 FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
 JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='id' AND NOT a.attisdropped
 WHERE ns.nspname='public' AND c.relname=t;
 IF NOT FOUND OR r.relkind<>'r' OR r.relrowsecurity OR r.relforcerowsecurity OR NOT r.attnotnull OR r.atttypid<>'uuid'::regtype
 OR EXISTS(SELECT 1 FROM pg_inherits WHERE inhrelid=r.oid OR inhparent=r.oid)
 OR NOT EXISTS(SELECT 1 FROM pg_index WHERE indrelid=r.oid AND indisprimary AND indisvalid AND indkey::text=r.attnum::text)
 THEN RAISE EXCEPTION 'CENSUS_SCHEMA_DENIED'; END IF;
 EXECUTE format('SELECT count(*) FROM public.%I',t) INTO n; total:=total+n;
 IF total>${CENSUS_MAX_ROWS} THEN RAISE EXCEPTION 'CENSUS_BUDGET'; END IF;
END LOOP;
END $$;
WITH assignments AS (
 SELECT DISTINCT btrim(a.tenant_id::text) tenant_id,btrim(a.park_id::text) park_id
 FROM public.rel_tenant_module a JOIN public.sys_module m ON m.id=a.module_id
 WHERE m.module_code='hr' AND NOT m.is_deleted AND a.enabled AND a.status='enabled' AND NOT a.is_deleted
 AND (a.start_time IS NULL OR a.start_time<=transaction_timestamp()) AND (a.expire_time IS NULL OR a.expire_time>transaction_timestamp())
), scopes AS (
 SELECT a.*,
 EXISTS(SELECT 1 FROM public.sys_tenant t WHERE btrim(t.tenant_id::text)=a.tenant_id AND t.status=1 AND NOT t.is_deleted AND (t.expire_time IS NULL OR t.expire_time>transaction_timestamp()))
 AND EXISTS(SELECT 1 FROM public.biz_park p WHERE btrim(p.tenant_id::text)=a.tenant_id AND btrim(p.park_id::text)=a.park_id AND p.status=1 AND NOT p.is_deleted) AS valid
 FROM assignments a
), sets AS (${sets})
SELECT jsonb_build_object('formatVersion',1,'kind','yuzhou_global_id_census_v1',
 'targetIdentitySha256',encode(sha256(convert_to('yuzhou-hr-production-target-v1:'||concat_ws(chr(31),current_database(),current_user,coalesce(inet_server_addr()::text,''),coalesce(inet_server_port()::text,''),(SELECT oid::text FROM pg_database WHERE datname=current_database()),tenant_id,park_id),'UTF8')),'hex'),
 'targetScopeSha256',encode(sha256(convert_to('yuzhou-hr-production-target-scope-v1','UTF8')||decode('00','hex')||convert_to(tenant_id,'UTF8')||decode('00','hex')||convert_to(park_id,'UTF8')),'hex'),
 'observedAt',transaction_timestamp(),'expiresAt',transaction_timestamp()+interval '1 hour',
 'tables',(SELECT jsonb_object_agg(name,value) FROM sets),'scopeCounts',jsonb_build_object('assigned',(SELECT count(*) FROM scopes),'valid',(SELECT count(*) FROM scopes WHERE valid)),'complete',true,'productionImport','HOLD')
FROM scopes WHERE (SELECT count(*) FROM scopes)=1;
ROLLBACK;
`;
}

export function productionIdCensusShell() {
  return `#!/bin/sh
set -eu
case "\${1:-}" in /*) cd "$1" ;; *) echo PRODUCTION_IMPORT_CENSUS_PATH_INVALID >&2; exit 1;; esac
# Capture stderr privately in memory; never relay psql/container errors.
if ! result="$(docker compose --env-file .env.production -f infra/docker/docker-compose.prod.yml exec -T postgres sh -c 'exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' 2>/dev/null <<'CENSUS_SQL'
${productionIdCensusSql()}CENSUS_SQL
)"; then echo PRODUCTION_IMPORT_CENSUS_QUERY_FAILED >&2; exit 1; fi
[ -n "$result" ] || { echo PRODUCTION_IMPORT_CENSUS_SCOPE_INVALID >&2; exit 1; }
printf '%s\\n' "$result"
`;
}

export function bindWorkflowCensus(census, source, workflow, now = new Date()) {
  validateIdCensus(census, now); verifyProductionSourceManifest(source);
  censusExact(workflow, ["repository", "runId", "runAttempt", "codeSha"]);
  if (workflow.repository !== "ivanzhao299/jinhu-smart-park" || !/^[1-9][0-9]*$/u.test(workflow.runId) || !/^[1-9][0-9]*$/u.test(workflow.runAttempt) || !/^[a-f0-9]{40}$/u.test(workflow.codeSha)) censusFail("WORKFLOW_INVALID");
  if (!CONTRACT.activation.allowedTargets.some(t => t.identitySha256 === census.targetIdentitySha256 && t.targetScopeSha256 === census.targetScopeSha256)) censusFail("TARGET_DENIED");
  const triple = { codeSha: workflow.codeSha, sourceSnapshotHash: source.sourceSnapshotSha256, mappingContractHash: source.mappingContractSha256 };
  return { formatVersion: 1, kind: "yuzhou_workflow_id_census_v1", triple, workflow, census, censusSha256: censusHash(canonical(census)), productionImport: "HOLD" };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length === 3 && process.argv[2] === "--shell") process.stdout.write(productionIdCensusShell());
    else if (process.argv.length === 4 && process.argv[2] === "--bind") {
      if (statSync(process.argv[3]).size > CENSUS_MAX_BYTES || Buffer.byteLength(process.env.YUZHOU_SOURCE_MANIFEST_JSON ?? "") > 65535) censusFail("BUDGET");
      process.stdout.write(JSON.stringify(bindWorkflowCensus(JSON.parse(readFileSync(process.argv[3], "utf8")), JSON.parse(process.env.YUZHOU_SOURCE_MANIFEST_JSON ?? ""),
        { repository: process.env.GITHUB_REPOSITORY, runId: process.env.GITHUB_RUN_ID, runAttempt: process.env.GITHUB_RUN_ATTEMPT, codeSha: process.env.GITHUB_SHA })) + "\n");
    } else censusFail("USAGE");
  } catch { process.stderr.write("PRODUCTION_IMPORT_CENSUS_DIAGNOSTIC_FAILED\n"); process.exitCode = 1; }
}
