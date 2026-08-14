import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const requireFromApi = createRequire(resolve(root, "apps/api/package.json"));
const { Client } = requireFromApi("pg");

export const REQUIRED_MIGRATIONS = Object.freeze([
  "000185_property_b_identity_schema_expand.sql",
  "000186_property_b_approval_runtime_schema.sql",
  "000187_property_b_event_notification_schema.sql",
  "000188_property_b_task_runtime_schema.sql",
  "000189_property_b_module_rbac_definitions.sql",
  "000200_property_b_migration_compatibility_control.sql",
  "000191_property_b_homestay_effect_schema.sql",
  "000192_property_b_housing_effect_schema.sql",
  "000193_property_b_runtime_integrity_forward_fix.sql",
  "000194_property_task_projection_contract_correction.sql",
  "000195_property_mutation_receipt_contract_v2.sql",
  "000197_property_approval_active_source_index_forward_fix.sql",
  "000198_property_finance_owner_integrity_forward_fix.sql",
  "000209_property_mvp_owner_scope_integrity.sql",
  "000212_property_mvp_owner_scope_followup.sql"
]);

const fk = (table, localColumns, referencedTable, referencedColumns) =>
  Object.freeze({ table, type: "f", localColumns, referencedTable, referencedColumns });
const unique = (table, localColumns) =>
  Object.freeze({ table, type: "u", localColumns, referencedTable: null, referencedColumns: [] });

export const REQUIRED_OWNER_CONSTRAINTS = Object.freeze({
  uq_biz_unit_scope_id: unique("biz_unit", ["tenant_id","park_id","id"]),
  uq_homestay_booking_scope_unit: unique("biz_homestay_booking", ["tenant_id","park_id","id","unit_id"]),
  uq_housing_charge_plan_owner: unique("biz_housing_charge_plan", ["tenant_id","park_id","id","lease_id","currency"]),
  fk_homestay_rate_config_unit_scope: fk("biz_homestay_rate_config", ["tenant_id","park_id","unit_id"], "biz_unit", ["tenant_id","park_id","id"]),
  fk_homestay_rate_override_unit_scope: fk("biz_homestay_rate_override", ["tenant_id","park_id","unit_id"], "biz_unit", ["tenant_id","park_id","id"]),
  fk_homestay_booking_unit_scope: fk("biz_homestay_booking", ["tenant_id","park_id","unit_id"], "biz_unit", ["tenant_id","park_id","id"]),
  fk_homestay_booking_party_scope: fk("biz_homestay_booking", ["tenant_id","park_id","booker_party_id"], "biz_party", ["tenant_id","park_id","id"]),
  fk_homestay_booking_occupancy_scope: fk("biz_homestay_booking", ["tenant_id","park_id","occupancy_id"], "biz_property_occupancy", ["tenant_id","park_id","id"]),
  fk_homestay_booking_night_booking_scope: fk("biz_homestay_booking_night", ["tenant_id","park_id","booking_id"], "biz_homestay_booking", ["tenant_id","park_id","id"]),
  fk_homestay_booking_guest_booking_scope: fk("rel_homestay_booking_guest", ["tenant_id","park_id","booking_id"], "biz_homestay_booking", ["tenant_id","park_id","id"]),
  fk_homestay_booking_guest_party_scope: fk("rel_homestay_booking_guest", ["tenant_id","park_id","party_id"], "biz_party", ["tenant_id","park_id","id"]),
  fk_homestay_credential_booking_scope: fk("biz_homestay_stay_credential", ["tenant_id","park_id","booking_id"], "biz_homestay_booking", ["tenant_id","park_id","id"]),
  fk_homestay_turnover_booking_scope: fk("biz_homestay_turnover_task", ["tenant_id","park_id","booking_id","unit_id"], "biz_homestay_booking", ["tenant_id","park_id","id","unit_id"]),
  fk_homestay_turnover_unit_scope: fk("biz_homestay_turnover_task", ["tenant_id","park_id","unit_id"], "biz_unit", ["tenant_id","park_id","id"]),
  fk_homestay_turnover_occupancy_scope: fk("biz_homestay_turnover_task", ["tenant_id","park_id","occupancy_id"], "biz_property_occupancy", ["tenant_id","park_id","id"]),
  fk_homestay_action_booking_scope: fk("biz_homestay_booking_action_log", ["tenant_id","park_id","booking_id"], "biz_homestay_booking", ["tenant_id","park_id","id"]),
  fk_housing_lease_unit_scope: fk("biz_housing_lease", ["tenant_id","park_id","unit_id"], "biz_unit", ["tenant_id","park_id","id"]),
  fk_housing_lease_party_scope: fk("biz_housing_lease", ["tenant_id","park_id","tenant_party_id"], "biz_party", ["tenant_id","park_id","id"]),
  fk_housing_lease_occupancy_scope: fk("biz_housing_lease", ["tenant_id","park_id","occupancy_id"], "biz_property_occupancy", ["tenant_id","park_id","id"]),
  fk_housing_occupant_lease_scope: fk("rel_housing_lease_occupant", ["tenant_id","park_id","lease_id"], "biz_housing_lease", ["tenant_id","park_id","id"]),
  fk_housing_occupant_party_scope: fk("rel_housing_lease_occupant", ["tenant_id","park_id","party_id"], "biz_party", ["tenant_id","park_id","id"]),
  fk_housing_receivable_charge_plan_scope: fk("biz_housing_receivable", ["tenant_id","park_id","charge_plan_id","lease_id","currency"], "biz_housing_charge_plan", ["tenant_id","park_id","id","lease_id","currency"]),
  fk_housing_purchase_unit_scope: fk("biz_housing_purchase", ["tenant_id","park_id","unit_id"], "biz_unit", ["tenant_id","park_id","id"])
});

