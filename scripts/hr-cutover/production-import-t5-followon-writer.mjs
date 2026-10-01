import { randomUUID } from "node:crypto";
import { canonicalT4, hashT4, sameT4 } from "./production-import-t4-followon-binding.mjs";
import { assertT5FollowonStageBinding, validateT5FollowonAuthorization } from "./t5-followon-binding.mjs";
import { readT5FullArchivePrivateStage } from "./t5-full-archive-private-stage.mjs";
import { classifyT5FullArchiveOwners, observeT5CoreOwners } from "./t5-followon-core-owners.mjs";
import { encryptT5OriginalSourceRows, reencryptT5MaterializedRows } from "./t5-production-protected-values.mjs";
import { projectT5NonfilePayloadRecords, projectT5NonfileStagedRecord } from "./production-import-t5-nonfile-stage-adapter.mjs";
import { writeT5FollowonTypedProjection } from "./production-import-t5-nonfile-writer.mjs";
import { prepareT5FollowonPhotos, insertT5FollowonPhotoFiles } from "./t5-followon-photos.mjs";

export const T5_FOLLOWON_TARGETS = Object.freeze(["hr_employee_profile", "hr_employee_family", "hr_employee_skill",
  "hr_employee_credential", "hr_custom_field_definition", "hr_custom_field_legacy_logic_fingerprint", "hr_employee_custom_value",
  "hr_legacy_identity_registry", "hr_legacy_archive_record", "hr_legacy_file_logical_record", "hr_legacy_file_blob_object",
  "hr_yuzhou_t5_followon_source", "sys_file"]);
const fail = code => { throw Object.assign(new Error(code), { code }); };
const SENSITIVE_KEYS = new Set(["password", "passwd", "pwd", "photo", "cont", "content", "blob", "binary"]);
const TITLES = Object.freeze({ family: ["family_member", "家庭成员资料"], knowhow: ["skill", "专业技能资料"],
  ticket: ["credential", "证书证照资料"], person_core: ["employee_profile", "旧系统员工资料"],
  readjust: ["employment_change", "人事异动原始资料"], compact: ["labor_contract", "劳动合同原始资料"],
  compact_c: ["labor_contract_change", "合同变更原始资料"], trainhis: ["training_history", "培训历史资料"] });

async function bulk(client, sql, rows, expected = rows.length) {
  let count = 0;
  for (let offset = 0; offset < rows.length; offset += 500) {
    const result = await client.query(sql, [JSON.stringify(rows.slice(offset, offset + 500))]);
    count += result.rowCount;
  }
  if (count !== expected) fail("T5_FOLLOWON_INSERT_CONSERVATION_FAILED");
}

async function recordReceipts(client, operationId, inserted, quarantined = []) {
  const receipts = [...inserted.map(({ record, targetId }) => ({ operation_id: operationId,
    target_table: record.targetTable, source_identity_sha256: record.sourceIdentitySha256,
    source_row_sha256: record.sourceRowSha256, disposition: "insert", target_id: targetId, reason_code: null })),
  ...quarantined.map(record => ({ operation_id: operationId, target_table: record.targetTable,
    source_identity_sha256: record.sourceIdentitySha256, source_row_sha256: record.sourceRowSha256,
    disposition: "quarantine", target_id: null, reason_code: record.quarantineReason }))];
  await bulk(client, `INSERT INTO hr_yuzhou_t5_followon_projection_receipt
    SELECT x.* FROM jsonb_to_recordset($1::jsonb) AS x(operation_id varchar,target_table varchar,
    source_identity_sha256 char(64),source_row_sha256 char(64),disposition varchar,target_id uuid,reason_code varchar)`, receipts);
}

