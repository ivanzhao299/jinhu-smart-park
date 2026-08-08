import { Injectable } from "@nestjs/common";
import type { TenantParkScope } from "@jinhu/shared";
import type { PropertyApprovalReadPredicate } from "./property-approval.ports";
import { DataSource, EntityManager } from "typeorm";
import type { QueryDeepPartialEntity } from "typeorm/query-builder/QueryPartialEntity";
import {
  PropertyApprovalActorExclusionEntity,
  PropertyApprovalAuditEntity,
  PropertyApprovalDecisionEntity,
  PropertyApprovalRequestEntity,
  PropertyApprovalStageEntity,
  PropertyExecutionEffectManifestEntity,
  PropertyExecutionEffectReceiptEntity,
  PropertyMutationReceiptEntity
} from "./entities/property-approval.entities";

export interface PersistedApprovalOutboxEvidence {
  eventId: string;
  eventType: string;
  eventVersion: number;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number;
  orderingKey: string;
  sequence: string;
  eventOrdinal: number;
  approvalRequestId: string;
  executionIdempotencyKey: string;
  payload: Record<string, unknown>;
  payloadHash: string;
  status: string;
}

export interface PropertyApprovalExecutionAuthority {
  receipts: PropertyExecutionEffectReceiptEntity[];
  executedAudits: Array<{
    payloadHash: string;
    executionVersion: number;
    toExecutionStatus: string;
  }>;
  outbox: PersistedApprovalOutboxEvidence[];
}

export interface PropertyApprovalExecutionCandidate {
  requestId: string;
  tenantId: string;
  parkId: string;
}

@Injectable()
export class PropertyApprovalRepository {
  constructor(private readonly dataSource: DataSource) {}

  transaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.dataSource.transaction("READ COMMITTED", work);
  }

  requestRepository(manager: EntityManager) {
    return manager.getRepository(PropertyApprovalRequestEntity);
  }

  stageRepository(manager: EntityManager) {
    return manager.getRepository(PropertyApprovalStageEntity);
  }

  exclusionRepository(manager: EntityManager) {
    return manager.getRepository(PropertyApprovalActorExclusionEntity);
  }

  manifestRepository(manager: EntityManager) {
    return manager.getRepository(PropertyExecutionEffectManifestEntity);
  }

  receiptRepository(manager: EntityManager) {
    return manager.getRepository(PropertyExecutionEffectReceiptEntity);
  }

  async dbNow(manager: EntityManager): Promise<Date> {
    const rows = await manager.query("SELECT clock_timestamp() AS now");
    return new Date((rows as Array<{ now: Date | string }>)[0]!.now);
  }

  async listExecutionCandidates(limit: number): Promise<PropertyApprovalExecutionCandidate[]> {
    return this.dataSource.query(
      `SELECT id AS "requestId", tenant_id AS "tenantId", park_id AS "parkId"
         FROM biz_property_approval_request
        WHERE decision_status = 'approved'
          AND EXISTS (
            SELECT 1
              FROM sys_property_runtime_control runtime_control
             WHERE runtime_control.tenant_id = biz_property_approval_request.tenant_id
               AND runtime_control.park_id = biz_property_approval_request.park_id
               AND runtime_control.control_key = 'approval.enforce'
               AND runtime_control.control_kind = 'enforce'
               AND runtime_control.target = 'approval'
               AND runtime_control.enabled = true
               AND runtime_control.control_mode = 'enforce'
          )
          AND (
            execution_status = 'not_started'
            OR (execution_status = 'retry_wait' AND next_retry_at <= clock_timestamp())
            OR (execution_status = 'executing' AND lease_expires_at <= clock_timestamp())
          )
        ORDER BY updated_at, id
        LIMIT $1`,
      [Math.min(Math.max(limit, 1), 500)]
    );
  }

  async findNotificationRecipients(
    scope: TenantParkScope,
    requestId: string
  ): Promise<{ requesterId: string; submitterId: string } | null> {
    const request = await this.dataSource.getRepository(PropertyApprovalRequestEntity).findOne({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, id: requestId },
      select: { requesterId: true, submitterId: true }
    });
    return request
      ? { requesterId: request.requesterId, submitterId: request.submitterId }
      : null;
  }

  async lockManifests(
    manager: EntityManager,
    scope: TenantParkScope,
    requestId: string
  ): Promise<PropertyExecutionEffectManifestEntity[]> {
    return manager.getRepository(PropertyExecutionEffectManifestEntity)
      .createQueryBuilder("manifest")
      .setLock("pessimistic_read")
      .where("manifest.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("manifest.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("manifest.request_id = :requestId", { requestId })
      .orderBy("manifest.effect_ordinal", "ASC")
      .getMany();
  }

  async readExecutionAuthority(
    manager: EntityManager,
    scope: TenantParkScope,
    requestId: string,
    executionIdempotencyKey: string
  ): Promise<PropertyApprovalExecutionAuthority> {
    const receipts = await manager.getRepository(PropertyExecutionEffectReceiptEntity).find({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        requestId,
        executionIdempotencyKey
      },
      order: { effectKind: "ASC", effectOrdinal: "ASC" }
    });
    const executedAudits = await manager.query(
      `SELECT payload_hash AS "payloadHash",
              execution_version AS "executionVersion",
              to_execution_status AS "toExecutionStatus"
         FROM biz_property_approval_audit
        WHERE tenant_id = $1 AND park_id = $2 AND request_id = $3
          AND to_execution_status = 'executed'
        ORDER BY occurred_at, id`,
      [scope.tenantId, scope.parkId, requestId]
    ) as PropertyApprovalExecutionAuthority["executedAudits"];
    const outbox = await manager.query(
      `SELECT event_id AS "eventId", event_type AS "eventType",
              event_version AS "eventVersion", aggregate_type AS "aggregateType",
              aggregate_id AS "aggregateId", aggregate_version AS "aggregateVersion",
              ordering_key AS "orderingKey", sequence::text AS "sequence",
              event_ordinal AS "eventOrdinal",
              approval_request_id AS "approvalRequestId",
              execution_idempotency_key AS "executionIdempotencyKey",
              payload, payload_hash AS "payloadHash", status
         FROM biz_property_outbox
        WHERE tenant_id = $1 AND park_id = $2
          AND approval_request_id = $3 AND execution_idempotency_key = $4
        ORDER BY event_ordinal, event_id`,
      [scope.tenantId, scope.parkId, requestId, executionIdempotencyKey]
    ) as PersistedApprovalOutboxEvidence[];
    return { receipts, executedAudits, outbox };
  }

  auditRepository(manager: EntityManager) {
    return manager.getRepository(PropertyApprovalAuditEntity);
  }

  mutationRepository(manager: EntityManager) {
    return manager.getRepository(PropertyMutationReceiptEntity);
  }

  async lockRequest(
    manager: EntityManager,
    scope: TenantParkScope,
    requestId: string
  ): Promise<PropertyApprovalRequestEntity | null> {
    return this.requestRepository(manager).findOne({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, id: requestId },
      lock: { mode: "pessimistic_write" }
    });
  }

  async casDecisionRequest(
    manager: EntityManager,
    scope: TenantParkScope,
    requestId: string,
    expectedStatus: string,
    expectedVersion: number,
    patch: QueryDeepPartialEntity<PropertyApprovalRequestEntity>
  ): Promise<boolean> {
    const result = await this.requestRepository(manager)
      .createQueryBuilder()
      .update(PropertyApprovalRequestEntity)
      .set(patch)
      .where("tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("park_id = :parkId", { parkId: scope.parkId })
      .andWhere("id = :requestId", { requestId })
      .andWhere("decision_status = :expectedStatus", { expectedStatus })
      .andWhere("decision_version = :expectedVersion", { expectedVersion })
      .execute();
    return result.affected === 1;
  }

  async casExecutionRequest(
    manager: EntityManager,
    scope: TenantParkScope,
    requestId: string,
    expectedStatus: string,
    expectedVersion: number,
    patch: QueryDeepPartialEntity<PropertyApprovalRequestEntity>,
    fence?: { claimEpoch: string; claimToken: string }
  ): Promise<boolean> {
    const builder = this.requestRepository(manager)
      .createQueryBuilder()
      .update(PropertyApprovalRequestEntity)
      .set(patch)
      .where("tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("park_id = :parkId", { parkId: scope.parkId })
      .andWhere("id = :requestId", { requestId })
      .andWhere("execution_status = :expectedStatus", { expectedStatus })
      .andWhere("execution_version = :expectedVersion", { expectedVersion });
    if (fence) {
      builder
        .andWhere("claim_epoch = :claimEpoch", { claimEpoch: fence.claimEpoch })
        .andWhere("claim_token = :claimToken", { claimToken: fence.claimToken });
    }
    const result = await builder.execute();
    return result.affected === 1;
  }

  async casStage(
    manager: EntityManager,
    scope: TenantParkScope,
    stageId: string,
    expectedStatus: string,
    expectedVersion: number,
    patch: QueryDeepPartialEntity<PropertyApprovalStageEntity>
  ): Promise<boolean> {
    const result = await this.stageRepository(manager)
      .createQueryBuilder()
      .update(PropertyApprovalStageEntity)
      .set(patch)
      .where("tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("park_id = :parkId", { parkId: scope.parkId })
      .andWhere("id = :stageId", { stageId })
      .andWhere("stage_status = :expectedStatus", { expectedStatus })
      .andWhere("version = :expectedVersion", { expectedVersion })
      .execute();
    return result.affected === 1;
  }

  async findByClientKey(
    manager: EntityManager,
    scope: TenantParkScope,
    requesterId: string,
    actionId: string,
    clientKey: string
  ): Promise<PropertyApprovalRequestEntity | null> {
    return this.requestRepository(manager).findOne({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        requesterId,
        actionId: actionId as never,
        clientIdempotencyKey: clientKey
      }
    });
  }

  async findByBusinessIntent(
    manager: EntityManager,
    scope: TenantParkScope,
    actionId: string,
    businessIntentKey: string
  ): Promise<PropertyApprovalRequestEntity | null> {
    return this.requestRepository(manager).findOne({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        actionId: actionId as never,
        businessIntentKey
      }
    });
  }

  async insertRequestOnConflict(
    manager: EntityManager,
    request: PropertyApprovalRequestEntity
  ): Promise<boolean> {
    const result = await manager.createQueryBuilder()
      .insert()
      .into(PropertyApprovalRequestEntity)
      .values(request as never)
      .orIgnore()
      .returning("id")
      .execute();
    return result.raw.length === 1;
  }

  async insertMutationOnConflict(
    manager: EntityManager,
    mutation: PropertyMutationReceiptEntity
  ): Promise<boolean> {
    const result = await manager.createQueryBuilder()
      .insert()
      .into(PropertyMutationReceiptEntity)
      .values(mutation)
      .orIgnore()
      .returning("id")
      .execute();
    return result.raw.length === 1;
  }

  async findActiveBySource(
    manager: EntityManager,
    scope: TenantParkScope,
    input: {
      actionId: string;
      sourceType: string;
      sourceId: string;
      sourceExpectedVersion: number;
    }
  ): Promise<PropertyApprovalRequestEntity[]> {
    return this.requestRepository(manager).createQueryBuilder("request")
      .where("request.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("request.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("request.action_id = :actionId", { actionId: input.actionId })
      .andWhere("request.source_type = :sourceType", { sourceType: input.sourceType })
      .andWhere("request.source_id = :sourceId", { sourceId: input.sourceId })
      .andWhere("request.source_expected_version = :sourceExpectedVersion", {
        sourceExpectedVersion: input.sourceExpectedVersion
      })
      .andWhere(`(
        request.decision_status IN (:...activeDecisionStatuses)
        OR (
          request.decision_status = :approvedStatus
          AND request.execution_status IN (:...activeApprovedExecutionStatuses)
        )
      )`, {
        activeDecisionStatuses: ["draft", "submitted", "pending_approval"],
        approvedStatus: "approved",
        activeApprovedExecutionStatuses: [
          "not_started", "executing", "retry_wait", "infra_exhausted"
        ]
      })
      .orderBy("request.created_at", "DESC")
      .addOrderBy("request.id", "DESC")
      .take(2)
      .getMany();
  }

  async listBySource(
    manager: EntityManager,
    scope: TenantParkScope,
    input: { actionId: string; sourceType: string; sourceId: string }
  ): Promise<PropertyApprovalRequestEntity[]> {
    return this.requestRepository(manager).find({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        actionId: input.actionId as never,
        sourceType: input.sourceType,
        sourceId: input.sourceId
      },
      order: { createdAt: "DESC", id: "DESC" }
    });
  }

  async findLatestTerminalBySource(
    manager: EntityManager,
    scope: TenantParkScope,
    input: { actionId: string; sourceType: string; sourceId: string }
  ): Promise<PropertyApprovalRequestEntity | null> {
    return this.requestRepository(manager).createQueryBuilder("request")
      .where("request.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("request.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("request.action_id = :actionId", { actionId: input.actionId })
      .andWhere("request.source_type = :sourceType", { sourceType: input.sourceType })
      .andWhere("request.source_id = :sourceId", { sourceId: input.sourceId })
      .andWhere(`(
        request.decision_status IN (:...terminalDecisionStatuses)
        OR (
          request.decision_status = :approvedStatus
          AND request.execution_status IN (:...terminalApprovedExecutionStatuses)
        )
      )`, {
        terminalDecisionStatuses: ["rejected", "withdrawn", "expired"],
        approvedStatus: "approved",
        terminalApprovedExecutionStatuses: ["executed", "execution_failed"]
      })
      .orderBy("request.source_expected_version", "DESC")
      .addOrderBy("request.created_at", "DESC")
      .addOrderBy("request.id", "DESC")
      .getOne();
  }

  async findDetail(
    scope: TenantParkScope,
    requestId: string
  ): Promise<{
    request: PropertyApprovalRequestEntity;
    stages: PropertyApprovalStageEntity[];
    decisions: PropertyApprovalDecisionEntity[];
  } | null> {
    const request = await this.dataSource.getRepository(PropertyApprovalRequestEntity).findOne({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, id: requestId }
    });
    if (!request) return null;
    const [stages, decisions] = await Promise.all([
      this.dataSource.getRepository(PropertyApprovalStageEntity).find({
        where: { tenantId: scope.tenantId, parkId: scope.parkId, requestId },
        order: { stageOrdinal: "ASC" }
      }),
      this.dataSource.getRepository(PropertyApprovalDecisionEntity).find({
        where: { tenantId: scope.tenantId, parkId: scope.parkId, requestId },
        order: { decidedAt: "ASC" }
      })
    ]);
    return { request, stages, decisions };
  }

  async list(
    scope: TenantParkScope,
    predicate: PropertyApprovalReadPredicate,
    query: {
      page: number;
      pageSize: number;
      decisionStatus?: string;
      executionStatus?: string;
      actionId?: string;
      sourceType?: string;
      sort: "createdAt" | "updatedAt";
      order: "asc" | "desc";
    }
  ): Promise<[PropertyApprovalRequestEntity[], number]> {
    const builder = this.dataSource
      .getRepository(PropertyApprovalRequestEntity)
      .createQueryBuilder("request")
      .where("request.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("request.park_id = :parkId", { parkId: scope.parkId });
    if (!predicate.canReadAll) {
      const projectedRequestIds = [
        ...predicate.requesterRequestIds,
        ...predicate.eligibleApproverRequestIds,
        ...predicate.auditorRequestIds
      ];
      if (projectedRequestIds.length === 0) return [[], 0];
      builder.andWhere("request.id IN (:...readProjectedRequestIds)", {
        readProjectedRequestIds: [...new Set(projectedRequestIds)]
      });
    }
    if (query.decisionStatus) {
      builder.andWhere("request.decision_status = :decisionStatus", {
        decisionStatus: query.decisionStatus
      });
    }
    if (query.executionStatus) {
      builder.andWhere("request.execution_status = :executionStatus", {
        executionStatus: query.executionStatus
      });
    }
    if (query.actionId) builder.andWhere("request.action_id = :actionId", { actionId: query.actionId });
    if (query.sourceType) {
      builder.andWhere("request.source_type = :sourceType", { sourceType: query.sourceType });
    }
    const sortColumn = query.sort === "updatedAt" ? "request.updated_at" : "request.created_at";
    return builder
      .orderBy(sortColumn, query.order.toUpperCase() as "ASC" | "DESC")
      .addOrderBy("request.id", query.order.toUpperCase() as "ASC" | "DESC")
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize)
      .getManyAndCount();
  }

  async findCurrentStages(
    scope: TenantParkScope,
    requestIds: readonly string[]
  ): Promise<Map<string, PropertyApprovalStageEntity>> {
    if (requestIds.length === 0) return new Map();
    const stages = await this.dataSource.getRepository(PropertyApprovalStageEntity)
      .createQueryBuilder("stage")
      .where("stage.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("stage.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("stage.request_id IN (:...requestIds)", { requestIds })
      .andWhere("stage.stage_status = 'pending'")
      .orderBy("stage.stage_ordinal", "ASC")
      .getMany();
    const result = new Map<string, PropertyApprovalStageEntity>();
    for (const stage of stages) {
      if (!result.has(stage.requestId)) result.set(stage.requestId, stage);
    }
    return result;
  }

  async findDecisionCounts(
    scope: TenantParkScope,
    requestIds: readonly string[]
  ): Promise<Map<string, number>> {
    if (requestIds.length === 0) return new Map();
    const rows = await this.dataSource.getRepository(PropertyApprovalDecisionEntity)
      .createQueryBuilder("decision")
      .select("decision.request_id", "requestId")
      .addSelect("COUNT(*)", "count")
      .where("decision.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("decision.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("decision.request_id IN (:...requestIds)", { requestIds })
      .groupBy("decision.request_id")
      .getRawMany<{ requestId: string; count: string }>();
    return new Map(rows.map((row) => [row.requestId, Number(row.count)]));
  }

  async countDecisions(
    manager: EntityManager,
    scope: TenantParkScope,
    requestId: string
  ): Promise<number> {
    return manager.getRepository(PropertyApprovalDecisionEntity).count({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, requestId }
    });
  }

  async lockStages(
    manager: EntityManager,
    scope: TenantParkScope,
    requestId: string
  ): Promise<PropertyApprovalStageEntity[]> {
    return manager.getRepository(PropertyApprovalStageEntity)
      .createQueryBuilder("stage")
      .setLock("pessimistic_write")
      .where("stage.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("stage.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("stage.request_id = :requestId", { requestId })
      .orderBy("stage.stage_ordinal", "ASC")
      .getMany();
  }

  async hasActorExclusion(
    manager: EntityManager,
    scope: TenantParkScope,
    requestId: string,
    actorId: string
  ): Promise<boolean> {
    return manager.getRepository(PropertyApprovalActorExclusionEntity).exist({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, requestId, actorId }
    });
  }

  async hasActorDecision(
    manager: EntityManager,
    scope: TenantParkScope,
    requestId: string,
    actorId: string
  ): Promise<boolean> {
    return manager.getRepository(PropertyApprovalDecisionEntity).exist({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, requestId, actorId }
    });
  }

  async findMutation(
    manager: EntityManager,
    input: {
      scope: TenantParkScope;
      actorId: string;
      actionId: string;
      targetId: string;
      clientKey: string;
    }
  ): Promise<PropertyMutationReceiptEntity | null> {
    return manager.getRepository(PropertyMutationReceiptEntity).findOne({
      where: {
        tenantId: input.scope.tenantId,
        parkId: input.scope.parkId,
        actorId: input.actorId,
        actionId: input.actionId,
        targetId: input.targetId,
        clientKey: input.clientKey
      },
      lock: { mode: "pessimistic_write" }
    });
  }

  async findSubmitMutations(
    manager: EntityManager,
    scope: TenantParkScope,
    actorId: string,
    requestId: string
  ): Promise<PropertyMutationReceiptEntity[]> {
    return manager.getRepository(PropertyMutationReceiptEntity).find({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        actorId,
        actionId: "property.approval.submit",
        targetId: requestId
      },
      order: { createdAt: "ASC", id: "ASC" }
    });
  }
}