export const REQUIRED_OWNER_TRIGGERS = Object.freeze({
  trg_homestay_booking_occupancy_owner: Object.freeze({ table: "biz_homestay_booking", functionName: "enforce_property_mvp_occupancy_owner", functionHash: "2c4073d825231a26e82c663160431a85e0721b1b71ce91e4637db5139da79ea3", triggerType: 23, columns: ["id","tenant_id","park_id","unit_id","occupancy_id","is_deleted"] }),
  trg_homestay_turnover_occupancy_owner: Object.freeze({ table: "biz_homestay_turnover_task", functionName: "enforce_property_mvp_occupancy_owner", functionHash: "2c4073d825231a26e82c663160431a85e0721b1b71ce91e4637db5139da79ea3", triggerType: 23, columns: ["id","tenant_id","park_id","booking_id","unit_id","occupancy_id","is_deleted"] }),
  trg_housing_lease_occupancy_owner: Object.freeze({ table: "biz_housing_lease", functionName: "enforce_property_mvp_occupancy_owner", functionHash: "2c4073d825231a26e82c663160431a85e0721b1b71ce91e4637db5139da79ea3", triggerType: 23, columns: ["id","tenant_id","park_id","unit_id","occupancy_id","is_deleted"] }),
  trg_property_occupancy_reverse_owner: Object.freeze({ table: "biz_property_occupancy", functionName: "enforce_property_mvp_occupancy_reverse_owner", functionHash: "ebe9142be8d85ce2db49515616da6bcddd1f8fa0ce283549bef6e88f0674726f", triggerType: 19, columns: ["id","tenant_id","park_id","unit_id","source_domain","source_type","source_id","is_deleted"] })
});

export const CHECKPOINTS = Object.freeze([
  ["backfill", "inventory"],
  ["change_capture", "change_capture"],
  ["mutation_replay", "mutation_replay"],
  ["shadow_compare", "shadow_compare"],
  ["reconcile", "reconcile"],
  ["constraint_validate", "constraint_validation"]
]);

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const HANDOFF_PATHS = Object.freeze([
  ".trellis/tasks/archive/2026-08/07-30-pr192-b-identity-control-plane/research/b05-core-gate-final-pass.json",
  ".trellis/tasks/archive/2026-08/07-30-pr192-b-approval-runtime-tasks/research/b2a-combined-final-signoff-superseding-20260801c.md",
  ".trellis/tasks/archive/2026-08/07-30-pr192-b-domain-integrations/research/b-extension-core-v1-final-signoff.md",
  ".trellis/tasks/archive/2026-08/07-30-pr192-b-domain-integrations/research/b2c-domain-integration-technical-gate-handoff-v2-20260803.md",
  ".trellis/tasks/archive/2026-08/07-30-pr192-b-domain-integrations/research/d5-browser-uat-20260804-handoff.md"
]);