async function appendSourcesAndArchives(client, binding, stage, byCode, keyring) {
  const classified = classifyT5FullArchiveOwners(stage.records, byCode);
  const sourceDomains = new Map(Object.entries(stage.manifest.domains).map(([domain, item]) => [item.sourceObject, domain]));
  const raw = [...stage.records, ...stage.definitionRecords];
  const encrypted = encryptT5OriginalSourceRows(raw, keyring);
  const owners = new Map(classified.classified.map(row => [row.record.sourceIdentitySha256, row]));
  const source = encrypted.map(row => {
    const owner = owners.get(row.sourceIdentitySha256);
    const domain = row.sourceTable === "dbo.defs" ? "definitions" : sourceDomains.get(row.sourceTable);
    if (!domain) fail("T5_FOLLOWON_SOURCE_DOMAIN_DRIFT");
    return { id: randomUUID(), operation_id: binding.operationId, tenant_id: binding.targetScope.tenantId,
      park_id: binding.targetScope.parkId, source_domain: domain, source_table: row.sourceTable,
      source_identity_sha256: row.sourceIdentitySha256, source_row_sha256: row.sourceRowSha256,
      encrypted_source: row.encryptedSource, owner_status: owner?.mappingStatus === "mapped" ? "mapped"
        : owner?.mappingStatus === "unmapped" ? "unmapped" : "not_applicable",
      employee_id: owner?.owner?.employee_id ?? null, owner_record_map_id: owner?.owner?.record_map_id ?? null };
  });
  await bulk(client, `INSERT INTO hr_yuzhou_t5_followon_source(id,operation_id,tenant_id,park_id,source_domain,
    source_table,source_identity_sha256,source_row_sha256,encrypted_source,owner_status,employee_id,owner_record_map_id)
    SELECT x.* FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,operation_id varchar,tenant_id varchar,park_id varchar,
    source_domain varchar,source_table varchar,source_identity_sha256 char(64),source_row_sha256 char(64),
    encrypted_source text,owner_status varchar,employee_id uuid,owner_record_map_id uuid)`, source);
  await recordReceipts(client, binding.operationId, source.map(row => ({ targetId: row.id,
    record: { targetTable: "hr_yuzhou_t5_followon_source", sourceIdentitySha256: row.source_identity_sha256,
      sourceRowSha256: row.source_row_sha256 } })));
  const registry = classified.classified.map(({ record, mappingStatus, owner }) => ({ id: randomUUID(),
    tenant_id: binding.targetScope.tenantId, park_id: binding.targetScope.parkId, source_system: "yuzhou-v10",
    source_table: record.sourceTable, source_identity_sha256: record.sourceIdentitySha256, source_row_sha256: record.sourceRowSha256,
    identity_kind: record.fileRole ? "file_logical" : "archive_record",
    mapping_status: mappingStatus === "mapped" ? "mapped" : mappingStatus === "unmapped" ? "quarantine" : "archive_only",
    owner_employee_id: owner?.employee_id ?? null, owner_record_map_id: owner?.record_map_id ?? null,
    owner_source_system: owner ? "yuzhou-v10" : null, owner_source_table: owner ? "dbo.person" : null,
    owner_source_identity_sha256: owner?.source_identity_sha256 ?? null }));
  await bulk(client, `INSERT INTO hr_legacy_identity_registry(id,tenant_id,park_id,source_system,source_table,
    source_identity_sha256,source_row_sha256,identity_kind,mapping_status,owner_employee_id,owner_record_map_id,
    owner_source_system,owner_source_table,owner_source_identity_sha256)
    SELECT x.* FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,tenant_id varchar,park_id varchar,source_system varchar,
    source_table varchar,source_identity_sha256 char(64),source_row_sha256 char(64),identity_kind varchar,mapping_status varchar,
    owner_employee_id uuid,owner_record_map_id uuid,owner_source_system varchar,owner_source_table varchar,owner_source_identity_sha256 char(64))`, registry);
  await recordReceipts(client, binding.operationId, registry.map(row => ({ targetId: row.id,
    record: { targetTable: "hr_legacy_identity_registry", sourceIdentitySha256: row.source_identity_sha256, sourceRowSha256: row.source_row_sha256 } })));
  const identity = new Map(registry.map(row => [row.source_identity_sha256, row.id]));
  const archive = [], logical = [];
  for (const record of stage.records) {
    const common = { id: randomUUID(), tenant_id: binding.targetScope.tenantId, park_id: binding.targetScope.parkId,
      identity_registry_id: identity.get(record.sourceIdentitySha256),
      sourceIdentitySha256: record.sourceIdentitySha256, sourceRowSha256: record.sourceRowSha256 };
    if (record.fileRole) {
      // Binary materialization is a separate, real file write. An absent source
      // document or unmaterialized photo never gets an invented available blob.
      logical.push({ ...common, logical_kind: record.fileRole === "employee_photo" ? "photo" : "document",
        logical_name: record.fileRole === "employee_photo" ? "旧系统员工照片" : "旧系统历史文档",
        source_locator_sha256: record.legacyPathSha256 ?? record.sourceIdentitySha256 });
    } else {
      const domain = sourceDomains.get(record.sourceTable), [record_type, display_title] = TITLES[domain] ?? ["legacy_history", "旧系统历史资料"];
      archive.push({ ...common, record_type, display_title,
        display_safe_projection: { legacyDomain: record.domain, isHistorical: true },
        restricted_safe_projection: { legacyFields: Object.fromEntries(Object.entries(record.source)
          .filter(([key]) => !SENSITIVE_KEYS.has(key.toLowerCase()))) } });
    }
  }
  await bulk(client, `INSERT INTO hr_legacy_archive_record(id,tenant_id,park_id,identity_registry_id,record_type,display_title,
    display_safe_projection,restricted_safe_projection) SELECT x.* FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,tenant_id varchar,
    park_id varchar,identity_registry_id uuid,record_type varchar,display_title varchar,display_safe_projection jsonb,restricted_safe_projection jsonb)`, archive);
  await bulk(client, `INSERT INTO hr_legacy_file_logical_record(id,tenant_id,park_id,identity_registry_id,logical_kind,logical_name,
    source_locator_sha256) SELECT x.* FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,tenant_id varchar,park_id varchar,
    identity_registry_id uuid,logical_kind varchar,logical_name varchar,source_locator_sha256 char(64))`, logical);
  for (const [targetTable, rows] of [["hr_legacy_archive_record", archive], ["hr_legacy_file_logical_record", logical]])
    await recordReceipts(client, binding.operationId, rows.map(record => ({ record: { ...record, targetTable }, targetId: record.id })));
  return { owners: classified.counts, sourceRecords: source.length, archiveRecords: archive.length,
    logicalFiles: logical.length, physicalFilesWritten: 0 };
}

