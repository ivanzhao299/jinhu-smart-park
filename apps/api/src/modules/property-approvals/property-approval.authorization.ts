import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { TenantParkScope } from "@jinhu/shared";
import { DataSource, type EntityManager } from "typeorm";
import { propertyApprovalError } from "./property-approval.error";
import type {
  PropertyApprovalAuthorizationPort,
  PropertyApprovalIncidentAuthorizationPort,
  PropertyApprovalReadAuthorizationPort,
  PropertyApprovalReadPredicate
} from "./property-approval.ports";

type QueryManager = Pick<EntityManager, "query">;

interface EligibilitySnapshot {
  requiredPermissions: string[];
  eligibleActorIds: string[];
  auditorActorIds: string[];
  incidentActorIds: string[];
  sourceScopes: Array<{ sourceType: string; sourceId: string }>;
}

interface ApprovalAuthRow {
  requestId: string;
  requesterId: string;
  sourceType: string;
  sourceId: string;
  stageId: string;
  snapshot: Record<string, unknown>;
  snapshotHash: string;
}

@Injectable()
export class DatabasePropertyApprovalAuthorizationAdapter
implements
  PropertyApprovalAuthorizationPort,
  PropertyApprovalReadAuthorizationPort,
  PropertyApprovalIncidentAuthorizationPort {
  constructor(private readonly dataSource: DataSource) {}

  async authorizeDecision(
    input: Parameters<PropertyApprovalAuthorizationPort["authorizeDecision"]>[0]
  ) {
    await this.assertActiveAssetModule(input.manager, input.scope);
    const grants = await this.permissionCodes(input.manager, input.scope, input.actorId);
    const snapshot = decodeEligibilitySnapshot(
      input.eligibilityPolicySnapshot,
      input.eligibilityPolicyHash
    );
    if (
      !snapshot.requiredPermissions.includes("property_approval:decide")
      || !snapshot.requiredPermissions.every((permission) => grants.has(permission))
      || !snapshot.eligibleActorIds.includes(input.actorId)
    ) throw propertyApprovalError("property-action-forbidden");
    const rows = await input.manager.query(
      `SELECT source_type AS "sourceType", source_id::text AS "sourceId"
         FROM biz_property_approval_request
        WHERE tenant_id=$1 AND park_id=$2 AND id=$3`,
      [input.scope.tenantId, input.scope.parkId, input.requestId]
    ) as Array<{ sourceType: string; sourceId: string }>;
    const source = rows[0];
    if (
      !source
      || !snapshot.sourceScopes.some((item) =>
        item.sourceType === source.sourceType && item.sourceId === source.sourceId
      )
    ) throw propertyApprovalError("property-action-forbidden");
    return {
      permissionSnapshot: {
        requiredPermissions: snapshot.requiredPermissions,
        grantedPermissions: snapshot.requiredPermissions,
        sourceScopes: snapshot.sourceScopes
      }
    };
  }

  async canDecide(
    input: Parameters<PropertyApprovalAuthorizationPort["canDecide"]>[0]
  ): Promise<boolean> {
    try {
      const manager = this.dataSource.manager;
      await this.assertActiveAssetModule(manager, input.scope);
      const grants = await this.permissionCodes(manager, input.scope, input.actorId);
      const snapshot = decodeEligibilitySnapshot(
        input.eligibilityPolicySnapshot,
        input.eligibilityPolicyHash
      );
      return snapshot.requiredPermissions.includes("property_approval:decide")
        && snapshot.requiredPermissions.every((permission) => grants.has(permission))
        && snapshot.eligibleActorIds.includes(input.actorId);
    } catch {
      return false;
    }
  }

  async predicate(
    input: Parameters<PropertyApprovalReadAuthorizationPort["predicate"]>[0]
  ): Promise<PropertyApprovalReadPredicate> {
    const manager = this.dataSource.manager;
    await this.assertActiveAssetModule(manager, input.scope);
    const grants = await this.permissionCodes(manager, input.scope, input.actorId);
    if (!grants.has("property_approval:read")) {
      throw propertyApprovalError("property-action-forbidden");
    }
    const rows = await manager.query(
      `SELECT request.id::text AS "requestId",
              request.requester_id::text AS "requesterId",
              request.source_type AS "sourceType",
              request.source_id::text AS "sourceId",
              stage.id::text AS "stageId",
              stage.eligibility_policy_snapshot AS snapshot,
              stage.eligibility_policy_hash AS "snapshotHash"
         FROM biz_property_approval_request request
         JOIN biz_property_approval_stage stage
           ON stage.tenant_id=request.tenant_id
          AND stage.park_id=request.park_id
          AND stage.request_id=request.id
        WHERE request.tenant_id=$1 AND request.park_id=$2`,
      [input.scope.tenantId, input.scope.parkId]
    ) as ApprovalAuthRow[];
    const allowedSources = new Map<string, { sourceType: string; sourceId: string }>();
    const requesterRequestIds = new Set<string>();
    const eligibleApproverRequestIds = new Set<string>();
    const auditorRequestIds = new Set<string>();
    for (const row of rows) {
      let snapshot: EligibilitySnapshot;
      try {
        snapshot = decodeEligibilitySnapshot(row.snapshot, row.snapshotHash);
      } catch {
        continue;
      }
      const requester = row.requesterId === input.actorId;
      const eligible = snapshot.eligibleActorIds.includes(input.actorId)
        && snapshot.requiredPermissions.every((permission) => grants.has(permission));
      const auditor = grants.has("audit:read")
        && snapshot.auditorActorIds.includes(input.actorId);
      const sourceAllowed = snapshot.sourceScopes.some((source) =>
        source.sourceType === row.sourceType && source.sourceId === row.sourceId
      );
      if (requester && sourceAllowed) requesterRequestIds.add(row.requestId);
      if (eligible && sourceAllowed) eligibleApproverRequestIds.add(row.requestId);
      if (auditor && sourceAllowed) auditorRequestIds.add(row.requestId);
      if ((requester || eligible || auditor) && sourceAllowed) {
        allowedSources.set(`${row.sourceType}:${row.sourceId}`, {
          sourceType: row.sourceType,
          sourceId: row.sourceId
        });
      }
    }
    return {
      canReadAll: false,
      requesterId: input.actorId,
      requesterRequestIds: [...requesterRequestIds],
      allowedSources: [...allowedSources.values()],
      eligibleApproverRequestIds: [...eligibleApproverRequestIds],
      auditorRequestIds: [...auditorRequestIds],
      canAudit: auditorRequestIds.size > 0
    };
  }

  async authorizeSource(
    input: Parameters<PropertyApprovalReadAuthorizationPort["authorizeSource"]>[0]
  ): Promise<void> {
    if (!input.predicate.allowedSources.some((source) =>
      source.sourceType === input.sourceType && source.sourceId === input.sourceId
    )) throw propertyApprovalError("property-resource-not-found");
  }

  async authorizeRetry(
    input: Parameters<PropertyApprovalIncidentAuthorizationPort["authorizeRetry"]>[0]
  ) {
    await this.assertActiveAssetModule(input.manager, input.scope);
    const grants = await this.permissionCodes(input.manager, input.scope, input.actorId);
    const required = [
      "property:approval-incidents:page",
      "property_approval:read_incident",
      "property_approval:retry"
    ];
    if (!required.every((permission) => grants.has(permission))) {
      throw propertyApprovalError("property-action-forbidden");
    }
    await this.assertActiveParkAssignment(input.manager, input.scope, input.actorId);
    const rows = await input.manager.query(
      `SELECT stage.id::text AS "stageId",
              stage.eligibility_policy_snapshot AS snapshot,
              stage.eligibility_policy_hash AS "snapshotHash"
         FROM biz_property_approval_request request
         JOIN biz_property_approval_stage stage
           ON stage.tenant_id=request.tenant_id
          AND stage.park_id=request.park_id
          AND stage.request_id=request.id
        WHERE request.tenant_id=$1 AND request.park_id=$2 AND request.id=$3
          AND request.execution_status='infra_exhausted'
        ORDER BY stage.stage_ordinal`,
      [input.scope.tenantId, input.scope.parkId, input.requestId]
    ) as Array<{
      stageId: string;
      snapshot: Record<string, unknown>;
      snapshotHash: string;
    }>;
    for (const row of rows) {
      const snapshot = decodeEligibilitySnapshot(row.snapshot, row.snapshotHash);
      if (snapshot.incidentActorIds.includes(input.actorId)) {
        return { scopeAssignmentId: row.stageId };
      }
    }
    throw propertyApprovalError("property-action-forbidden");
  }

  private async assertActiveAssetModule(
    manager: QueryManager,
    scope: TenantParkScope
  ): Promise<void> {
    const rows = await manager.query(
      `SELECT assignment.id
         FROM rel_tenant_module assignment
         JOIN sys_module module ON module.id=assignment.module_id
        WHERE assignment.tenant_id::text=$1 AND assignment.park_id::text=$2
          AND module.module_code='asset' AND module.status=1 AND module.is_deleted=false
          AND assignment.enabled=true AND assignment.status='enabled'
          AND assignment.is_deleted=false
          AND (assignment.start_time IS NULL OR assignment.start_time<=clock_timestamp())
          AND (assignment.expire_time IS NULL OR assignment.expire_time>clock_timestamp())
        LIMIT 1`,
      [scope.tenantId, scope.parkId]
    ) as unknown[];
    if (rows.length !== 1) throw propertyApprovalError("property-action-forbidden");
  }

  private async permissionCodes(
    manager: QueryManager,
    scope: TenantParkScope,
    actorId: string
  ): Promise<Set<string>> {
    const rows = await manager.query(
      `SELECT DISTINCT permission.code
         FROM sys_user actor
         JOIN rel_user_role user_role
           ON user_role.user_id=actor.id
          AND user_role.tenant_id=actor.tenant_id
          AND user_role.park_id=actor.park_id
         JOIN sys_role role ON role.id=user_role.role_id
          AND role.tenant_id=user_role.tenant_id
          AND (role.role_scope='tenant' OR role.park_id=user_role.park_id)
         JOIN rel_role_perm role_permission ON role_permission.role_id=role.id
          AND role_permission.tenant_id=role.tenant_id
          AND role_permission.park_id=user_role.park_id
         JOIN sys_permission permission
           ON permission.id=role_permission.permission_id
          AND permission.tenant_id=role_permission.tenant_id
        WHERE actor.id::text=$3 AND actor.tenant_id::text=$1 AND actor.park_id::text=$2
          AND actor.is_enabled=true AND actor.status='enabled' AND actor.is_deleted=false
          AND user_role.is_deleted=false
          AND role.is_enabled=true AND role.status='enabled' AND role.is_deleted=false
          AND role_permission.is_deleted=false
          AND permission.is_enabled=true AND permission.status='enabled'
          AND permission.is_deleted=false`,
      [scope.tenantId, scope.parkId, actorId]
    ) as Array<{ code: string }>;
    return new Set(rows.map((row) => row.code));
  }

  private async assertActiveParkAssignment(
    manager: QueryManager,
    scope: TenantParkScope,
    actorId: string
  ): Promise<void> {
    const rows = await manager.query(
      `SELECT assignment.id
         FROM rel_user_park assignment
        WHERE assignment.tenant_id::text=$1 AND assignment.park_id::text=$2
          AND assignment.user_id::text=$3
          AND assignment.status='enabled' AND assignment.is_deleted=false
        LIMIT 1`,
      [scope.tenantId, scope.parkId, actorId]
    ) as unknown[];
    if (rows.length !== 1) throw propertyApprovalError("property-action-forbidden");
  }
}