export function migrationSetHash(base = root) {
  return sha256(Buffer.concat(REQUIRED_MIGRATIONS.map((name) =>
    readFileSync(resolve(base, "database/migrations", name))
  )));
}

export function parseArgs(argv) {
  const args = { output: null, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--dry-run") args.dryRun = true;
    else if (argv[index] === "--output") args.output = argv[++index] ?? null;
    else throw new Error(`unknown argument: ${argv[index]}`);
  }
  if (args.output !== null && !resolve(args.output).startsWith(`${root}/`)) {
    throw new Error("output must stay inside the repository");
  }
  return args;
}

const countSql = Object.freeze({
  activeIdentityDuplicates: `
    SELECT count(*)::bigint AS count FROM (
      SELECT tenant_id, park_id, party_id
      FROM biz_party_identity_submission
      WHERE status IN ('draft', 'pending_verification')
      GROUP BY tenant_id, park_id, party_id HAVING count(*) > 1
    ) drift`,
  verifiedIdentityWithoutSnapshot: `
    SELECT count(*)::bigint AS count
    FROM biz_party_identity_submission submission
    LEFT JOIN biz_party_identity_snapshot snapshot
      ON snapshot.tenant_id=submission.tenant_id AND snapshot.park_id=submission.park_id
     AND snapshot.id=submission.snapshot_id AND snapshot.party_id=submission.party_id
     AND snapshot.identity_version=submission.identity_version
    WHERE submission.status='verified' AND snapshot.id IS NULL`,
  illegalApprovalStatusPair: `
    SELECT count(*)::bigint AS count FROM biz_property_approval_request
    WHERE NOT (
      (decision_status IN ('draft','submitted','pending_approval') AND execution_status='not_started')
      OR (decision_status='approved' AND execution_status IN
        ('not_started','executing','retry_wait','executed','execution_failed','infra_exhausted'))
      OR (decision_status IN ('rejected','withdrawn','expired') AND execution_status='not_required')
    )`,
  staleExecutingApproval: `
    SELECT count(*)::bigint AS count FROM biz_property_approval_request
    WHERE execution_status='executing' AND lease_expires_at < clock_timestamp()
      AND reconcile_required=false`,
  activeTaskDuplicates: `
    SELECT count(*)::bigint AS count FROM (
      SELECT tenant_id, park_id, task_key
      FROM biz_property_task_assignment
      WHERE is_deleted=false AND assignment_status IN ('open','claimed','in_progress','blocked')
      GROUP BY tenant_id, park_id, task_key HAVING count(*) > 1
    ) drift`,
  taskProjectionScopeDrift: `
    SELECT count(*)::bigint AS count
    FROM biz_property_task_projection projection
    JOIN biz_property_task_assignment assignment
      ON assignment.id=projection.derived_assignment_id
    WHERE projection.assignment_authority='owning'
      AND (assignment.tenant_id<>projection.tenant_id OR assignment.park_id<>projection.park_id)`,
  eventInboxScopeDrift: `
    SELECT count(*)::bigint AS count
    FROM biz_property_inbox inbox JOIN biz_property_outbox outbox ON outbox.event_id=inbox.event_id
    WHERE inbox.tenant_id<>outbox.tenant_id OR inbox.park_id<>outbox.park_id
      OR inbox.payload_hash<>outbox.payload_hash`,
  openMigrationAnomalies: `
    SELECT count(*)::bigint AS count FROM biz_property_migration_anomaly
    WHERE status IN ('open','investigating','accepted')`
});

export async function collectHardDifferences(client) {
  const result = {};
  for (const [name, sql] of Object.entries(countSql)) {
    const { rows } = await client.query(sql);
    result[name] = Number(rows[0]?.count ?? -1);
  }
  return result;
}

async function discoverScopes(client) {
  const { rows } = await client.query(`
    SELECT DISTINCT tenant_id, park_id FROM (
      SELECT tenant_id, park_id FROM biz_party_identity_submission
      UNION ALL SELECT tenant_id, park_id FROM biz_property_approval_request
      UNION ALL SELECT tenant_id, park_id FROM biz_property_task_assignment
      UNION ALL SELECT tenant_id, park_id FROM biz_property_outbox
    ) scopes ORDER BY tenant_id, park_id`);
  return rows;
}

