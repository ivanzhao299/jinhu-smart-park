import { DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL as MODEL } from "./production-import-target-model.mjs";
import { computeProductionImportTargetScopeHash } from "./production-import-sealed-plan-lib.mjs";

const TABLES = Object.freeze(Object.keys(MODEL.targetTables));
const PHASES = ["T0", "T1", "T2", "T3"];
const fail = () => { throw new Error("LAB_PG_PROBE_GUARD"); };
const integer = value => { const n = Number(value); if (value === null || value === undefined || !Number.isSafeInteger(n) || n < 0) fail(); return n; };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/** Read-only probes. Caller supplies pinned expected phase counts and registers
 * every HTTP fixture ID before insertion; no names, prefixes, secrets or writes.
 */
export function createYuzhouRealBundleLabPgProbes({ expectedDatabase, targetScope, runId, codeSha, sourceSnapshotHash,
  baselineCounts, phaseCounts, getHttpFixtureIds }) {
  if (!/^jinhu_hr_migration_lab_[A-Za-z0-9_]{6,64}$/u.test(expectedDatabase ?? "") || expectedDatabase.length > 63 ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{5,59}$/u.test(runId ?? "") || !/^[0-9a-f]{40}$/u.test(codeSha ?? "") ||
      !/^[0-9a-f]{64}$/u.test(sourceSnapshotHash ?? "") || typeof getHttpFixtureIds !== "function" ||
      !targetScope || [targetScope.tenantId,targetScope.parkId].some(v => typeof v !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u.test(v)) ||
      targetScope.scopeSha256 !== computeProductionImportTargetScopeHash(targetScope) ||
      !baselineCounts || Object.keys(baselineCounts).length !== TABLES.length || !phaseCounts || Object.keys(phaseCounts).length !== 4) fail();
  const baselineExpected = Object.fromEntries(TABLES.map(table => { const n = integer(baselineCounts[table]); if (table === "sys_org" ? ![14,15].includes(n) : n !== (table === "hr_contract_type" ? 3 : 0)) fail(); return [table,n]; }));
  const expectedPhases = PHASES.map(phase => { const p = phaseCounts[phase]; if (!p) fail(); const records=integer(p.records),inserted=integer(p.inserted),quarantined=integer(p.quarantined); if(records!==inserted+quarantined)fail(); return {records,inserted,quarantined}; });
  const scope = { ...targetScope }, runs = PHASES.map(p => `${runId}-${p.toLowerCase()}`), version = `lab-import-v1@${codeSha}`;
  async function query(tx, sql, parameters = []) { try { const r=await tx.query(sql,parameters); if(!Array.isArray(r.rows))fail(); return r.rows; } catch { fail(); } }
  async function guard(tx) {
    const rows=await query(tx,"/* lab-pg:identity */ SELECT current_database() AS database_name");
    if(rows.length!==1||rows[0].database_name!==expectedDatabase)fail();
    const active=await query(tx,`/* lab-pg:scope */ SELECT
      EXISTS(SELECT 1 FROM sys_tenant WHERE tenant_id::text=$1 AND status=1 AND is_deleted=false AND (expire_time IS NULL OR expire_time>clock_timestamp())) AS tenant_exists,
      EXISTS(SELECT 1 FROM biz_park WHERE tenant_id::text=$1 AND park_id::text=$2 AND status=1 AND is_deleted=false) AS park_exists`,[scope.tenantId,scope.parkId]);
    if(active.length!==1||active[0].tenant_exists!==true||active[0].park_exists!==true)fail();
  }
  async function counts(tx) {
    const result={};
    for(const table of TABLES){const r=await query(tx,`/* lab-pg:count */ SELECT count(*) AS n FROM ${table} WHERE tenant_id=$1 AND park_id=$2`,[scope.tenantId,scope.parkId]);if(r.length!==1)fail();result[table]=integer(r[0].n);}
    return result;
  }
  async function ledger(tx) {
    const rows=await query(tx,`/* lab-pg:ledger */ SELECT b.id::text,b.run_id,b.source_system,b.source_snapshot_sha256,b.target_database,b.tool_version,b.execution_context,b.phase,b.status,
      count(m.id) AS records,count(m.id) FILTER(WHERE m.is_active) AS active,count(m.id) FILTER(WHERE m.mapping_status='rolled_back') AS reversed,
      count(m.id) FILTER(WHERE m.mapping_status='loaded') AS inserted,count(m.id) FILTER(WHERE m.mapping_status='quarantined') AS quarantined
      FROM migration_batch b LEFT JOIN legacy_record_map m ON m.batch_id=b.id WHERE b.run_id=ANY($1::text[]) GROUP BY b.id`,[runs]);
    const seen=new Set();
    for(const row of rows){const index=runs.indexOf(row.run_id);if(index<0||seen.has(row.run_id)||!uuid.test(row.id)||row.source_system!==MODEL.sourceSystem||row.source_snapshot_sha256!==sourceSnapshotHash||row.target_database!==expectedDatabase||row.tool_version!==version||row.execution_context!=="lab_rehearsal"||row.phase!=="load")fail();seen.add(row.run_id);
      if(!["succeeded","rolled_back"].includes(row.status))fail();
      if(integer(row.records)!==expectedPhases[index].records)fail();
      if(row.status==="succeeded"){for(const key of ["inserted","quarantined"])if(integer(row[key])!==expectedPhases[index][key])fail();}
      else if(integer(row.reversed)!==expectedPhases[index].records)fail();
      if(integer(row.active)!==(row.status==="succeeded"?expectedPhases[index].records:0))fail();
    }
    return rows;
  }
  async function globalState(tx){const r=await query(tx,`/* lab-pg:global */ SELECT
    (SELECT count(*) FROM legacy_record_map WHERE is_active) AS active_maps,
    (SELECT count(*) FROM migration_batch WHERE status='running') AS running_batches,
    (SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND backend_type='client backend') AS other_connections`);if(r.length!==1)fail();return {active:integer(r[0].active_maps),running:integer(r[0].running_batches),other:integer(r[0].other_connections)};}
  async function fixtureResidual(tx){const ids=await getHttpFixtureIds();if(!ids||!Array.isArray(ids.userIds)||!Array.isArray(ids.roleIds)||[...ids.userIds,...ids.roleIds].some(id=>!uuid.test(id))||new Set([...ids.userIds,...ids.roleIds]).size!==ids.userIds.length+ids.roleIds.length)fail();
    const r=await query(tx,`/* lab-pg:fixtures */ SELECT
      (SELECT count(*) FROM sys_user WHERE id=ANY($1::uuid[])) + (SELECT count(*) FROM sys_role WHERE id=ANY($2::uuid[])) +
      (SELECT count(*) FROM rel_user_role WHERE user_id=ANY($1::uuid[]) OR role_id=ANY($2::uuid[])) +
      (SELECT count(*) FROM rel_role_perm WHERE role_id=ANY($2::uuid[])) +
      (SELECT count(*) FROM sys_auth_refresh_token WHERE user_id=ANY($1::uuid[])) AS n`,[ids.userIds,ids.roleIds]);if(r.length!==1)fail();return integer(r[0].n);}
  return {
    async captureBaseline({tx}){await guard(tx);const observed=await counts(tx),batches=await ledger(tx),state=await globalState(tx);if(TABLES.some(t=>observed[t]!==baselineExpected[t])||batches.length||state.active||state.running||state.other)fail();return {emptyWritableSlice:true,activeRunCount:0,scopeOwnedAndActive:true,otherWriters:0,tableCounts:observed};},
    async resolveApplyState({tx}){await guard(tx);const rows=await ledger(tx),state=await globalState(tx);if(state.running||state.other)fail();if(!rows.length){if(state.active)fail();const observed=await counts(tx);if(TABLES.some(t=>observed[t]!==baselineExpected[t]))fail();return "absent";}if(rows.length!==4||new Set(rows.map(r=>r.status)).size!==1)fail();const applied=rows[0].status==="succeeded";if(state.active!==(applied?expectedPhases.reduce((n,p)=>n+p.records,0):0))fail();if(!applied){const observed=await counts(tx);if(TABLES.some(t=>observed[t]!==baselineExpected[t]))fail();}return applied?"applied":"absent";},
    async verifyResidual({tx,baseline}){await guard(tx);if(!baseline?.tableCounts||TABLES.some(t=>baseline.tableCounts[t]!==baselineExpected[t]))fail();const observed=await counts(tx),rows=await ledger(tx),state=await globalState(tx),fixtures=await fixtureResidual(tx);const restored=TABLES.every(t=>observed[t]===baselineExpected[t]);if(!restored||state.active||state.running||state.other||fixtures||(rows.length!==0&&rows.length!==4)||rows.some(r=>r.status!=="rolled_back"))fail();return {baselineRestored:true,activeRunMaps:0,businessResidualRows:0,httpFixtureResidualRows:0};}
  };
}
