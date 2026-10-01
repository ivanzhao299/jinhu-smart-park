import { T4_COUNTS, T4_FILES, T4_TABLES, canonicalT4, failT4, hashT4, sameT4, validateT4Authorization, validateT4Binding } from "./production-import-t4-followon-binding.mjs";
import { t4StageRows } from "./production-import-t4-followon-private-stage.mjs";
import { T4_INSERT_PREFIX, T4_INSERT_SHARD, T4_SUFFIX_STEPS } from "./production-import-t4-followon-sql.mjs";

const PROTECTED = Object.freeze(["sys_org", "hr_position", "hr_employment_event", "hr_contract_type", "hr_contract", "hr_contract_change", "hr_contract_legacy_evidence", "hr_attendance_import_batch", "hr_attendance_symbol_rule", "hr_attendance_calendar_source", "hr_attendance_day", "hr_insurance_policy", "hr_insurance_policy_item", "hr_employee_insurance_item", "hr_employee", "hr_employee_compensation", "hr_compensation_plan", "hr_compensation_item", "hr_employee_insurance_period", "hr_attendance_request", "hr_attendance_shift", "hr_attendance_punch_event", "hr_attendance_calculation_version", "hr_employee_attendance_daily_result", "hr_attendance_period", "hr_attendance_month_summary", "hr_attendance_payroll_input_batch", "hr_attendance_payroll_input_item", "hr_payroll_run", "hr_payslip", "hr_payslip_item", "biz_user_message", "hr_payroll_payment", "hr_payroll_bank_export", "hr_payroll_tax_submission", "hr_payroll_outbox"]);
const TEMP_TABLES = ["sm", "si", "sf", "st", "sc", "sp_all"];

export async function observeT4Parent(client, binding, receipt, { lock = false } = {}) {
  validateT4Binding(binding);
  const { parent, triple, targetScope } = binding;
  if (receipt.status !== "SUCCEEDED" || receipt.sealedPlanSha256 !== parent.sealedPlanSha256 || receipt.targetScopeSha256 !== binding.targetScopeSha256 || receipt.receiptSha256 !== parent.receiptSha256 || !sameT4(receipt.domains, ["T0", "T1", "T2", "T3"]) || receipt.receiptSha256 !== hashT4(`${parent.operationId}\0${parent.sealedPlanSha256}\0succeeded\0T0,T1,T2,T3`)) failT4("T4_PARENT_SUCCESS_RECEIPT_INVALID");
  const op = (await client.query(`SELECT * FROM hr_yuzhou_production_import_operation WHERE operation_id=$1${lock ? " FOR SHARE" : ""}`, [parent.operationId])).rows[0];
  if (!op || op.status !== "succeeded" || op.code_sha !== triple.codeSha || op.source_snapshot_sha256 !== triple.sourceSnapshotHash || op.mapping_contract_sha256 !== triple.mappingContractHash || op.sealed_plan_sha256 !== parent.sealedPlanSha256 || op.target_identity_sha256 !== binding.targetIdentitySha256 || op.target_scope_sha256 !== binding.targetScopeSha256 || op.target_tenant_id !== targetScope.tenantId || op.target_park_id !== targetScope.parkId || op.final_rehearsal_pair_sha256 !== binding.finalRehearsalPairSha256) failT4("T4_PARENT_DATABASE_BINDING_MISMATCH");
  const phases = (await client.query("SELECT phase,status,planned_record_count,applied_record_count,payload_bundle_sha256 FROM hr_yuzhou_production_import_phase WHERE operation_id=$1 ORDER BY phase", [parent.operationId])).rows;
  if (!sameT4(phases.map(p => p.phase), ["T0", "T1", "T2", "T3"]) || phases.some(p => p.status !== "succeeded" || p.planned_record_count !== p.applied_record_count || p.payload_bundle_sha256 !== parent.payloadBundleSha256[p.phase])) failT4("T4_PARENT_PHASE_DRIFT");
  const observed = (await client.query(`
    SELECT count(*)::text count,
      count(*) FILTER(WHERE r.rollback_status<>'not_started' OR m.id IS NULL OR NOT m.is_active OR m.source_identity_sha256<>r.source_identity_sha256 OR m.source_row_sha256<>r.source_row_sha256 OR m.target_id IS DISTINCT FROM r.target_id OR (r.target_table='hr_employee' AND (e.id IS NULL OR e.tenant_id<>$2 OR e.park_id<>$3 OR e.is_deleted)))::text invalid,
      encode(digest(COALESCE(string_agg(encode(digest(jsonb_build_object('record',to_jsonb(r),'map',to_jsonb(m),'employee',to_jsonb(e))::text,'sha256'),'hex'),'' ORDER BY r.phase,r.source_identity_sha256),''),'sha256'),'hex') sha256
    FROM hr_yuzhou_production_import_record r
    LEFT JOIN hr_yuzhou_production_import_projection_receipt p USING(operation_id,phase,source_identity_sha256)
    LEFT JOIN legacy_record_map m ON m.id=p.legacy_record_map_id
    LEFT JOIN hr_employee e ON r.target_table='hr_employee' AND e.id=r.target_id
    WHERE r.operation_id=$1`, [parent.operationId, targetScope.tenantId, targetScope.parkId])).rows[0];
  if (observed.invalid !== "0" || BigInt(observed.count) !== phases.reduce((sum, p) => sum + BigInt(p.applied_record_count), 0n)) failT4("T4_PARENT_RECORD_MAP_DRIFT");
  return { recordSetSha256: observed.sha256, recordCount: observed.count };
}

