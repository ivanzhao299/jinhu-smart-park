import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";

const requireFromApi = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const { Client } = requireFromApi("pg");

const allowWrite = process.env.ALLOW_PROPERTY_CONTROL_PLANE_UAT_FIXTURE === "yes";
const tenantId = process.env.TENANT_ID ?? process.env.DEFAULT_TENANT_ID ?? "10000001";
const parkId = process.env.PARK_ID ?? process.env.DEFAULT_PARK_ID ?? "20000001";
const runCode = process.env.PROPERTY_CONTROL_PLANE_UAT_CODE ?? "issue-318";
const housingUsageType = 70;
const actorUsername = process.env.ADMIN_USERNAME ?? "admin";
const approverUsername = process.env.APPROVER_USERNAME ?? "";
const identityVerifierUsername = process.env.IDENTITY_VERIFIER_USERNAME ?? approverUsername;
const fixtureTarget = process.env.PROPERTY_CONTROL_PLANE_UAT_TARGET ?? "";
const modeTransitionSnapshotCheckedAt = "2026-08-18T00:00:00.000Z";
const postgresHost = process.env.POSTGRES_HOST ?? "127.0.0.1";
const postgresDb = process.env.POSTGRES_DB ?? "jinhu_smart_park";
const productionEnvNames = [
  process.env.NODE_ENV,
  process.env.APP_ENV,
  process.env.APP_ENVIRONMENT,
  process.env.ENVIRONMENT,
  process.env.DEPLOY_ENV,
  process.env.JINHU_ENV
].filter(Boolean).map((value) => String(value).toLowerCase());
const targetUrls = [
  process.env.DATABASE_URL,
  process.env.API_BASE_URL,
  process.env.WEB_ORIGIN,
  process.env.NEXT_PUBLIC_API_TARGET,
  process.env.APP_URL
].filter(Boolean).map((value) => String(value).toLowerCase());
const uatActorRequiredPermissions = [
  "asset:party",
  "asset:identity-submissions:page",
  "party:read",
  "party:identity_update",
  "file:read",
  "file:upload",
  "file:download",
  "file:delete",
  "asset:property-operations:page",
  "property_operation:read",
  "property_operation:update",
  "property_operation:transition_mode",
  "asset:property-occupancies:page",
  "property_occupancy:read",
  "property_occupancy:create",
  "property_occupancy:activate",
  "property_occupancy:release",
  "property_occupancy:force_release",
  "asset:property-mode-transitions:page",
  "property_approval:create",
  "property_approval:read",
  "property_approval:withdraw"
];
const identityVerifierRequiredPermissions = [
  "asset:identity-submissions:page",
  "party:read",
  "party:identity_verify",
  "file:read",
  "file:download"
];
const disposableTargetMarkers = new Set(["local", "disposable", "ci", "test"]);
const localPostgresHosts = new Set(["127.0.0.1", "localhost", "::1", "0.0.0.0"]);

function isProductionLikeTarget() {
  return !disposableTargetMarkers.has(fixtureTarget.toLowerCase())
    || productionEnvNames.some((value) => ["production", "prod"].includes(value))
    || /(^|[_-])(prod|production)([_-]|$)/i.test(postgresDb)
    || (!localPostgresHosts.has(postgresHost.toLowerCase()) && !postgresHost.toLowerCase().endsWith(".local"))
    || targetUrls.some((value) =>
      /(^|[./_-])(prod|production)([./_-]|$)/i.test(value)
      || (value.startsWith("https://") && !value.includes("localhost") && !value.includes("127.0.0.1"))
    );
}