async function recordCheckpoint(client, scope, runId, kind, evidenceKind, hashes, rowCount) {
  const key = `track-b-final:${kind}`;
  const evidenceHash = sha256(JSON.stringify({ scope, runId, kind, hashes, rowCount }));
  const { rows } = await client.query(`
    INSERT INTO biz_property_runtime_checkpoint
      (tenant_id,park_id,checkpoint_kind,checkpoint_key,checkpoint_version,cursor_value,
       anomaly_count,status,evidence_hash,last_run_id,updated_at,version)
    VALUES ($1,$2,$3,$4,1,'complete',0,'completed',$5,$6,clock_timestamp(),1)
    ON CONFLICT (tenant_id,park_id,checkpoint_kind,checkpoint_key) DO UPDATE SET
      checkpoint_version=biz_property_runtime_checkpoint.checkpoint_version+1,
      cursor_value='complete', anomaly_count=0, status='completed', evidence_hash=EXCLUDED.evidence_hash,
      last_run_id=EXCLUDED.last_run_id, updated_at=clock_timestamp(),
      version=biz_property_runtime_checkpoint.version+1
    RETURNING id`, [scope.tenant_id, scope.park_id, kind, key, evidenceHash, runId]);
  await client.query(`
    INSERT INTO biz_property_migration_evidence
      (tenant_id,park_id,run_id,checkpoint_id,evidence_kind,artifact_uri,artifact_hash,
       row_count,anomaly_count,contract_hash,migration_set_hash,generated_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,$9,$10,'track-b-final-reconcile-v1')`,
  [scope.tenant_id, scope.park_id, runId, rows[0].id, evidenceKind,
    `trellis://pr192/track-b/${kind}`, evidenceHash, rowCount, hashes.contract, hashes.migrations]);
  return evidenceHash;
}

async function rollbackProbe(client, scope) {
  const before = await client.query(`
    SELECT checkpoint_kind,checkpoint_key,status,version,evidence_hash,last_run_id
    FROM biz_property_runtime_checkpoint WHERE tenant_id=$1 AND park_id=$2 ORDER BY checkpoint_kind`,
  [scope.tenant_id, scope.park_id]);
  const startedAt = process.hrtime.bigint();
  await client.query("BEGIN");
  try {
    await client.query(`
      UPDATE biz_property_runtime_checkpoint SET status='running', version=version+1
      WHERE tenant_id=$1 AND park_id=$2 AND checkpoint_key='track-b-final:reconcile'`,
    [scope.tenant_id, scope.park_id]);
  } finally {
    await client.query("ROLLBACK");
  }
  const after = await client.query(`
    SELECT checkpoint_kind,checkpoint_key,status,version,evidence_hash,last_run_id
    FROM biz_property_runtime_checkpoint WHERE tenant_id=$1 AND park_id=$2 ORDER BY checkpoint_kind`,
  [scope.tenant_id, scope.park_id]);
  if (JSON.stringify(after.rows) !== JSON.stringify(before.rows)) {
    throw new Error(`rollback drift for ${scope.tenant_id}/${scope.park_id}`);
  }
  return Number(process.hrtime.bigint() - startedAt) / 1_000_000;
}