async function protectedState(client) {
  const result = {};
  for (const table of PROTECTED) {
    const present = (await client.query("SELECT to_regclass($1) IS NOT NULL present", [`public.${table}`])).rows[0].present;
    result[table] = present ? (await client.query(`SELECT count(*)::text count,encode(digest(COALESCE(string_agg(row_hash,'' ORDER BY row_hash),''),'sha256'),'hex') sha256 FROM (SELECT encode(digest(to_jsonb(x)::text,'sha256'),'hex') row_hash FROM public.${table} x) q`)).rows[0] : null;
  }
  return result;
}

async function loadStage(client, stage, binding) {
  for (let i = 0; i < T4_FILES.length; i += 1) {
    const bytes = stage.buffers[T4_FILES[i]];
    if (hashT4(bytes) !== binding.files[T4_FILES[i]]) failT4("T4_STAGE_BYTES_CHANGED");
    await client.query(`CREATE TEMP TABLE ${TEMP_TABLES[i]}(j jsonb) ON COMMIT DROP`);
    let rows = [];
    const flush = async () => { if (rows.length) await client.query(`INSERT INTO ${TEMP_TABLES[i]} SELECT value FROM jsonb_array_elements($1::jsonb)`, [JSON.stringify(rows)]); rows = []; };
    for (const row of t4StageRows(bytes)) { rows.push(row); if (rows.length === 100) await flush(); }
    await flush();
  }
}

async function assertSourceConservation(client) {
  // All arithmetic stays numeric in PostgreSQL, including multiplicity. Never
  // filter source history by the employee's present employment status.
  const result = (await client.query(`SELECT
    sum((j->>'sourceMultiplicity')::numeric)::text full_rows,
    sum(jsonb_array_length(j->'values'))::text full_items,
    sum((j->>'sourceMultiplicity')::numeric) FILTER(WHERE (j->'source'->>'year')::int>=2024)::text hot_rows,
    sum(jsonb_array_length(j->'values')) FILTER(WHERE (j->'source'->>'year')::int>=2024)::text hot_items,
    (SELECT count(*)::text FROM sc WHERE (j->'source'->>'year')::int>=2024) hot_closes,
    count(*) FILTER(WHERE j->>'disposition'<>'candidate' OR (j->>'sourceMultiplicity')::numeric<>1)::text invalid
    FROM sp_all`)).rows[0];
  const expected = { full_rows: String(T4_COUNTS.sourceRows), full_items: String(T4_COUNTS.snapshotItems), hot_rows: String(T4_COUNTS.hotRows), hot_items: String(T4_COUNTS.hotItems), hot_closes: String(T4_COUNTS.hotCloses), invalid: "0" };
  if (!sameT4(result, expected)) failT4("T4_SOURCE_COUNT_CONSERVATION_FAILED");
  // Candidate rows must never be silently admitted through employee_unmapped
  // precedence if their period/catalog/source values are invalid.
  if ((await client.query(`SELECT EXISTS(SELECT 1 FROM sp_all WHERE (j->'source'->>'year')::int NOT BETWEEN 2010 AND 2026 OR (j->'source'->>'month')::int NOT BETWEEN 1 AND 12 OR NOT EXISTS(SELECT 1 FROM sc WHERE sc.j->'source'->>'scheme'=sp_all.j->>'legacyScheme' AND sc.j->'source'->>'year'=sp_all.j->'source'->>'year' AND sc.j->'source'->>'month'=sp_all.j->'source'->>'month')) invalid`)).rows[0].invalid) failT4("T4_SOURCE_PERIOD_INVALID");
}