function scopedUuid(label) {
  const hex = createHash("sha256").update(`${tenantId}:${parkId}:${runCode}:${label}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0")}${hex.slice(18, 20)}-${hex.slice(20, 32)}`;
}

const ids = {
  occupancy: scopedUuid("occupancy"),
  operationConfig: scopedUuid("operation-config"),
  approvalRequest: scopedUuid("approval-request"),
  approvalStage: scopedUuid("approval-stage"),
  effectManifest: scopedUuid("effect-manifest"),
  verificationQueue: scopedUuid("identity-verification-queue"),
  party: scopedUuid("party"),
  submission: scopedUuid("submission"),
  outbox: scopedUuid("outbox"),
  occupancyUnit: scopedUuid("occupancy-unit"),
  modeUnit: scopedUuid("mode-unit")
};
const identityQueueCode = `000-uat-${ids.verificationQueue.slice(0, 8)}`;

function canonicalText(value) {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalText(item)).join(",")}]`;
  const keys = Object.keys(value).sort((left, right) =>
    Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"))
  );
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalText(value[key])}`).join(",")}}`;
}

function canonicalHash(value) {
  return createHash("sha256").update(canonicalText(value), "utf8").digest("hex");
}

async function queryOne(client, sql, params = []) {
  const result = await client.query(sql, params);
  return result.rows[0] ?? null;
}

async function countFixtures(client) {
  const result = await client.query(
    `SELECT
       (SELECT count(*)::int FROM biz_property_occupancy WHERE tenant_id=$1 AND park_id=$2 AND id=$3::uuid) AS occupancies,
       (SELECT count(*)::int FROM biz_property_approval_request WHERE tenant_id=$1 AND park_id=$2 AND id=$4::uuid) AS mode_requests,
       (SELECT count(*)::int FROM biz_party WHERE tenant_id=$1 AND park_id=$2 AND id=$5::uuid) AS parties,
       (SELECT count(*)::int FROM biz_party_identity_submission WHERE tenant_id=$1 AND park_id=$2 AND id=$6::uuid) AS identity_submissions,
       (SELECT count(*)::int FROM biz_property_outbox WHERE tenant_id=$1 AND park_id=$2 AND event_id=$7::uuid) AS identity_audit_events`,
    [tenantId, parkId, ids.occupancy, ids.approvalRequest, ids.party, ids.submission, ids.outbox]
  );
  return result.rows[0];
}

async function chooseUnit(client, excludedUnitIds = []) {
  return queryOne(
    client,
    `SELECT unit.id, unit.unit_code, unit.unit_name, unit.usage_type, config.id AS config_id
       FROM biz_unit unit
       LEFT JOIN biz_property_operation_config config
         ON config.tenant_id=unit.tenant_id AND config.park_id=unit.park_id
        AND config.unit_id=unit.id AND config.is_deleted=false
      WHERE unit.tenant_id=$1 AND unit.park_id=$2 AND unit.is_deleted=false
        AND unit.usage_type=$6
        AND (config.id IS NULL OR config.id=$3::uuid)
        AND NOT (unit.id=ANY($5::uuid[]))
        AND NOT EXISTS (
          SELECT 1 FROM biz_property_occupancy occupancy
          WHERE occupancy.tenant_id=unit.tenant_id
            AND occupancy.park_id=unit.park_id
            AND occupancy.unit_id=unit.id
            AND occupancy.id<>$4::uuid
            AND occupancy.is_deleted=false
            AND occupancy.status IN ('held','active')
            AND tstzrange(occupancy.start_at, occupancy.end_at, '[)')
              && tstzrange(clock_timestamp()-interval '1 hour', clock_timestamp()+interval '2 days', '[)')
        )
      ORDER BY CASE WHEN config.id=$3::uuid THEN 0 ELSE 1 END, unit.create_time, unit.id
      LIMIT 1`,
    [tenantId, parkId, ids.operationConfig, ids.occupancy, excludedUnitIds, housingUsageType]
  );
}

async function getUnitById(client, unitId) {
  if (!unitId) return null;
  return queryOne(
    client,
    `SELECT unit.id, unit.unit_code, unit.unit_name, unit.usage_type, config.id AS config_id
       FROM biz_unit unit
       LEFT JOIN biz_property_operation_config config
         ON config.tenant_id=unit.tenant_id AND config.park_id=unit.park_id
        AND config.unit_id=unit.id AND config.is_deleted=false
      WHERE unit.tenant_id=$1 AND unit.park_id=$2 AND unit.id=$3::uuid
        AND unit.is_deleted=false
      LIMIT 1`,
    [tenantId, parkId, unitId]
  );
}

async function ensureUatHousingUnit(client, unitId, role) {
  const existing = await getUnitById(client, unitId);
  if (existing?.id) {
    if (Number(existing.usage_type) !== housingUsageType) {
      throw new Error(`Fixture ${role} unit ${existing.unit_code ?? unitId} is not a housing unit.`);
    }
    return existing;
  }
  const location = await queryOne(
    client,
    `SELECT building.id AS building_id, floor.id AS floor_id
       FROM biz_building building
       JOIN biz_floor floor
         ON floor.tenant_id=building.tenant_id
        AND floor.park_id=building.park_id
        AND floor.building_id=building.id
        AND floor.is_deleted=false
      WHERE building.tenant_id=$1
        AND building.park_id=$2
        AND building.is_deleted=false
      ORDER BY building.sort_no, building.building_code, floor.floor_no, floor.floor_code
      LIMIT 1`,
    [tenantId, parkId]
  );
  if (!location?.building_id || !location?.floor_id) {
    throw new Error("Cannot find an active building and floor for property control-plane housing UAT data.");
  }
  const unitCode = `JH-UAT-H-${unitId.slice(0, 8)}`;
  await client.query(
    `INSERT INTO biz_unit (
       id,tenant_id,park_id,unit_code,building_id,floor_id,unit_name,usage_type,
       unit_area,use_area,rental_status,fitting_status,ref_price,available_date,status,remark)
     VALUES($1::uuid,$2,$3,$4,$5::uuid,$6::uuid,$7,$8,88.00,76.00,10,30,5200.00,CURRENT_DATE,1,$9)
     ON CONFLICT (id) DO UPDATE SET
       usage_type=EXCLUDED.usage_type,
       unit_name=EXCLUDED.unit_name,
       unit_area=EXCLUDED.unit_area,
       use_area=EXCLUDED.use_area,
       rental_status=EXCLUDED.rental_status,
       fitting_status=EXCLUDED.fitting_status,
       status=1,
       is_deleted=false,
       update_time=clock_timestamp(),
       remark=EXCLUDED.remark`,
    [
      unitId,
      tenantId,
      parkId,
      unitCode,
      location.building_id,
      location.floor_id,
      `共享房产住房UAT-${role}`,
      housingUsageType,
      `Issue #318 UAT: housing unit for ${role}`
    ]
  );
  return getUnitById(client, unitId);
}

function modeTransitionBlockingReasons(counts, targetMode) {
  const reasons = [];
  if (Number(counts.housing_lease_count) > 0 && targetMode !== "long_rent") {
    reasons.push("存在仍有效的住房租约");
  }
  if (Number(counts.homestay_booking_count) > 0 && targetMode !== "short_stay") {
    reasons.push("存在仍有效的民宿订单");
  }
  if (Number(counts.incompatible_occupancy_count) > 0) reasons.push("存在与目标经营模式冲突的未来或当前占用");
  if (Number(counts.maintenance_or_operations_count) > 0) reasons.push("存在维修停用、保洁或运营锁房占用");
  if (Number(counts.commercial_contract_count) > 0 && targetMode !== "long_rent") reasons.push("存在未结束的商业租赁合同");
  if (Number(counts.pending_checkout_count) > 0) reasons.push("存在待退房或待结算记录");
  if (Number(counts.open_workorder_count) > 0) reasons.push("存在未关闭工单");
  if (Number(counts.unsettled_receivable_count) > 0) reasons.push("存在未结清财务事项");
  return reasons;
}