export async function observeT5Payroll(client, binding, { lock = false } = {}) {
  const row = (await client.query(`SELECT status,parent_operation_id,binding_sha256,
    owned_state,hr_yuzhou_t4_followon_owned_state(operation_id) actual_state
    FROM hr_yuzhou_t4_followon_operation WHERE operation_id=$1${lock ? " FOR SHARE" : ""}`, [binding.payrollParent.operationId])).rows[0];
  if (!row || row.status !== "succeeded" || row.parent_operation_id !== binding.parent.operationId
    || row.binding_sha256 !== binding.payrollParent.bindingSha256 || !sameT4(row.owned_state, row.actual_state)
    || hashT4(canonicalT4(row.owned_state)) !== binding.payrollParent.ownedStateSha256) fail("T5_PAYROLL_PARENT_DRIFT");
}

/** Single independent append. No environment/connection/CLI is activated by
 * importing this module. Keys and source descriptors are supplied privately by
 * the host after verifying its actual API runtime and signed binding. */
export async function executeT5Followon({ client, binding, authorization, stageInput, sourceKeyBytes, productionKeyring, actorId,
  photoBundleBytes, photoStorage, rollback = false }) {
  const authorizationSha256 = validateT5FollowonAuthorization({ binding, authorization, intent: rollback ? "rollback" : "append" });
  if (actorId !== binding.actorId) fail("T5_FOLLOWON_ACTOR_DRIFT");
  const bindingSha256 = hashT4(canonicalT4(binding));
  let stage;
  if (!photoStorage || !["put", "verify", "remove"].every(name => typeof photoStorage[name] === "function")) fail("T5_PHOTO_STORAGE_REQUIRED");
  {
    const sourceBinding = assertT5FollowonStageBinding(stageInput, binding);
    stage = readT5FullArchivePrivateStage(stageInput, sourceBinding);
  }
  let commitStarted = false, commitCompleted = false, storedPhotos;
  await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  try {
    await client.query("SET LOCAL TIME ZONE 'Asia/Shanghai'; SET LOCAL statement_timeout='45min'; SET LOCAL lock_timeout='30s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`yuzhou-t5:${binding.targetScopeSha256}`]);
    const actor = (await client.query(`SELECT id::text FROM sys_user WHERE id=$1::uuid AND tenant_id=$2 AND park_id=$3
      AND is_enabled AND NOT is_deleted AND status='enabled' FOR KEY SHARE`,
    [actorId, binding.targetScope.tenantId, binding.targetScope.parkId])).rows;
    if (actor.length !== 1) fail("T5_FOLLOWON_ACTOR_NOT_ACTIVE_IN_SCOPE");
    const owner = await observeT5CoreOwners(client, binding, { lock: true });
    const photos = prepareT5FollowonPhotos({ bytes: photoBundleBytes, binding, stage, byCode: owner.byCode });
    await observeT5Payroll(client, binding, { lock: true });
    await client.query(`LOCK TABLE ${T5_FOLLOWON_TARGETS.join(",")} IN SHARE ROW EXCLUSIVE MODE`);
    await client.query(`INSERT INTO hr_yuzhou_t5_followon_authorization_use(nonce_sha256,authorization_sha256,operation_id,intent)
      VALUES($1,$2,$3,$4)`, [authorization.context.nonceSha256, authorizationSha256, binding.operationId, rollback ? "rollback" : "append"]);
    let receipt;
    if (rollback) {
      if (await photoStorage.verify(photos) !== true) fail("T5_PHOTO_STORAGE_DRIFT");
      await client.query("CALL hr_yuzhou_t5_followon_rollback($1,$2,$3,$4)", [binding.operationId, bindingSha256, authorizationSha256, authorization.context.nonceSha256]);
    } else {
      for (const table of T5_FOLLOWON_TARGETS) {
        if (table === "sys_file") continue; // Existing uploads are unrelated.
        if ((await client.query(`SELECT EXISTS(SELECT 1 FROM ${table} WHERE tenant_id=$1 AND park_id=$2) present`,
          [binding.targetScope.tenantId, binding.targetScope.parkId])).rows[0].present) fail("T5_FIRST_EMPTY_SCOPE_REQUIRED");
      }
      await client.query(`INSERT INTO hr_yuzhou_t5_followon_operation(operation_id,parent_operation_id,payroll_operation_id,binding_sha256,binding,status)
        VALUES($1,$2,$3,$4,$5,'running')`, [binding.operationId, binding.parent.operationId, binding.payrollParent.operationId, bindingSha256, binding]);
      const batchId = (await client.query(`INSERT INTO migration_batch(run_id,source_system,source_snapshot_sha256,target_database,
        execution_context,t5_followon_operation_id,phase,status,tool_version,started_at)
        VALUES($1,'yuzhou-v10',$2,current_database(),'t5_production_followon',$1,'load','running',$3,now()) RETURNING id::text`,
      [binding.operationId, binding.triple.sourceSnapshotHash, `t5-followon-v1@${binding.executionCodeSha}`])).rows[0].id;
      await photoStorage.put(photos); storedPhotos = photos;
      if (await photoStorage.verify(photos) !== true) fail("T5_PHOTO_STORAGE_DRIFT");
      receipt = await appendSourcesAndArchives(client, binding, stage, owner.byCode, productionKeyring);
      await insertT5FollowonPhotoFiles(client, binding, photos, actorId);
      await recordReceipts(client, binding.operationId, photos.files.map(file => ({ record: file.record, targetId: file.id })), photos.quarantined);
      receipt = { ...receipt, ...photos.receipt, physicalFilesWritten: photos.images.length };
      const translated = reencryptT5MaterializedRows(stage.records, { sourceKeyBytes, productionKeyring });
      const projection = projectT5NonfilePayloadRecords({ definitionLogicColumnPresentCount: 95,
        definitionEvidence: stage.definitionEvidence, employeeIndex: owner.employeeIndex,
        records: translated.records.filter(row => ["profile", "family", "skill", "credential"].includes(row.materialized?.kind)).map(projectT5NonfileStagedRecord) });
      const typed = await writeT5FollowonTypedProjection({ tx: client, binding, batchId, actorId, records: projection });
      await recordReceipts(client, binding.operationId, typed.inserted, typed.quarantined);
      // Fresh empty-table estimates otherwise join the entire scope to the
      // entire receipt set for each target. Analyze the transaction's inserted
      // rows before computing the full-row conservation checksum.
      await client.query(`ANALYZE ${[...T5_FOLLOWON_TARGETS, "hr_yuzhou_t5_followon_projection_receipt"].join(",")}`);
      await client.query(`UPDATE migration_batch SET phase='verify',status='succeeded',counts=$2,finished_at=now(),update_time=now()
        WHERE id=$1::uuid AND status='running'`, [batchId, { ...receipt, typedInserted: typed.inserted.length, typedQuarantined: typed.quarantined.length }]);
      await client.query(`UPDATE hr_yuzhou_t5_followon_operation SET status='succeeded',finished_at=clock_timestamp(),
        owned_state=hr_yuzhou_t5_followon_owned_state(operation_id),photo_state=$2::jsonb WHERE operation_id=$1 AND status='running'`,
      [binding.operationId, { ...photos.receipt, bundleSha256: binding.photoBundleSha256, physicalFilesVerified: true }]);
    }
    await observeT5CoreOwners(client, binding, { lock: true });
    await observeT5Payroll(client, binding, { lock: true });
    validateT5FollowonAuthorization({ binding, authorization, intent: rollback ? "rollback" : "append" });
    if (await photoStorage.verify(photos) !== true) fail("T5_PHOTO_STORAGE_DRIFT");
    commitStarted = true;
    await client.query("COMMIT");
    commitCompleted = true;
    if (rollback) {
      try { await photoStorage.remove(photos); } catch { fail("T5_COMMITTED_ROLLBACK_PHOTO_CLEANUP_REQUIRED"); }
    }
    return { status: rollback ? "ROLLED_BACK" : "SUCCEEDED", bindingSha256, authorizationSha256,
      ...(receipt ?? {}), fullProductMigrationComplete: false };
  } catch (error) {
    if (commitCompleted) throw error;
    try { await client.query("ROLLBACK"); } catch { fail("T5_OUTCOME_UNKNOWN_DO_NOT_RETRY"); }
    if (commitStarted) throw Object.assign(new Error("T5_OUTCOME_UNKNOWN_DO_NOT_RETRY", { cause: error }), { code: "T5_OUTCOME_UNKNOWN_DO_NOT_RETRY" });
    if (storedPhotos) {
      try { await photoStorage.remove(storedPhotos); } catch { fail("T5_FAILED_APPEND_PHOTO_CLEANUP_REQUIRED"); }
    }
    throw error;
  }
}