async function assertAmounts(client, binding, target = false) {
  for (const window of ["full", "hot"]) {
    const source = target
      ? `SELECT v.kind,sum(v.amount*s.source_multiplicity)::numeric(24,4)::text total FROM hr_payroll_legacy_snapshot s JOIN hr_payroll_book_period p ON p.id=s.book_period_id CROSS JOIN LATERAL (VALUES('gross_total',s.gross_amount),('deduction_total',s.deduction_amount),('tax_total',s.tax_amount),('net_total',s.net_amount)) v(kind,amount) WHERE s.remark='T4 run='||$1 ${window === "hot" ? "AND p.period_month>=DATE'2024-01-01'" : ""} GROUP BY v.kind`
      : `SELECT x->>'systemSummary' kind,COALESCE(sum((x->'value'->>'decimal')::numeric*(j->>'sourceMultiplicity')::numeric),0)::numeric(24,4)::text total FROM sp_all CROSS JOIN LATERAL jsonb_array_elements(j->'values') x WHERE x->>'systemSummary' IN('gross_total','deduction_total','tax_total','net_total') ${window === "hot" ? "AND (j->'source'->>'year')::int>=2024" : ""} GROUP BY x->>'systemSummary'`;
    const totals = Object.fromEntries((await client.query(source, target ? [binding.operationId] : [])).rows.map(row => [row.kind, row.total ?? "0.0000"]));
    if (!sameT4(totals, binding.amountTotals[window])) failT4("T4_WEIGHTED_AMOUNT_CONSERVATION_FAILED");
  }
}