async function buildModeTransitionSnapshot(client, unitId, targetMode, checkedAt = modeTransitionSnapshotCheckedAt) {
  const row = await queryOne(
    client,
    `WITH occupancy AS (
       SELECT
         count(*)::int AS active_occupancy_count,
         count(*) FILTER (
           WHERE ($4 = 'none')
              OR ($4 = 'short_stay' AND source_domain IN ('commercial_leasing', 'housing_rental', 'apartment'))
              OR ($4 = 'long_rent' AND source_domain = 'homestay')
         )::int AS incompatible_occupancy_count,
          (
            count(*) FILTER (WHERE source_domain IN ('maintenance', 'operations'))
            + (
              SELECT count(*)
              FROM biz_homestay_turnover_task task
              WHERE task.tenant_id = $1 AND task.park_id = $2 AND task.unit_id = $3::uuid
                AND task.is_deleted = false AND task.status <> 'completed'
            )
          )::int AS maintenance_or_operations_count
       FROM biz_property_occupancy
       WHERE tenant_id = $1 AND park_id = $2 AND unit_id = $3::uuid
         AND is_deleted = false AND end_at > now()
         AND (status = 'active' OR (status = 'held' AND (hold_expires_at IS NULL OR hold_expires_at > now())))
     ),
     contracts AS (
       SELECT count(DISTINCT contract.id)::int AS commercial_contract_count
       FROM rel_leasing_contract_unit relation
       JOIN biz_leasing_contract contract ON contract.id = relation.contract_id
       WHERE relation.tenant_id = $1 AND relation.park_id = $2 AND relation.unit_id = $3::uuid
         AND relation.is_deleted = false AND relation.status = 1
         AND contract.is_deleted = false AND contract.status NOT IN ('90', '91')
          AND (relation.end_date + interval '1 day') > (now() AT TIME ZONE 'Asia/Shanghai')::date
     ),
     housing_leases AS (
       SELECT count(*)::int AS housing_lease_count
       FROM biz_housing_lease lease
       WHERE lease.tenant_id = $1 AND lease.park_id = $2 AND lease.unit_id = $3::uuid
         AND lease.is_deleted = false
         AND lease.status IN ('active', 'expiring', 'checkout_pending')
     ),
     homestay_bookings AS (
       SELECT count(*)::int AS homestay_booking_count
       FROM biz_homestay_booking booking
       WHERE booking.tenant_id = $1 AND booking.park_id = $2 AND booking.unit_id = $3::uuid
         AND booking.is_deleted = false AND booking.status IN ('confirmed', 'checked_in')
     ),
     checkouts AS (
       SELECT count(DISTINCT checkout.id)::int AS pending_checkout_count
       FROM rel_leasing_contract_unit relation
       JOIN biz_leasing_checkout checkout ON checkout.contract_id = relation.contract_id
       WHERE relation.tenant_id = $1 AND relation.park_id = $2 AND relation.unit_id = $3::uuid
         AND relation.is_deleted = false AND relation.status = 1
         AND checkout.is_deleted = false AND checkout.status IN ('30', '40', '60')
     ),
     workorders AS (
       SELECT count(*)::int AS open_workorder_count
       FROM biz_work_order
       WHERE tenant_id = $1 AND park_id = $2 AND unit_id = $3::uuid
         AND is_deleted = false AND status NOT IN ('60', '70', '90', '100')
     ),
     financial_items AS (
       SELECT 'commercial:' || receivable.id::text AS item_id
       FROM rel_leasing_contract_unit relation
       JOIN biz_leasing_receivable receivable ON receivable.contract_id = relation.contract_id
       WHERE relation.tenant_id = $1 AND relation.park_id = $2 AND relation.unit_id = $3::uuid
         AND relation.is_deleted = false AND relation.status = 1
         AND receivable.is_deleted = false AND receivable.status <> '90' AND receivable.amount_remain > 0
       UNION ALL
       SELECT 'housing:' || receivable.id::text AS item_id
       FROM biz_housing_receivable receivable
       JOIN biz_housing_lease lease ON lease.id = receivable.lease_id
       WHERE receivable.tenant_id = $1 AND receivable.park_id = $2
         AND lease.unit_id = $3::uuid AND lease.is_deleted = false
         AND receivable.is_deleted = false AND receivable.status <> 'void'
         AND receivable.amount > receivable.paid_amount + receivable.waived_amount
       UNION ALL
       SELECT 'homestay:' || booking.id::text AS item_id
       FROM biz_homestay_booking booking
       JOIN biz_homestay_ledger_entry entry ON entry.booking_id = booking.id
       WHERE booking.tenant_id = $1 AND booking.park_id = $2 AND booking.unit_id = $3::uuid
         AND booking.is_deleted = false AND entry.is_deleted = false AND entry.status = 'confirmed'
       GROUP BY booking.id
       HAVING sum(CASE
         WHEN entry.entry_type = 'charge' THEN entry.amount
         WHEN entry.entry_type IN ('payment', 'waiver') THEN -entry.amount
         WHEN entry.entry_type = 'refund' THEN entry.amount
         ELSE 0
       END) > 0
     ),
     receivables AS (
       SELECT count(*)::int AS unsettled_receivable_count
       FROM financial_items
     )
     SELECT *
     FROM occupancy
     CROSS JOIN contracts
     CROSS JOIN housing_leases
     CROSS JOIN homestay_bookings
     CROSS JOIN checkouts
     CROSS JOIN workorders
     CROSS JOIN receivables`,
    [tenantId, parkId, unitId, targetMode]
  );
  const counts = row ?? {
    active_occupancy_count: 0,
    incompatible_occupancy_count: 0,
    maintenance_or_operations_count: 0,
    commercial_contract_count: 0,
    housing_lease_count: 0,
    homestay_booking_count: 0,
    pending_checkout_count: 0,
    open_workorder_count: 0,
    unsettled_receivable_count: 0
  };
  return {
    checked_at: checkedAt,
    active_occupancy_count: Number(counts.active_occupancy_count),
    incompatible_occupancy_count: Number(counts.incompatible_occupancy_count),
    maintenance_or_operations_count: Number(counts.maintenance_or_operations_count),
    commercial_contract_count: Number(counts.commercial_contract_count),
    housing_lease_count: Number(counts.housing_lease_count),
    homestay_booking_count: Number(counts.homestay_booking_count),
    pending_checkout_count: Number(counts.pending_checkout_count),
    open_workorder_count: Number(counts.open_workorder_count),
    unsettled_receivable_count: Number(counts.unsettled_receivable_count),
    blocking_reasons: modeTransitionBlockingReasons(counts, targetMode)
  };
}

async function assertFixtureIdScope(client) {
  const result = await client.query(
    `SELECT label FROM (
       SELECT 'occupancy' AS label FROM biz_property_occupancy WHERE id=$3::uuid AND (tenant_id<>$1 OR park_id<>$2)
       UNION ALL SELECT 'operation_config' FROM biz_property_operation_config WHERE id=$4::uuid AND (tenant_id<>$1 OR park_id<>$2)
       UNION ALL SELECT 'approval_request' FROM biz_property_approval_request WHERE id=$5::uuid AND (tenant_id<>$1 OR park_id<>$2)
       UNION ALL SELECT 'approval_stage' FROM biz_property_approval_stage WHERE id=$6::uuid AND (tenant_id<>$1 OR park_id<>$2)
       UNION ALL SELECT 'identity_verification_queue' FROM biz_party_identity_verification_queue WHERE id=$7::uuid AND (tenant_id<>$1 OR park_id<>$2)
       UNION ALL SELECT 'party' FROM biz_party WHERE id=$8::uuid AND (tenant_id<>$1 OR park_id<>$2)
       UNION ALL SELECT 'identity_submission' FROM biz_party_identity_submission WHERE id=$9::uuid AND (tenant_id<>$1 OR park_id<>$2)
       UNION ALL SELECT 'outbox' FROM biz_property_outbox WHERE event_id=$10::uuid AND (tenant_id<>$1 OR park_id<>$2)
     ) scoped_conflicts`,
    [
      tenantId,
      parkId,
      ids.occupancy,
      ids.operationConfig,
      ids.approvalRequest,
      ids.approvalStage,
      ids.verificationQueue,
      ids.party,
      ids.submission,
      ids.outbox
    ]
  );
  if (result.rows.length) {
    throw new Error(`Fixture IDs already exist in another tenant/park scope: ${result.rows.map((row) => row.label).join(", ")}`);
  }
}

async function assertUatScopePreflight(client) {
  const scope = await queryOne(
    client,
    `SELECT
       (SELECT count(*)::int
         FROM biz_park park
         WHERE park.tenant_id=$1
           AND park.park_id=$2
           AND park.status=1
           AND park.is_deleted=false) AS active_park_count,
       (SELECT count(*)::int
          FROM rel_tenant_module assignment
          JOIN sys_module module
            ON module.id=assignment.module_id
           AND module.module_code='asset'
           AND module.status=1
           AND module.is_deleted=false
         WHERE assignment.tenant_id=$1
           AND assignment.park_id=$2
           AND assignment.enabled=true
           AND assignment.status='enabled'
           AND assignment.is_deleted=false
           AND (assignment.start_time IS NULL OR assignment.start_time<=clock_timestamp())
           AND (assignment.expire_time IS NULL OR assignment.expire_time>clock_timestamp())) AS active_asset_assignment_count`,
    [tenantId, parkId]
  );
  if (scope?.active_park_count !== 1) {
    throw new Error(`PARK_ID ${parkId} must identify exactly one active, non-deleted biz_park for property control-plane UAT.`);
  }
  if (scope?.active_asset_assignment_count !== 1) {
    throw new Error(`Tenant/Park ${tenantId}/${parkId} must have exactly one live asset module assignment before property control-plane UAT fixture seeding.`);
  }
}