export function decodeEligibilitySnapshot(
  value: Readonly<Record<string, unknown>>,
  expectedHash: string
): EligibilitySnapshot {
  if (canonicalHash(value) !== expectedHash) {
    throw propertyApprovalError("property-action-forbidden");
  }
  const requiredPermissions = stringArray(value.requiredPermissions);
  const eligibleActorIds = uuidArray(value.eligibleActorIds);
  const auditorActorIds = uuidArray(value.auditorActorIds);
  const incidentActorIds = uuidArray(value.incidentActorIds);
  const rawScopes = Array.isArray(value.sourceScopes) ? value.sourceScopes : null;
  if (!requiredPermissions || !eligibleActorIds || !auditorActorIds || !incidentActorIds
    || !rawScopes) throw propertyApprovalError("property-action-forbidden");
  const sourceScopes = rawScopes.map((item) => {
    if (
      !item
      || typeof item !== "object"
      || typeof (item as Record<string, unknown>).sourceType !== "string"
      || !isUuid((item as Record<string, unknown>).sourceId)
    ) throw propertyApprovalError("property-action-forbidden");
    return {
      sourceType: (item as Record<string, unknown>).sourceType as string,
      sourceId: (item as Record<string, unknown>).sourceId as string
    };
  });
  return {
    requiredPermissions,
    eligibleActorIds,
    auditorActorIds,
    incidentActorIds,
    sourceScopes
  };
}

function stringArray(value: unknown): string[] | null {
  return Array.isArray(value)
    && value.length > 0
    && value.every((item) => typeof item === "string" && item.length > 0)
    && new Set(value).size === value.length
    ? [...value] as string[]
    : null;
}

function uuidArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every(isUuid) || new Set(value).size !== value.length) {
    return null;
  }
  return [...value] as string[];
}

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function canonicalHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)])
    );
  }
  return value;
}