export async function executeT4Followon({ client, binding, authorization, parentReceipt, stage, rollback = false }) {
  const authorizationSha256 = validateT4Authorization({ binding, authorization, intent: rollback ? "rollback" : "append" });
  if (!rollback && (!stage?.manifestBytes || hashT4(stage.manifestBytes) !== binding.manifestSha256 || !sameT4(JSON.parse(stage.manifestBytes), stage.manifest))) failT4("T4_STAGE_MANIFEST_CHANGED");
  const bindingSha256 = hashT4(canonicalT4(binding));
  let commitStarted = false;
  await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  try {
    await client.query("SET LOCAL search_path=public,pg_temp; SET LOCAL statement_timeout='45min'; SET LOCAL lock_timeout='30s'; SET LOCAL TIME ZONE 'Asia/Shanghai'");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`yuzhou-t4:${binding.targetScopeSha256}`]);
    const parent = await observeT4Parent(client, binding, parentReceipt, { lock: true });
    if (parent.recordSetSha256 !== binding.parent.recordSetSha256) failT4("T4_PARENT_RECORD_HASH_MISMATCH");
    await client.query(`LOCK TABLE ${T4_TABLES.join(",")} IN SHARE ROW EXCLUSIVE MODE`);
    const before = await protectedState(client);
    await client.query("INSERT INTO hr_yuzhou_t4_followon_authorization_use(nonce_sha256,authorization_sha256,operation_id,intent) VALUES($1,$2,$3,$4)", [authorization.context.nonceSha256, authorizationSha256, binding.operationId, rollback ? "rollback" : "append"]);
    if (rollback) {
      await client.query("CALL hr_yuzhou_t4_followon_rollback($1,$2,$3,$4)", [binding.operationId, bindingSha256, authorizationSha256, authorization.context.nonceSha256]);
    } else {
      for (const table of T4_TABLES) if ((await client.query(`SELECT EXISTS(SELECT 1 FROM ${table} WHERE tenant_id=$1 AND park_id=$2) present`, [binding.targetScope.tenantId, binding.targetScope.parkId])).rows[0].present) failT4("T4_FIRST_EMPTY_SCOPE_REQUIRED");
      await loadStage(client, stage, binding);
      await assertSourceConservation(client);
      await assertAmounts(client, binding);
      const settings = { execution_code: binding.executionCodeSha, run: binding.operationId, db: (await client.query("SELECT current_database() db")).rows[0].db, tenant: binding.targetScope.tenantId, park: binding.targetScope.parkId, mode: "full_archive", expected_rows: "46092", expected_items: "1078020", expected_net: T4_COUNTS.fullNet, expected_closes: "1431", period_start: "2010-01-01", period_end: "2026-12-01", snap: binding.triple.sourceSnapshotHash, catalog: stage.manifest.actualCatalogSha256, mh: binding.manifestSha256, bh: binding.sourceBusinessSha256 };
      for (const [key, value] of Object.entries(settings)) await client.query("SELECT set_config($1,$2,true)", [`yuzhou.${key}`, value]);
      await client.query(T4_INSERT_PREFIX);
      // em initially follows the existing loader's unique employee-code rule.
      // Every resolved employee must also belong to the succeeded core T0 map.
      if ((await client.query(`SELECT EXISTS(SELECT 1 FROM em WHERE n=1 AND (EXISTS(SELECT 1 FROM sp_all WHERE j->'source'->>'person'=em.employee_code) OR EXISTS(SELECT 1 FROM sm WHERE j->'source'->>'person'=em.employee_code)) AND NOT EXISTS(SELECT 1 FROM hr_yuzhou_production_import_record r WHERE r.operation_id=$1 AND r.phase='T0' AND r.target_table='hr_employee' AND r.target_id=em.id AND r.rollback_status='not_started')) invalid`, [binding.parent.operationId])).rows[0].invalid) failT4("T4_EMPLOYEE_OUTSIDE_CORE_MAP");
      // Fresh-table estimates chose the (tenant,park,employee) index for the
      // snapshot FK, scanning the whole scope for each item. The synthetic
      // 46,092-row EXPLAIN switches to snapshot_pkey after this ANALYZE.
      await client.query("ANALYZE hr_payroll_legacy_snapshot");
      for (const shard of "0123456789abcdef") await client.query(T4_INSERT_SHARD, [shard]);
      await client.query("ANALYZE hr_payroll_legacy_snapshot_item");
      for (const statement of T4_SUFFIX_STEPS) await client.query(statement);
      await assertAmounts(client, binding, true);
      const target = (await client.query("SELECT loaded_row_count::text,quarantined_row_count::text,source_amount_total::text,loaded_amount_total::text,status FROM hr_payroll_legacy_batch WHERE batch_code=$1", [binding.operationId])).rows[0];
      if (!sameT4(target, { loaded_row_count: "46092", quarantined_row_count: "0", source_amount_total: T4_COUNTS.fullNet, loaded_amount_total: T4_COUNTS.fullNet, status: "staged" })) failT4("T4_TARGET_CONSERVATION_FAILED");
      await client.query("INSERT INTO hr_yuzhou_t4_followon_operation(operation_id,parent_operation_id,binding_sha256,binding,status,owned_state) VALUES($1,$2,$3,$4::jsonb,'succeeded',hr_yuzhou_t4_followon_owned_state($1))", [binding.operationId, binding.parent.operationId, bindingSha256, JSON.stringify(binding)]);
    }
    if ((await observeT4Parent(client, binding, parentReceipt)).recordSetSha256 !== binding.parent.recordSetSha256) failT4("T4_PARENT_RECORD_HASH_MISMATCH");
    if (!sameT4(before, await protectedState(client))) failT4("T4_PROTECTED_STATE_DRIFT");
    validateT4Authorization({ binding, authorization, intent: rollback ? "rollback" : "append" });
    commitStarted = true;
    await client.query("COMMIT");
    return { status: rollback ? "ROLLED_BACK" : "SUCCEEDED", bindingSha256, authorizationSha256, published: false, fullProductMigrationComplete: false, ...(rollback ? {} : { counts: T4_COUNTS }) };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { failT4("T4_OUTCOME_UNKNOWN_DO_NOT_RETRY"); }
    if (commitStarted) failT4("T4_OUTCOME_UNKNOWN_DO_NOT_RETRY");
    throw error;
  }
}