async function applyFixtures(client) {
  if (!allowWrite) {
    throw new Error("Set ALLOW_PROPERTY_CONTROL_PLANE_UAT_FIXTURE=yes to write UAT fixtures.");
  }
  if (isProductionLikeTarget()) {
    throw new Error("Refusing to write property control-plane UAT fixtures without PROPERTY_CONTROL_PLANE_UAT_TARGET=local|disposable|ci|test on a local database target.");
  }
  await assertFixtureIdScope(client);
  await assertUatScopePreflight(client);

  const actor = await queryOne(
    client,
    `SELECT actor.id
       FROM sys_user actor
      WHERE actor.tenant_id=$1 AND actor.park_id=$2 AND actor.username=$3
        AND actor.is_enabled=true AND actor.status='enabled' AND actor.is_deleted=false
        AND EXISTS (
          SELECT 1
          FROM biz_park current_park
          WHERE current_park.tenant_id=actor.tenant_id
            AND current_park.park_id=actor.park_id
            AND current_park.status=1
            AND current_park.is_deleted=false
        )
        AND (
          EXISTS (
            SELECT 1
            FROM rel_user_role user_role
            JOIN sys_role role
              ON role.id=user_role.role_id
             AND role.tenant_id=user_role.tenant_id
             AND (role.role_scope='tenant' OR role.park_id=user_role.park_id)
             AND role.is_super=true
             AND role.is_enabled=true AND role.status='enabled' AND role.is_deleted=false
            WHERE user_role.tenant_id=actor.tenant_id
              AND user_role.park_id=actor.park_id
              AND user_role.user_id=actor.id
              AND user_role.is_deleted=false
          )
          OR EXISTS (
            SELECT 1
            FROM rel_user_role user_role
            JOIN sys_role role
              ON role.id=user_role.role_id
             AND role.tenant_id=user_role.tenant_id
             AND (role.role_scope='tenant' OR role.park_id=user_role.park_id)
             AND role.is_enabled=true AND role.status='enabled' AND role.is_deleted=false
            JOIN rel_role_data_scope role_scope
              ON role_scope.tenant_id=role.tenant_id
             AND role_scope.park_id=user_role.park_id
             AND role_scope.role_id=role.id
             AND role_scope.is_deleted=false
            JOIN sys_data_scope_rule data_rule
              ON data_rule.id=role_scope.rule_id
             AND data_rule.tenant_id=role_scope.tenant_id
             AND data_rule.park_id=role_scope.park_id
             AND data_rule.dimension IN ('tenant','park')
             AND data_rule.scope_type IN ('all','tenant','park')
             AND data_rule.status='enabled'
             AND data_rule.is_deleted=false
            WHERE user_role.tenant_id=actor.tenant_id
              AND user_role.park_id=actor.park_id
              AND user_role.user_id=actor.id
              AND user_role.is_deleted=false
          )
        )
        AND (
          EXISTS (
            SELECT 1
            FROM rel_user_park access
            WHERE access.tenant_id=actor.tenant_id
              AND access.user_id=actor.id
              AND access.park_id=actor.park_id
              AND access.status='enabled'
              AND access.is_deleted=false
          )
          OR NOT EXISTS (
            SELECT 1
            FROM rel_user_park explicit_home
            WHERE explicit_home.tenant_id=actor.tenant_id
              AND explicit_home.user_id=actor.id
              AND explicit_home.park_id=actor.park_id
          )
        )
        AND (
          EXISTS (
            SELECT 1
            FROM rel_user_role user_role
            JOIN sys_role role
              ON role.id=user_role.role_id
             AND role.tenant_id=user_role.tenant_id
             AND (role.role_scope='tenant' OR role.park_id=user_role.park_id)
             AND role.is_super=true
             AND role.is_enabled=true AND role.status='enabled' AND role.is_deleted=false
            WHERE user_role.tenant_id=actor.tenant_id
              AND user_role.park_id=actor.park_id
              AND user_role.user_id=actor.id
              AND user_role.is_deleted=false
          )
          OR NOT EXISTS (
            SELECT 1
            FROM unnest($4::varchar[]) required(code)
            WHERE NOT EXISTS (
              SELECT 1
              FROM rel_user_role user_role
              JOIN sys_role role
                ON role.id=user_role.role_id
               AND role.tenant_id=user_role.tenant_id
               AND (role.role_scope='tenant' OR role.park_id=user_role.park_id)
               AND role.is_enabled=true AND role.status='enabled' AND role.is_deleted=false
              JOIN rel_role_perm role_permission
                ON role_permission.role_id=role.id
               AND role_permission.tenant_id=role.tenant_id
               AND role_permission.park_id=user_role.park_id
               AND role_permission.is_deleted=false
              JOIN sys_permission permission
                ON permission.id=role_permission.permission_id
               AND permission.tenant_id=role_permission.tenant_id
               AND permission.code=required.code
               AND permission.is_enabled=true AND permission.status='enabled' AND permission.is_deleted=false
              WHERE user_role.tenant_id=actor.tenant_id
                AND user_role.park_id=actor.park_id
                AND user_role.user_id=actor.id
                AND user_role.is_deleted=false
            )
          )
        )
      LIMIT 1`,
    [tenantId, parkId, actorUsername, uatActorRequiredPermissions]
  );
  if (!actor?.id) {
    throw new Error(`Cannot find enabled UAT actor ${actorUsername} with identity, file and property control-plane permissions.`);
  }

  const approver = await queryOne(
    client,
    `SELECT DISTINCT verifier.id::text AS id
       FROM sys_user verifier
       JOIN rel_user_role user_role
         ON user_role.user_id=verifier.id
        AND user_role.tenant_id=verifier.tenant_id
        AND user_role.park_id=verifier.park_id
       JOIN sys_role role
         ON role.id=user_role.role_id
        AND role.tenant_id=user_role.tenant_id
        AND (role.role_scope='tenant' OR role.park_id=user_role.park_id)
       JOIN rel_role_perm role_permission
         ON role_permission.role_id=role.id
        AND role_permission.tenant_id=role.tenant_id
        AND role_permission.park_id=user_role.park_id
       JOIN sys_permission permission
         ON permission.id=role_permission.permission_id
        AND permission.tenant_id=role_permission.tenant_id
      WHERE verifier.tenant_id=$1 AND verifier.park_id=$2
        AND verifier.id<>$3::uuid
        AND ($4='' OR verifier.username=$4)
        AND permission.code IN ('property_approval:read','property_approval:decide')
        AND verifier.is_enabled=true AND verifier.status='enabled' AND verifier.is_deleted=false
        AND EXISTS (
          SELECT 1
          FROM biz_park current_park
          WHERE current_park.tenant_id=verifier.tenant_id
            AND current_park.park_id=verifier.park_id
            AND current_park.status=1
            AND current_park.is_deleted=false
        )
        AND (
          EXISTS (
            SELECT 1
            FROM rel_user_park access
            WHERE access.tenant_id=verifier.tenant_id
              AND access.user_id=verifier.id
              AND access.park_id=verifier.park_id
              AND access.status='enabled'
              AND access.is_deleted=false
          )
          OR NOT EXISTS (
            SELECT 1
            FROM rel_user_park explicit_home
            WHERE explicit_home.tenant_id=verifier.tenant_id
              AND explicit_home.user_id=verifier.id
              AND explicit_home.park_id=verifier.park_id
          )
        )
        AND user_role.is_deleted=false
        AND role.is_enabled=true AND role.status='enabled' AND role.is_deleted=false
        AND role_permission.is_deleted=false
        AND permission.is_enabled=true AND permission.status='enabled' AND permission.is_deleted=false
      GROUP BY verifier.id
      HAVING count(DISTINCT permission.code)=2
      ORDER BY verifier.id::text
      LIMIT 1`,
    [tenantId, parkId, actor.id, approverUsername]
  );
  if (!approver?.id) {
    throw new Error("Cannot find a distinct user with property_approval:read and property_approval:decide for mode-transition UAT approval; set APPROVER_USERNAME or seed an eligible approver.");
  }
  const identityVerifier = await queryOne(
    client,
    `SELECT DISTINCT verifier.id::text AS id
       FROM sys_user verifier
       JOIN rel_user_role user_role
         ON user_role.user_id=verifier.id
        AND user_role.tenant_id=verifier.tenant_id
        AND user_role.park_id=verifier.park_id
       JOIN sys_role role
         ON role.id=user_role.role_id
        AND role.tenant_id=user_role.tenant_id
        AND (role.role_scope='tenant' OR role.park_id=user_role.park_id)
       JOIN rel_role_perm role_permission
         ON role_permission.role_id=role.id
        AND role_permission.tenant_id=role.tenant_id
        AND role_permission.park_id=user_role.park_id
       JOIN sys_permission permission
         ON permission.id=role_permission.permission_id
        AND permission.tenant_id=role_permission.tenant_id
      WHERE verifier.tenant_id=$1 AND verifier.park_id=$2
        AND verifier.id<>$3::uuid
        AND ($4='' OR verifier.username=$4)
        AND permission.code=ANY($5::varchar[])
        AND verifier.is_enabled=true AND verifier.status='enabled' AND verifier.is_deleted=false
        AND EXISTS (
          SELECT 1
          FROM biz_park current_park
          WHERE current_park.tenant_id=verifier.tenant_id
            AND current_park.park_id=verifier.park_id
            AND current_park.status=1
            AND current_park.is_deleted=false
        )
        AND (
          EXISTS (
            SELECT 1
            FROM rel_user_park access
            WHERE access.tenant_id=verifier.tenant_id
              AND access.user_id=verifier.id
              AND access.park_id=verifier.park_id
              AND access.status='enabled'
              AND access.is_deleted=false
          )
          OR NOT EXISTS (
            SELECT 1
            FROM rel_user_park explicit_home
            WHERE explicit_home.tenant_id=verifier.tenant_id
              AND explicit_home.user_id=verifier.id
              AND explicit_home.park_id=verifier.park_id
          )
        )
        AND user_role.is_deleted=false
        AND role.is_enabled=true AND role.status='enabled' AND role.is_deleted=false
        AND role_permission.is_deleted=false
        AND permission.is_enabled=true AND permission.status='enabled' AND permission.is_deleted=false
      GROUP BY verifier.id
      HAVING count(DISTINCT permission.code)=cardinality($5::varchar[])
      ORDER BY verifier.id::text
      LIMIT 1`,
    [tenantId, parkId, actor.id, identityVerifierUsername, identityVerifierRequiredPermissions]
  );
  if (!identityVerifier?.id) {
    throw new Error(`Cannot find a distinct user with ${identityVerifierRequiredPermissions.join(", ")} for identity verification UAT; set IDENTITY_VERIFIER_USERNAME or seed an eligible verifier.`);
  }
  await client.query("BEGIN");
  try {
  const identityQueuePolicySnapshot = {
    requiredPermissions: ["asset:identity-submissions:page", "party:identity_verify"],
    requiredModules: ["asset"],
    relationScope: "tenant-park-current",
    dataScope: "party-submission",
    actorExclusions: ["maker"],
    eligibleVerifierUserIds: [identityVerifier.id],
    queueSupervisorUserIds: [identityVerifier.id]
  };
  const identityQueuePolicyHash = canonicalHash(identityQueuePolicySnapshot);
  await client.query(
    `INSERT INTO biz_party_identity_verification_queue(
       id,tenant_id,park_id,queue_code,display_name,status,
       eligibility_policy_version,eligibility_policy_snapshot,
       eligibility_policy_hash,legacy_backfill,legacy_anomaly,version)
     VALUES($1::uuid,$2,$3,$4,$5,'active',1,$6::jsonb,$7,false,false,1)
     ON CONFLICT (id) DO UPDATE SET
       display_name=EXCLUDED.display_name,
       status='active',
       eligibility_policy_version=biz_party_identity_verification_queue.eligibility_policy_version+1,
       eligibility_policy_snapshot=EXCLUDED.eligibility_policy_snapshot,
       eligibility_policy_hash=EXCLUDED.eligibility_policy_hash,
       legacy_backfill=false,
       legacy_anomaly=false,
       version=biz_party_identity_verification_queue.version+1,
       update_time=clock_timestamp()`,
    [
      ids.verificationQueue,
      tenantId,
      parkId,
      identityQueueCode,
      "Issue #306 UAT Identity Verification",
      JSON.stringify(identityQueuePolicySnapshot),
      identityQueuePolicyHash
    ]
  );
  const selectedIdentityQueue = await queryOne(
    client,
    `SELECT id::text AS id, queue_code
       FROM biz_party_identity_verification_queue
      WHERE tenant_id=$1
        AND park_id=$2
        AND status='active'
        AND legacy_backfill=false
      ORDER BY queue_code ASC, id ASC
      LIMIT 1`,
    [tenantId, parkId]
  );
  if (selectedIdentityQueue?.id !== ids.verificationQueue) {
    throw new Error(`Fixture identity queue ${identityQueueCode} is not the first active non-legacy queue; selected ${selectedIdentityQueue?.queue_code ?? "none"}. Use an isolated UAT scope or disable earlier queues.`);
  }

  const existingFixtureUnits = await queryOne(
    client,
    `SELECT
       (SELECT occupancy.unit_id
          FROM biz_property_occupancy occupancy
         WHERE occupancy.tenant_id=$1 AND occupancy.park_id=$2
           AND occupancy.id=$3::uuid AND occupancy.is_deleted=false
         LIMIT 1) AS occupancy_unit_id,
       (SELECT config.unit_id
          FROM biz_property_operation_config config
         WHERE config.tenant_id=$1 AND config.park_id=$2
           AND config.id=$4::uuid AND config.is_deleted=false
         LIMIT 1) AS mode_unit_id`,
    [tenantId, parkId, ids.occupancy, ids.operationConfig]
  );
  const existingModeUnit = await getUnitById(client, existingFixtureUnits?.mode_unit_id);
  const existingOccupancyUnit = await getUnitById(client, existingFixtureUnits?.occupancy_unit_id);
  const occupancyUnit = existingOccupancyUnit
    ?? await chooseUnit(client, existingModeUnit?.id ? [existingModeUnit.id] : [])
    ?? await ensureUatHousingUnit(client, ids.occupancyUnit, "occupancy");
  if (!occupancyUnit?.id) {
    throw new Error("Cannot find or create an active housing biz_unit for property control-plane UAT data.");
  }
  if (Number(occupancyUnit.usage_type) !== housingUsageType) {
    throw new Error(`Fixture occupancy unit ${occupancyUnit.unit_code ?? occupancyUnit.id} must use housing usage_type=${housingUsageType}.`);
  }
  const modeUnit = existingModeUnit
    ?? await chooseUnit(client, [occupancyUnit.id])
    ?? await ensureUatHousingUnit(client, ids.modeUnit, "mode-transition");
  if (!modeUnit?.id) {
    throw new Error("Cannot find or create a second active housing biz_unit for mode-transition UAT data.");
  }
  if (Number(modeUnit.usage_type) !== housingUsageType) {
    throw new Error(`Fixture mode-transition unit ${modeUnit.unit_code ?? modeUnit.id} must use housing usage_type=${housingUsageType}.`);
  }
  if (modeUnit.id === occupancyUnit.id) {
    throw new Error("Fixture occupancy and mode-transition rows resolved to the same unit; rerun with a new PROPERTY_CONTROL_PLANE_UAT_CODE.");
  }

    const immutableIdentityDecisions = await queryOne(
      client,
      `SELECT count(*)::int AS count
         FROM biz_party_identity_decision
        WHERE tenant_id=$1 AND park_id=$2 AND submission_id=$3::uuid`,
      [tenantId, parkId, ids.submission]
    );
    if ((immutableIdentityDecisions?.count ?? 0) > 0) {
      throw new Error("Fixture identity submission has immutable decisions; rerun with a new PROPERTY_CONTROL_PLANE_UAT_CODE.");
    }
    const immutableIdentityAssignments = await queryOne(
      client,
      `SELECT count(*)::int AS count
         FROM biz_party_identity_assignment_audit
        WHERE tenant_id=$1 AND park_id=$2 AND submission_id=$3::uuid`,
      [tenantId, parkId, ids.submission]
    );
    if ((immutableIdentityAssignments?.count ?? 0) > 0) {
      throw new Error("Fixture identity submission has immutable assignment audits; rerun with a new PROPERTY_CONTROL_PLANE_UAT_CODE.");
    }
	    const immutableApprovalActivity = await queryOne(
	      client,
	      `SELECT
	         (SELECT count(*)::int
	            FROM biz_property_approval_decision
	           WHERE tenant_id=$1 AND park_id=$2 AND request_id=$3::uuid) AS decisions,
	         (SELECT count(*)::int
	            FROM biz_property_approval_audit
	           WHERE tenant_id=$1 AND park_id=$2 AND request_id=$3::uuid) AS audits,
	         (SELECT count(*)::int
	            FROM biz_property_mutation_receipt
	           WHERE tenant_id=$1 AND park_id=$2 AND target_id=$3::uuid) AS receipts`,
	      [tenantId, parkId, ids.approvalRequest]
	    );
	    if (
	      (immutableApprovalActivity?.decisions ?? 0) > 0
	      || (immutableApprovalActivity?.audits ?? 0) > 0
	      || (immutableApprovalActivity?.receipts ?? 0) > 0
	    ) {
	      throw new Error("Fixture approval request has immutable decision, audit, or mutation activity; rerun with a new PROPERTY_CONTROL_PLANE_UAT_CODE.");
	    }
    const mutableIdentityChildren = await queryOne(
      client,
      `SELECT
         (SELECT count(*)::int FROM rel_party_identity_draft_file
           WHERE tenant_id=$1 AND park_id=$2 AND submission_id=$3::uuid) AS draft_files,
         (SELECT count(*)::int FROM biz_property_outbox
           WHERE tenant_id=$1 AND park_id=$2 AND aggregate_id=$3::uuid AND event_id<>$4::uuid) AS extra_outbox_events`,
      [tenantId, parkId, ids.submission, ids.outbox]
    );
    if ((mutableIdentityChildren?.draft_files ?? 0) > 0 || (mutableIdentityChildren?.extra_outbox_events ?? 0) > 0) {
      throw new Error("Fixture identity submission has UAT activity children; rerun with a new PROPERTY_CONTROL_PLANE_UAT_CODE.");
    }
    const immutableOccupancyActivity = await queryOne(
      client,
      `SELECT status, version, released_at
         FROM biz_property_occupancy
        WHERE tenant_id=$1 AND park_id=$2 AND id=$3::uuid AND is_deleted=false`,
      [tenantId, parkId, ids.occupancy]
    );
    if (
      immutableOccupancyActivity
      && (
        immutableOccupancyActivity.status !== "held"
        || Number(immutableOccupancyActivity.version ?? 0) > 1
        || immutableOccupancyActivity.released_at !== null
      )
    ) {
      throw new Error("Fixture occupancy has activation or release activity; rerun with a new PROPERTY_CONTROL_PLANE_UAT_CODE.");
    }

    await client.query(
      `INSERT INTO biz_property_occupancy(
         id,tenant_id,park_id,unit_id,source_domain,source_type,source_id,
         start_at,end_at,status,hold_expires_at,idempotency_key,create_by,update_by,remark)
       VALUES($1::uuid,$2,$3,$4::uuid,'operations','uat_hold',$5,
         clock_timestamp()-interval '1 hour',clock_timestamp()+interval '2 days','held',
         clock_timestamp()+interval '1 day',$6,$7::uuid,$7::uuid,$8)
       ON CONFLICT (id) DO UPDATE SET
         status='held',
         hold_expires_at=clock_timestamp()+interval '1 day',
         start_at=clock_timestamp()-interval '1 hour',
         end_at=clock_timestamp()+interval '2 days',
         release_reason=NULL,
         released_at=NULL,
         is_deleted=false,
         update_time=clock_timestamp(),
         remark=EXCLUDED.remark`,
      [
        ids.occupancy,
        tenantId,
        parkId,
        occupancyUnit.id,
        `${runCode}-occupancy`,
        `${runCode}-occupancy`,
        actor.id,
        "Issue #306 UAT: held occupancy for activate action"
      ]
    );

    const configId = modeUnit.config_id ?? ids.operationConfig;
    if (modeUnit.config_id) {
      if (modeUnit.config_id !== ids.operationConfig) {
        throw new Error("Refusing to update a non-fixture operation configuration.");
      }
      await client.query(
        `UPDATE biz_property_operation_config
            SET operating_mode='none', operating_status='enabled', is_deleted=false,
                update_time=clock_timestamp(), remark=$4
          WHERE tenant_id=$1 AND park_id=$2 AND id=$3::uuid`,
        [tenantId, parkId, configId, "Issue #306 UAT: mode transition source"]
      );
    } else {
      await client.query(
        `INSERT INTO biz_property_operation_config(
           id,tenant_id,park_id,unit_id,operating_mode,operating_status,create_by,update_by,remark)
         VALUES($1::uuid,$2,$3,$4::uuid,'none','enabled',$5::uuid,$5::uuid,$6)`,
        [configId, tenantId, parkId, modeUnit.id, actor.id, "Issue #306 UAT: mode transition source"]
      );
    }
    const operationConfig = await queryOne(
      client,
      `SELECT version
         FROM biz_property_operation_config
        WHERE tenant_id=$1 AND park_id=$2 AND id=$3::uuid
          AND unit_id=$4::uuid AND is_deleted=false
        LIMIT 1`,
      [tenantId, parkId, configId, modeUnit.id]
    );
    const sourceExpectedVersion = Number(operationConfig?.version ?? 0);
    if (sourceExpectedVersion < 1) {
      throw new Error("Fixture mode-transition operation configuration version is unavailable.");
    }

    const checkSnapshot = await buildModeTransitionSnapshot(
      client,
      modeUnit.id,
      "short_stay",
      modeTransitionSnapshotCheckedAt
    );
    if (checkSnapshot.blocking_reasons.length > 0) {
      throw new Error(
        `Selected mode-transition unit ${modeUnit.unit_code ?? modeUnit.id} is not executable: ${checkSnapshot.blocking_reasons.join(", ")}`
      );
    }
    const canonicalPayload = {
      unitId: modeUnit.id,
      configId,
      fromMode: "none",
      targetMode: "short_stay",
      operatingStatus: "enabled",
      sourceExpectedVersion,
      reason: "Issue #306 UAT mode transition",
      actorName: "Issue #306 UAT",
      checkSnapshot
    };
    const payloadHash = canonicalHash(canonicalPayload);
    const policyHash = canonicalHash({
      actionId: "property.mode-transition.request",
      owner: "property-foundation",
      version: 1
    });
    const eligibilityPolicySnapshot = {
      requiredPermissions: ["property_approval:decide"],
      eligibleActorIds: [approver.id],
      auditorActorIds: [approver.id],
      incidentActorIds: [approver.id],
      sourceScopes: [{ sourceType: "property-operation-config", sourceId: configId }]
    };
    const eligibilityPolicyHash = canonicalHash(eligibilityPolicySnapshot);
    await client.query(
      `INSERT INTO biz_property_approval_request(
         id,tenant_id,park_id,action_id,source_type,source_id,source_expected_version,
         requester_id,submitter_id,client_idempotency_key,business_intent_key,
         canonical_payload,payload_schema_version,payload_hash,policy_id,policy_version,
         policy_hash,decision_status,execution_status,execution_idempotency_key,submitted_at)
       VALUES($1::uuid,$2,$3,'property.mode-transition.request','property-operation-config',$4,$13,
         $5::uuid,$5::uuid,$6,$7,$8::jsonb,1,$9,$10::uuid,1,$11,'pending_approval',
         'not_started',$12,clock_timestamp())
       ON CONFLICT (id) DO UPDATE SET
         source_id=EXCLUDED.source_id,
         source_expected_version=EXCLUDED.source_expected_version,
         canonical_payload=EXCLUDED.canonical_payload,
	         payload_hash=EXCLUDED.payload_hash,
	         decision_status='pending_approval',
	         execution_status='not_started',
	         decision_version=1,
	         execution_version=1,
	         claim_epoch=0,
	         claim_token=NULL,
	         worker_id=NULL,
	         lease_expires_at=NULL,
	         heartbeat_at=NULL,
	         attempt_count=0,
	         next_retry_at=NULL,
	         reconcile_required=false,
	         last_error_category=NULL,
	         last_error_code=NULL,
	         last_error_redacted_message=NULL,
	         infra_exhausted_at=NULL,
	         decided_at=NULL,
	         executed_at=NULL,
	         updated_at=clock_timestamp()`,
      [
        ids.approvalRequest,
        tenantId,
        parkId,
        configId,
        actor.id,
        `${runCode}-mode-client`,
        `${runCode}-mode-intent`,
        JSON.stringify(canonicalPayload),
        payloadHash,
        randomUUID(),
        policyHash,
        `${runCode}-mode-execution`,
        sourceExpectedVersion
      ]
    );

    await client.query(
      `INSERT INTO biz_property_approval_stage(
         id,tenant_id,park_id,request_id,stage_code,stage_ordinal,
         eligibility_policy_snapshot,eligibility_policy_version,eligibility_policy_hash,
         required_count,approved_count,rejected_count,stage_status)
       VALUES($1::uuid,$2,$3,$4::uuid,'uat-review',1,$5::jsonb,1,$6,1,0,0,'pending')
       ON CONFLICT (id) DO UPDATE SET
         eligibility_policy_snapshot=EXCLUDED.eligibility_policy_snapshot,
         eligibility_policy_hash=EXCLUDED.eligibility_policy_hash,
         required_count=1,
         approved_count=0,
         rejected_count=0,
         stage_status='pending',
         version=biz_property_approval_stage.version`,
      [
        ids.approvalStage,
        tenantId,
        parkId,
        ids.approvalRequest,
        JSON.stringify(eligibilityPolicySnapshot),
        eligibilityPolicyHash
      ]
    );
    const modeTransitionEffect = {
      effectKind: "property.mode.transition",
      effectOrdinal: 0,
      effectLineKey: `unit:${modeUnit.id}`,
      owningTable: "biz_property_mode_transition_log",
      owningUniqueName: "uq_property_mode_transition_approval_line",
      expectedCardinality: 2,
      lineAmount: null,
      currency: null
    };
    const modeTransitionEffectHash = canonicalHash({
      ...modeTransitionEffect,
      canonicalPayload
    });
    const existingEffectManifest = await queryOne(
      client,
      `SELECT invariant_hash FROM biz_property_execution_effect_manifest
        WHERE tenant_id=$1 AND park_id=$2 AND id=$3::uuid`,
      [tenantId, parkId, ids.effectManifest]
    );
    if (
      existingEffectManifest?.invariant_hash
      && existingEffectManifest.invariant_hash !== modeTransitionEffectHash
    ) {
      throw new Error("Fixture effect manifest already exists with a different immutable invariant hash; rerun with a new PROPERTY_CONTROL_PLANE_UAT_CODE.");
    }
    await client.query(
      `INSERT INTO biz_property_execution_effect_manifest(
         id,tenant_id,park_id,request_id,effect_kind,effect_ordinal,effect_line_key,
         owning_table,owning_unique_name,expected_cardinality,line_amount,currency,invariant_hash)
       VALUES($1::uuid,$2,$3,$4::uuid,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (id) DO NOTHING`,
      [
        ids.effectManifest,
        tenantId,
        parkId,
        ids.approvalRequest,
        modeTransitionEffect.effectKind,
        modeTransitionEffect.effectOrdinal,
        modeTransitionEffect.effectLineKey,
        modeTransitionEffect.owningTable,
        modeTransitionEffect.owningUniqueName,
        modeTransitionEffect.expectedCardinality,
        modeTransitionEffect.lineAmount,
        modeTransitionEffect.currency,
        modeTransitionEffectHash
      ]
    );

    await client.query(
      `INSERT INTO biz_party(
         id,tenant_id,park_id,party_type,display_name,source_domain,verification_status,
         consent_status,identity_version,create_by,update_by,remark)
       VALUES($1::uuid,$2,$3,'person',$4,'operations','unverified','granted',1,$5::uuid,$5::uuid,$6)
       ON CONFLICT (id) DO UPDATE SET
         display_name=EXCLUDED.display_name,
         verification_status='unverified',
         identity_version=1,
         is_deleted=false,
         update_time=clock_timestamp(),
         remark=EXCLUDED.remark`,
      [
        ids.party,
        tenantId,
        parkId,
        "Issue #306 UAT 身份核验样例",
        actor.id,
        "Issue #306 UAT: identity submission party"
      ]
    );

    await client.query(
      `INSERT INTO biz_party_identity_submission(
         id,tenant_id,park_id,party_id,identity_version,submission_attempt,status,
         drafted_by,recorded_by,drafted_at,source,version)
       VALUES($1::uuid,$2,$3,$4::uuid,1,1,'draft',$5::uuid,$5::uuid,clock_timestamp(),'manual',1)
	       ON CONFLICT (id) DO UPDATE SET
	         status='draft',
	         snapshot_id=NULL,
	         supersedes_submission_id=NULL,
	         verification_queue_id=NULL,
	         assigned_verifier_id=NULL,
	         assignment_version=0,
	         eligibility_policy_snapshot=NULL,
	         eligibility_policy_hash=NULL,
	         draft_hash_algorithm=NULL,
	         draft_hash_version=NULL,
	         draft_encryption_key_id=NULL,
	         draft_payload_format_version=NULL,
	         submitted_by=NULL,
	         decided_by=NULL,
	         withdrawn_by=NULL,
	         superseded_by=NULL,
	         submitted_at=NULL,
	         decided_at=NULL,
	         withdrawn_at=NULL,
	         superseded_at=NULL,
	         decision_reason=NULL,
	         confidence=NULL,
	         version=1,
	         update_time=clock_timestamp()`,
      [ids.submission, tenantId, parkId, ids.party, actor.id]
    );
    await client.query(
      `UPDATE biz_party
          SET current_identity_submission_id=$4::uuid, update_time=clock_timestamp()
        WHERE tenant_id=$1 AND park_id=$2 AND id=$3::uuid`,
      [tenantId, parkId, ids.party, ids.submission]
    );

    const outboxPayload = {
      submissionId: ids.submission,
      partyId: ids.party,
      actorId: actor.id,
      status: "draft",
      submissionVersion: 1,
      assignmentVersion: 0,
      reason: "Issue #306 UAT draft seed",
      documentType: null,
      identityNumberMasked: null,
      fileCount: 0,
      response: null
    };
    const outboxPayloadText = JSON.stringify(outboxPayload);
    const existingOutbox = await queryOne(
      client,
      `SELECT payload_hash FROM biz_property_outbox
        WHERE tenant_id=$1 AND park_id=$2 AND event_id=$3::uuid`,
      [tenantId, parkId, ids.outbox]
    );
    if (existingOutbox?.payload_hash && existingOutbox.payload_hash !== canonicalHash(outboxPayload)) {
      throw new Error("Fixture identity outbox seed already exists with a different immutable payload hash; rerun with a new PROPERTY_CONTROL_PLANE_UAT_CODE.");
    }
    await client.query(
      `INSERT INTO biz_property_event_sequence(
         tenant_id,park_id,ordering_key,next_sequence,version)
       VALUES($1,$2,$3,2,1)
       ON CONFLICT (tenant_id,park_id,ordering_key) DO NOTHING`,
      [tenantId, parkId, `party-identity:${ids.party}`]
    );
    await client.query(
      `INSERT INTO biz_property_outbox(
         event_id,tenant_id,park_id,event_type,event_version,aggregate_type,
         aggregate_id,aggregate_version,ordering_key,sequence,event_ordinal,payload,payload_hash)
       VALUES($1::uuid,$2,$3,'party.identity.draft-created',1,'party_identity_submission',
         $4::uuid,1,$5,1,0,$6::jsonb,$7)
       ON CONFLICT (event_id) DO NOTHING`,
      [
        ids.outbox,
        tenantId,
        parkId,
        ids.submission,
        `party-identity:${ids.party}`,
        outboxPayloadText,
        canonicalHash(outboxPayload)
      ]
    );

    await client.query("COMMIT");
    return {
      actorId: actor.id,
      approverId: approver.id,
      occupancyUnitId: occupancyUnit.id,
      occupancyUnitCode: occupancyUnit.unit_code,
      modeUnitId: modeUnit.id,
      modeUnitCode: modeUnit.unit_code,
      configId
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function main() {
  const client = new Client({
    host: postgresHost,
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    database: postgresDb,
    user: process.env.POSTGRES_USER ?? "jinhu",
    password: process.env.POSTGRES_PASSWORD ?? "change_me"
  });
  await client.connect();
  try {
    const before = await countFixtures(client);
    console.log(`[INFO] property control-plane UAT fixtures before: ${JSON.stringify(before)}`);
    if (allowWrite) {
      const applied = await applyFixtures(client);
      console.log(`[PASS] property control-plane UAT fixtures applied: ${JSON.stringify(applied)}`);
    } else {
      console.log("[INFO] dry run only; set ALLOW_PROPERTY_CONTROL_PLANE_UAT_FIXTURE=yes to write fixtures");
    }
    const after = await countFixtures(client);
    console.log(`[PASS] property control-plane UAT fixtures after: ${JSON.stringify(after)}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`[FAIL] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
