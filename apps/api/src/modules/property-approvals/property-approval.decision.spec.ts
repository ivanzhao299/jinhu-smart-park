import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import type { TenantParkScope } from "@jinhu/shared";
import { hash, PropertyApprovalService } from "./property-approval.service";
import { translateApprovalDatabaseError } from "./property-approval.error";

const scope: TenantParkScope = { tenantId: "tenant-a", parkId: "park-a" };
const enforceControls = {
  inspect: async () => ({ effective: true, mode: "enforce" as const, version: 1 }),
  approvalMode: async () => "enforce" as const,
  requireApprovalEnforce: async () => undefined
};
const actor = {
  sub: "10000000-0000-4000-8000-000000000002",
  username: "approver",
  tenantId: scope.tenantId,
  parkId: scope.parkId,
  roles: [],
  permissions: ["property_approval:decide"]
};

function fixture(overrides: {
  excluded?: boolean;
  priorDecision?: boolean;
  requestVersion?: number;
  requiredCount?: number;
  mutation?: Record<string, unknown> | null;
  casResult?: boolean;
} = {}) {
  const request = {
    id: "20000000-0000-4000-8000-000000000001",
    ...scope,
    actionId: "property.mode-transition.request" as const,
    requesterId: "10000000-0000-4000-8000-000000000001",
    submitterId: "10000000-0000-4000-8000-000000000003",
    decisionStatus: "pending_approval" as const,
    executionStatus: "not_started" as const,
    decisionVersion: overrides.requestVersion ?? 2,
    executionVersion: 1,
    payloadHash: "a".repeat(64),
    updatedAt: new Date(),
    decidedAt: null as Date | null
  };
  const eligibilityPolicySnapshot = { permission: "property_approval:decide" };
  const stage = {
    id: "30000000-0000-4000-8000-000000000001",
    ...scope,
    requestId: request.id,
    stageCode: "finance",
    stageOrdinal: 1,
    eligibilityPolicySnapshot,
    eligibilityPolicyVersion: 1,
    eligibilityPolicyHash: hash(eligibilityPolicySnapshot),
    requiredCount: overrides.requiredCount ?? 1,
    approvedCount: 0,
    rejectedCount: 0,
    stageStatus: "pending" as const,
    version: 1,
    createdAt: new Date()
  };
  const decisions: unknown[] = [];
  const audits: unknown[] = [];
  const mutations: Array<Record<string, unknown>> = [];
  const repository = {
    transaction: async (work: (manager: object) => Promise<unknown>) =>
      work({
        getRepository: () => ({
          create: (value: unknown) => value,
          save: async (value: unknown) => {
            decisions.push(value);
            return value;
          }
        })
      }),
    lockRequest: async () => request,
    lockStages: async () => [stage],
    hasActorExclusion: async () => overrides.excluded ?? false,
    hasActorDecision: async () => overrides.priorDecision ?? false,
    findMutation: async () => overrides.mutation ?? null,
    mutationRepository: () => ({
      create: (value: Record<string, unknown>) => value,
      save: async (value: Record<string, unknown>) => {
        if (!mutations.includes(value)) mutations.push(value);
        return value;
      }
    }),
    stageRepository: () => ({ save: async (value: unknown) => value }),
    requestRepository: () => ({ save: async (value: unknown) => value }),
    casStage: async () => overrides.casResult ?? true,
    casDecisionRequest: async () => overrides.casResult ?? true,
    auditRepository: () => ({
      insert: async (value: unknown) => { audits.push(value); }
    })
  };
  const service = new PropertyApprovalService(
    repository as never,
    { resolve: async () => { throw new Error("unused"); } },
    {
      authorizeDecision: async () => ({
        permissionSnapshot: { permissions: ["property_approval:decide"] }
      }),
      canDecide: async () => true
    },
    { get: () => null },
    { append: async () => undefined },
    {
      predicate: async () => ({
          canReadAll: true,
          requesterId: null,
          requesterRequestIds: [],
          allowedSources: [],
          eligibleApproverRequestIds: [],
          auditorRequestIds: [],
        canAudit: true
      }),
      authorizeSource: async () => undefined
    },
    { authorizeRetry: async () => ({ scopeAssignmentId: "scope-a" }) },
    enforceControls,
    { get: () => null }
  );
  const command = {
    clientKey: "decision-1",
    decision: "approve" as const,
    stageId: stage.id,
    expectedStageVersion: 1,
    expectedRequestVersion: request.decisionVersion
  };
  return { service, request, stage, decisions, audits, mutations, command };
}