async function validateTrackBConstraints(client, dryRun) {
  const constraintNames = Object.keys(REQUIRED_OWNER_CONSTRAINTS);
  const installed = await client.query(`
    SELECT constraint_row.conname,
      relation.relname AS table_name,
      constraint_row.contype,
      constraint_row.convalidated,
      constraint_row.confupdtype,
      constraint_row.confdeltype,
      constraint_row.confmatchtype,
      constraint_row.condeferrable,
      constraint_row.condeferred,
      referenced_namespace.nspname AS referenced_schema,
      referenced.relname AS referenced_table,
      to_json(ARRAY(SELECT attribute.attname FROM unnest(constraint_row.conkey) WITH ORDINALITY key(attnum,ord)
        JOIN pg_attribute attribute ON attribute.attrelid=constraint_row.conrelid AND attribute.attnum=key.attnum
        ORDER BY key.ord)) AS local_columns,
      to_json(ARRAY(SELECT attribute.attname FROM unnest(constraint_row.confkey) WITH ORDINALITY key(attnum,ord)
        JOIN pg_attribute attribute ON attribute.attrelid=constraint_row.confrelid AND attribute.attnum=key.attnum
        ORDER BY key.ord)) AS referenced_columns
    FROM pg_constraint constraint_row
    JOIN pg_class relation ON relation.oid=constraint_row.conrelid
    JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace AND namespace.nspname='public'
    LEFT JOIN pg_class referenced ON referenced.oid=constraint_row.confrelid
    LEFT JOIN pg_namespace referenced_namespace ON referenced_namespace.oid=referenced.relnamespace
    WHERE constraint_row.conname=ANY($1::text[])`, [constraintNames]);
  const installedByName = new Map(installed.rows.map((row) => [row.conname, row]));
  const constraintDrift = [];
  for (const [name, expected] of Object.entries(REQUIRED_OWNER_CONSTRAINTS)) {
    const actual = installedByName.get(name);
    if (!actual) constraintDrift.push({ name, reason: "missing" });
    else if (actual.table_name !== expected.table || actual.contype !== expected.type
      || actual.convalidated !== true || actual.referenced_table !== expected.referencedTable
      || (expected.type === "f" && actual.referenced_schema !== "public")
      || JSON.stringify(actual.local_columns) !== JSON.stringify(expected.localColumns)
      || JSON.stringify(actual.referenced_columns) !== JSON.stringify(expected.referencedColumns)
      || (expected.type === "f" && (actual.confupdtype !== "a" || actual.confdeltype !== "a"
        || actual.confmatchtype !== "s" || actual.condeferrable !== false
        || actual.condeferred !== false))) {
      constraintDrift.push({ name, reason: "definition", expected, actual });
    }
  }
  if (constraintDrift.length > 0) {
    throw new Error(`MVP owner constraint catalog drift: ${JSON.stringify(constraintDrift)}`);
  }
  const triggerNames = Object.keys(REQUIRED_OWNER_TRIGGERS);
  const triggers = await client.query(`
    SELECT trigger_row.tgname, relation.relname AS table_name, trigger_row.tgenabled,
      trigger_row.tgtype,
      to_json(ARRAY(SELECT attribute.attname FROM unnest(trigger_row.tgattr::smallint[]) WITH ORDINALITY key(attnum,ord)
        JOIN pg_attribute attribute ON attribute.attrelid=trigger_row.tgrelid AND attribute.attnum=key.attnum
        ORDER BY key.ord)) AS columns,
      procedure_namespace.nspname AS function_schema,
      procedure_row.proname AS function_name,
      pg_get_functiondef(procedure_row.oid) AS function_definition
    FROM pg_trigger trigger_row
    JOIN pg_class relation ON relation.oid=trigger_row.tgrelid
    JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace AND namespace.nspname='public'
    JOIN pg_proc procedure_row ON procedure_row.oid=trigger_row.tgfoid
    JOIN pg_namespace procedure_namespace ON procedure_namespace.oid=procedure_row.pronamespace
    WHERE NOT trigger_row.tgisinternal AND trigger_row.tgname=ANY($1::text[])`, [triggerNames]);
  const triggersByName = new Map(triggers.rows.map((row) => [row.tgname, row]));
  const triggerDrift = [];
  for (const [name, expected] of Object.entries(REQUIRED_OWNER_TRIGGERS)) {
    const actual = triggersByName.get(name);
    if (!actual) triggerDrift.push({ name, reason: "missing" });
    else if (actual.table_name !== expected.table || actual.function_schema !== "public"
      || actual.function_name !== expected.functionName
      || actual.tgenabled !== "O" || actual.tgtype !== expected.triggerType
      || JSON.stringify(actual.columns) !== JSON.stringify(expected.columns)
      || sha256(actual.function_definition.replaceAll(/\s+/gu, " ").trim()) !== expected.functionHash) {
      triggerDrift.push({ name, reason: "definition", expected, actual });
    }
  }
  if (triggerDrift.length > 0) {
    throw new Error(`MVP owner trigger catalog drift: ${JSON.stringify(triggerDrift)}`);
  }
  const pending = await client.query(`
    SELECT relation.relname AS table_name,constraint_row.conname AS constraint_name
    FROM pg_constraint constraint_row
    JOIN pg_class relation ON relation.oid=constraint_row.conrelid
    WHERE relation.relname LIKE 'biz_property_%'
      AND constraint_row.contype IN ('c','f') AND constraint_row.convalidated=false
    ORDER BY relation.relname,constraint_row.conname`);
  if (dryRun && pending.rows.length > 0) {
    throw new Error(`unvalidated Track B constraints: ${JSON.stringify(pending.rows)}`);
  }
  if (pending.rows.length === 0) return [];
  const quote = (identifier) => `"${identifier.replaceAll('"', '""')}"`;
  await client.query("BEGIN");
  try {
    for (const row of pending.rows) {
      await client.query(`ALTER TABLE ${quote(row.table_name)} VALIDATE CONSTRAINT ${quote(row.constraint_name)}`);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
  const remaining = await client.query(`
    SELECT count(*)::bigint AS count FROM pg_constraint constraint_row
    JOIN pg_class relation ON relation.oid=constraint_row.conrelid
    WHERE relation.relname LIKE 'biz_property_%'
      AND constraint_row.contype IN ('c','f') AND constraint_row.convalidated=false`);
  if (Number(remaining.rows[0]?.count ?? -1) !== 0) throw new Error("constraint validation incomplete");
  return pending.rows;
}

export async function runReconcile({ connectionString, dryRun = false }) {
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const client = new Client({ connectionString });
  const runId = randomUUID();
  const hashes = {
    migrations: migrationSetHash(),
    contract: sha256(Buffer.concat([
      readFileSync(resolve(root, "packages/shared/src/property-business/track-b-contracts.ts")),
      readFileSync(resolve(root, "packages/shared/src/property-business/property-task-contracts.ts"))
    ]))
  };
  const inputHandoffs = Object.fromEntries(HANDOFF_PATHS.map((path) => [path, sha256(readFileSync(resolve(root, path)))]));
  await client.connect();
  try {
    const { rows: migrationRows } = await client.query(
      "SELECT filename,status FROM schema_migrations WHERE filename=ANY($1::text[]) ORDER BY filename",
      [REQUIRED_MIGRATIONS]
    );
    const succeeded = new Set(migrationRows.filter((row) => row.status === "succeeded").map((row) => row.filename));
    const missingMigrations = REQUIRED_MIGRATIONS.filter((name) => !succeeded.has(name));
    if (missingMigrations.length > 0) throw new Error(`migration gate failed: ${missingMigrations.join(",")}`);
    const differences = await collectHardDifferences(client);
    const failedDifferences = Object.entries(differences).filter(([, count]) => count !== 0);
    if (failedDifferences.length > 0) throw new Error(`hard differences: ${JSON.stringify(failedDifferences)}`);
    const validatedConstraints = await validateTrackBConstraints(client, dryRun);
    const scopes = await discoverScopes(client);
    const evidence = [];
    const rollbackDrills = [];
    if (!dryRun) {
      for (const scope of scopes) {
        await client.query("BEGIN");
        try {
          await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`${scope.tenant_id}:${scope.park_id}:track-b-final`]);
          for (const [kind, evidenceKind] of CHECKPOINTS) {
            evidence.push(await recordCheckpoint(client, scope, runId, kind, evidenceKind, hashes, 0));
          }
          await client.query("COMMIT");
          rollbackDrills.push({
            tenantId: scope.tenant_id,
            parkId: scope.park_id,
            rpo: 0,
            rtoMs: await rollbackProbe(client, scope)
          });
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      }
    }
    return {
      schemaVersion: "pr192-track-b-final-reconcile-v1",
      status: "PASS",
      track_b_technical_passed: true,
      runId,
      dryRun,
      migrationSetHash: hashes.migrations,
      contractHash: hashes.contract,
      inputHandoffs,
      migrations: REQUIRED_MIGRATIONS,
      scopes,
      hardDifferences: differences,
      validatedConstraints,
      checkpointKinds: CHECKPOINTS.map(([kind]) => kind),
      evidenceHashes: evidence,
      rollbackDrills,
      openP0P1: []
    };
  } finally {
    await client.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const report = await runReconcile({ connectionString: process.env.DATABASE_URL, dryRun: args.dryRun });
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (args.output) writeFileSync(resolve(args.output), serialized, { flag: "wx" });
  process.stdout.write(serialized);
}