test("single-stage quorum approves request while preserving not_started execution", async () => {
  const context = fixture();
  const result = await context.service.decide(scope, actor, context.request.id, context.command);
  assert.equal(result.decisionStatus, "approved");
  assert.equal(result.executionStatus, "not_started");
  assert.equal(result.decisionVersion, 3);
  assert.equal(context.stage.stageStatus, "approved");
  assert.equal(context.stage.version, 2);
  assert.equal(context.decisions.length, 1);
  assert.equal(context.mutations.at(-1)?.receiptStatus, "completed");
  assert.equal(context.audits.length, 1);
});

test("quorum greater than one keeps request pending after first approval", async () => {
  const context = fixture({ requiredCount: 2 });
  const result = await context.service.decide(scope, actor, context.request.id, context.command);
  assert.equal(result.decisionStatus, "pending_approval");
  assert.equal(context.stage.stageStatus, "pending");
  assert.equal(context.stage.approvedCount, 1);
});

test("reject requires reason and produces rejected/not_required legal pair", async () => {
  const context = fixture();
  await assert.rejects(
    context.service.decide(scope, actor, context.request.id, {
      ...context.command,
      decision: "reject"
    }),
    (error: unknown) =>
      error instanceof BadRequestException
      && (error.getResponse() as { errorCode: string }).errorCode === "property-validation-failed"
  );
  const result = await context.service.decide(scope, actor, context.request.id, {
    ...context.command,
    decision: "reject",
    reason: "risk not accepted"
  });
  assert.equal(result.decisionStatus, "rejected");
  assert.equal(result.executionStatus, "not_required");
});

test("maker-checker exclusion and historical actor decision both fail closed", async () => {
  for (const options of [{ excluded: true }, { priorDecision: true }]) {
    const context = fixture(options);
    await assert.rejects(
      context.service.decide(scope, actor, context.request.id, context.command),
      (error: unknown) =>
        error instanceof ForbiddenException
        && (error.getResponse() as { errorCode: string }).errorCode
          === "approval-actor-separation-required"
    );
  }
});

test("requester and submitter are rejected directly even when resolver exclusions omit them", async () => {
  for (const edge of ["requesterId", "submitterId"] as const) {
    const context = fixture();
    context.request[edge] = actor.sub;
    await assert.rejects(
      context.service.decide(scope, actor, context.request.id, context.command),
      (error: unknown) =>
        error instanceof ForbiddenException
        && (error.getResponse() as { errorCode: string }).errorCode
          === "approval-actor-separation-required"
    );
    assert.equal(context.decisions.length, 0);
  }
});

test("decision CAS affected zero rejects the stale concurrent checker", async () => {
  const context = fixture({ casResult: false });
  await assert.rejects(
    context.service.decide(scope, actor, context.request.id, context.command),
    (error: unknown) =>
      error instanceof ConflictException
      && (error.getResponse() as { errorCode: string }).errorCode
        === "property-version-conflict"
  );
});

test("same client key replays completed mutation but conflicts on a different hash", async () => {
  const replay = fixture({
    mutation: {
      requestHash: "8aaf547432ef3bd5d51b6cad9d5315aeb4b8018c3f40540827937b633f5f36bb",
      receiptStatus: "completed"
    }
  });
  // The exact canonical hash is obtained once from a normal decision fixture.
  const normal = fixture();
  await normal.service.decide(scope, actor, normal.request.id, normal.command);
  const canonicalHash = normal.mutations[0]?.requestHash;
  const replayWithHash = fixture({
    mutation: { requestHash: canonicalHash, receiptStatus: "completed" }
  });
  const result = await replayWithHash.service.decide(
    scope,
    actor,
    replayWithHash.request.id,
    replayWithHash.command
  );
  assert.equal(result.id, replayWithHash.request.id);

  await assert.rejects(
    replay.service.decide(scope, actor, replay.request.id, replay.command),
    (error: unknown) =>
      error instanceof ConflictException
      && (error.getResponse() as { errorCode: string }).errorCode === "idempotency-key-conflict"
  );
});

test("database constraint conflicts translate to stable approval error codes", () => {
  const cases = [
    {
      error: {
        code: "23505",
        constraint: "uq_biz_property_approval_decision_actor"
      },
      expected: "approval-actor-separation-required"
    },
    {
      error: {
        code: "23505",
        constraint: "uq_biz_property_mutation_receipt_client"
      },
      expected: "idempotency-key-conflict"
    },
    {
      error: {
        code: "23505",
        constraint: "uq_biz_property_execution_effect_receipt_line"
      },
      expected: "approval-reconcile-partial"
    },
    {
      error: { code: "23503" },
      expected: "approval-source-changed"
    }
  ];
  for (const item of cases) {
    assert.throws(
      () => translateApprovalDatabaseError(item.error),
      (error: unknown) =>
        typeof (error as { getResponse?: unknown }).getResponse === "function"
        && ((error as { getResponse(): unknown }).getResponse() as { errorCode: string })
          .errorCode === item.expected
    );
  }
});
