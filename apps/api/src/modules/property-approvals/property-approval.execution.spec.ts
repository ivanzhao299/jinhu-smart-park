import assert from "node:assert/strict";
import test from "node:test";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import type { TenantParkScope } from "@jinhu/shared";
import {
  APPROVAL_EXECUTION_LEASE_MS,
  ApprovalExecutionError,
  canonicalEffectInvariantHash,
  hash,
  PropertyApprovalService,
  validatePersistedExecutionAuthority
} from "./property-approval.service";
import { PropertyApprovalRepository } from "./property-approval.repository";

const scope: TenantParkScope = { tenantId: "tenant-a", parkId: "park-a" };
const now = new Date("2026-07-31T00:00:00.000Z");

function runtime(options: {
  reconcile?: "complete" | "absent" | "partial";
  executeError?: unknown;
  wrongReceipt?: boolean;
  financial?: boolean;
  financialKinds?: readonly (
    | "homestay.ledger.refund"
    | "homestay.ledger.waiver"
    | "housing.ledger.refund"
    | "housing.ledger.waiver"
    | "housing.ledger.deposit.refund"
  )[];
  receiptAmount?: string;
  proofFault?: "wrong-table" | "wrong-cardinality" | "wrong-domain-row" | "missing-row" | "duplicate-row";
  controlMode?: "disabled" | "shadow" | "enforce";
  casExecutionResult?: boolean;
  incidentAuthorizationError?: Error;
  financialMutationCount?: number;
  outboxFault?: "two-events" | "payload" | "aggregate" | "ordering" | "version" | "ordinal" | "hash";
} = {}) {
  let controlMode = options.controlMode ?? "enforce";
  const financialKinds = options.financialKinds
    ?? (options.financial ? ["homestay.ledger.refund"] as const : []);
  const financial = financialKinds.length > 0;
  const housingFinance = financialKinds.some((kind) => kind.startsWith("housing."));
  const canonicalPayload = financial ? {
    lines: financialKinds.map((kind, ordinal) => ({
      entryType: kind.includes("deposit.refund")
        ? "deposit-refund" : kind.endsWith("waiver") ? "waiver" : "refund",
      amount: "10.00",
      currency: "CNY",
      ...(housingFinance
        ? { receivableId: `30000000-0000-4000-8000-${String(ordinal + 1).padStart(12, "0")}` }
        : { sourceLedgerEntryId: `30000000-0000-4000-8000-${String(ordinal + 1).padStart(12, "0")}` })
    }))
  } : { unitId: "30000000-0000-4000-8000-000000000001" };
  const request = {
    id: "20000000-0000-4000-8000-000000000001",
    ...scope,
    actionId: financial
      ? housingFinance
        ? "housing.finance.refund-waive-or-deposit-refund.request" as const
        : "homestay.finance.refund-or-waive.request" as const
      : "property.mode-transition.request" as const,
    sourceType: "property-unit",
    sourceId: "30000000-0000-4000-8000-000000000001",
    sourceExpectedVersion: 4,
    canonicalPayload,
    payloadHash: "a".repeat(64),
    amount: financial ? `${financialKinds.length * 10}.00` : null,
    currency: financial ? "CNY" : null,
    decisionStatus: "approved" as const,
    executionStatus: "not_started" as string,
    decisionVersion: 3,
    executionVersion: 1,
    executionIdempotencyKey: "execution-1",
    claimEpoch: "0",
    claimToken: null as string | null,
    workerId: null as string | null,
    leaseExpiresAt: null as Date | null,
    heartbeatAt: null as Date | null,
    attemptCount: 0,
    nextRetryAt: null as Date | null,
    reconcileRequired: false,
    lastErrorCategory: null as string | null,
    lastErrorCode: null as string | null,
    lastErrorRedactedMessage: null as string | null,
    infraExhaustedAt: null as Date | null,
    executedAt: null as Date | null,
    updatedAt: now
  };
  const effectiveKinds = financialKinds.length > 0
    ? financialKinds
    : ["property.mode.transition"] as const;
  const manifests = effectiveKinds.map((effectKind, effectOrdinal) => {
    const manifestContent = {
      id: `40000000-0000-4000-8000-${String(effectOrdinal + 1).padStart(12, "0")}`,
      ...scope,
      requestId: request.id,
      effectKind,
      effectOrdinal,
      effectLineKey: financial
        ? `${effectKind.includes("deposit.refund")
          ? "ledger:deposit-refund"
          : effectKind.endsWith("waiver")
            ? "ledger:waiver"
            : "ledger:refund"}`
          + `:30000000-0000-4000-8000-${String(effectOrdinal + 1).padStart(12, "0")}`
        : "unit:30000000-0000-4000-8000-000000000001",
      owningTable: financial
        ? housingFinance
          ? "biz_housing_ledger_entry"
          : "biz_homestay_ledger_entry"
        : "biz_property_mode_transition_log",
      owningUniqueName: financial
        ? housingFinance
          ? "uq_housing_ledger_approval_line"
          : "uq_homestay_ledger_approval_line"
        : "uq_property_mode_transition_approval_line",
      expectedCardinality: financial ? 1 : 2,
      lineAmount: financial ? "10.00" : null,
      currency: financial ? "CNY" : null,
      createdAt: now
    };
    return {
      ...manifestContent,
      invariantHash: canonicalEffectInvariantHash(manifestContent, request.canonicalPayload)
    };
  });
  const receipts = manifests.map((manifest, effectOrdinal) => ({
    manifestId: manifest.id,
    effectKind: manifest.effectKind,
    effectOrdinal,
    effectLineKey: manifest.effectLineKey,
    domainTable: manifest.owningTable,
    domainRowId: `50000000-0000-4000-8000-${String(effectOrdinal + 1).padStart(12, "0")}`,
    effectHash: options.wrongReceipt && effectOrdinal === 0
      ? "d".repeat(64)
      : manifest.invariantHash,
    owningUniqueName: manifest.owningUniqueName,
    uniqueKeyHash: String(effectOrdinal + 1).repeat(64),
    observedCardinality: manifest.expectedCardinality,
    lineAmount: financial
      ? effectOrdinal === 0
        ? options.receiptAmount ?? "10.00"
        : "10.00"
      : null,
    currency: financial ? "CNY" : null
  }));
  const verifiedProofs = receipts.map((receipt) => ({
    domainTable: receipt.domainTable,
    domainRowId: receipt.domainRowId,
    owningUniqueName: receipt.owningUniqueName,
    uniqueKeyHash: receipt.uniqueKeyHash,
    observedCardinality: receipt.observedCardinality,
    lineAmount: financial ? "10.00" : null,
    currency: financial ? "CNY" : null
  }));
  const manifest = manifests[0]!;
  const receipt = receipts[0]!;
  const manager = { marker: "same-transaction" };
  const calls: string[] = [];
  const mutations: Array<Record<string, unknown>> = [];
  const incidentAuthInputs: unknown[] = [];
  const persistedReceipts: Array<Record<string, unknown>> = [];
  const executedAudits: Array<Record<string, unknown>> = [];
  const persistedOutbox: Array<Record<string, unknown>> = [];
  const repository = {
    transaction: async (work: (value: object) => Promise<unknown>) => work(manager),
    lockRequest: async () => request,
    dbNow: async () => now,
    requestRepository: () => ({
      save: async (value: unknown) => {
        calls.push("request-save");
        return value;
      }
    }),
    casExecutionRequest: async () => {
      calls.push("request-cas");
      return options.casExecutionResult ?? true;
    },
    auditRepository: () => ({
      insert: async (value: Record<string, unknown>) => {
        calls.push("audit");
        if (value.toExecutionStatus === "executed") {
          executedAudits.push({
            payloadHash: value.payloadHash,
            executionVersion: value.executionVersion,
            toExecutionStatus: value.toExecutionStatus
          });
        }
      }
    }),
    lockManifests: async () => manifests,
    receiptRepository: () => ({
      create: (value: unknown) => value,
      save: async (values: Array<Record<string, unknown>>) => {
        calls.push("receipts");
        persistedReceipts.push(...values);
      }
    }),
    findMutation: async () => null,
    mutationRepository: () => ({
      create: (value: Record<string, unknown>) => value,
      save: async (value: Record<string, unknown>) => {
        if (!mutations.includes(value)) mutations.push(value);
        return value;
      }
    }),
    readExecutionAuthority: async () => ({
      receipts: persistedReceipts,
      executedAudits,
      outbox: persistedOutbox
    })
  };
  const adapter = {
    actionId: request.actionId,
    execute: async (input: { manager: object; sourceExpectedVersion: number }) => {
      assert.equal(input.manager, manager);
      assert.equal(input.sourceExpectedVersion, 4);
      calls.push("domain-effect");
      if (options.executeError) throw options.executeError;
      const event = {
        eventId: "60000000-0000-4000-8000-000000000001",
        eventType: `${request.actionId}.executed`,
        eventVersion: 1,
        aggregateType: request.sourceType,
        aggregateId: request.sourceId,
        aggregateVersion: request.sourceExpectedVersion + 1,
        orderingKey: `${request.sourceType}:${request.sourceId}`,
        eventOrdinal: 0,
        payload: {
          approvalRequestId: request.id,
          executionIdempotencyKey: request.executionIdempotencyKey,
          actionId: request.actionId,
          sourceType: request.sourceType,
          sourceId: request.sourceId,
          sourceExpectedVersion: request.sourceExpectedVersion
        },
        payloadHash: ""
      };
      if (options.outboxFault === "payload") event.payload.approvalRequestId = request.sourceId;
      if (options.outboxFault === "aggregate") event.aggregateId = request.id;
      if (options.outboxFault === "ordering") event.orderingKey = "wrong:key";
      if (options.outboxFault === "version") event.aggregateVersion += 1;
      if (options.outboxFault === "ordinal") event.eventOrdinal = 1;
      event.payloadHash = options.outboxFault === "hash"
        ? "f".repeat(64)
        : hash(event.payload);
      const outboxEvents = options.outboxFault === "two-events"
        ? [event, { ...event, eventId: "60000000-0000-4000-8000-000000000002" }]
        : [event];
      return {
        receipts,
        outboxEvents,
        financialMutationCount: options.financialMutationCount ?? (financial ? receipts.length : 0)
      };
    },
    reconcile: async (input: { manager: object }) => {
      assert.equal(input.manager, manager);
      calls.push("reconcile");
      if (options.reconcile === "complete") {
        return {
          state: "complete" as const,
          receipts,
          financialMutationCount: financial ? receipts.length : 0
        };
      }
      if (options.reconcile === "partial") {
        return { state: "partial" as const, reason: "partial", evidence: {} };
      }
      return { state: "absent" as const, financialMutationCount: 0 as const };
    }
  };
  const service = new PropertyApprovalService(
    repository as never,
    { resolve: async () => { throw new Error("unused"); } },
    {
      authorizeDecision: async () => { throw new Error("unused"); },
      canDecide: async () => false
    },
    { get: () => adapter },
    {
      append: async (inputManager, input) => {
        assert.equal(inputManager, manager);
        calls.push("outbox");
        persistedOutbox.push(...input.events.map((event) => ({
          ...event,
          sequence: "1",
          approvalRequestId: input.approvalRequestId,
          executionIdempotencyKey: input.executionIdempotencyKey,
          status: "pending"
        })));
      }
    },
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
    {
      authorizeRetry: async (input) => {
        incidentAuthInputs.push(input);
        if (options.incidentAuthorizationError) {
          throw options.incidentAuthorizationError;
        }
        return { scopeAssignmentId: "scope-a" };
      }
    },
    {
      inspect: async () => ({
        effective: controlMode === "enforce",
        mode: controlMode,
        version: 1
      }),
      approvalMode: async () => controlMode,
      requireApprovalEnforce: async () => {
        if (controlMode !== "enforce") {
          throw new ConflictException("property-runtime-unavailable");
        }
      }
    },
    {
      get: (_actionId, effectKind) => {
        const ordinal = manifests.findIndex((item) => item.effectKind === effectKind);
        const verifiedManifest = manifests[ordinal]!;
        const verifiedReceipt = verifiedProofs[ordinal]!;
        return ({
        actionId: request.actionId,
        effectKind: verifiedManifest.effectKind,
        verify: async () => {
          if (options.proofFault === "missing-row" || options.proofFault === "duplicate-row") {
            throw new ApprovalExecutionError("business", "approval-reconcile-partial", "proof rows invalid");
          }
          return ({
          domainTable: options.proofFault === "wrong-table"
            ? "biz_wrong_table" : verifiedReceipt.domainTable,
          domainRowId: options.proofFault === "wrong-domain-row"
            ? "not-a-uuid" : verifiedReceipt.domainRowId,
          owningUniqueName: verifiedReceipt.owningUniqueName,
          uniqueKeyHash: verifiedReceipt.uniqueKeyHash,
          observedCardinality: options.proofFault === "wrong-cardinality"
            ? verifiedReceipt.observedCardinality + 1 : verifiedReceipt.observedCardinality,
          lineAmount: verifiedReceipt.lineAmount,
          currency: verifiedReceipt.currency
        }); }
      }); }
    }
  );
  return {
    service,
    request,
    calls,
    receipt,
    receipts,
    manifest,
    manifests,
    mutations,
    incidentAuthInputs,
    persistedReceipts,
    executedAudits,
    persistedOutbox,
    setControlMode: (mode: "disabled" | "shadow" | "enforce") => {
      controlMode = mode;
    }
  };
}

test("claim issues a 30-second fenced lease and expired reclaim replaces epoch/token", async () => {
  const context = runtime();
  const first = await context.service.claimExecution(scope, context.request.id, "worker-a");
  assert.equal(first.claimEpoch, "1");
  assert.equal(first.leaseExpiresAt.getTime() - now.getTime(), APPROVAL_EXECUTION_LEASE_MS);
  assert.equal(first.reconcileRequired, false);

  context.request.leaseExpiresAt = new Date(now.getTime() - 1);
  const reclaimed = await context.service.claimExecution(scope, context.request.id, "worker-b");
  assert.equal(reclaimed.claimEpoch, "2");
  assert.notEqual(reclaimed.claimToken, first.claimToken);
  assert.equal(reclaimed.reconcileRequired, true);

  await assert.rejects(
    context.service.heartbeatExecution(scope, first),
    (error: unknown) =>
      error instanceof ConflictException
      && (error.getResponse() as { errorCode: string }).errorCode === "property-version-conflict"
  );
});

test("disabled and shadow controls never claim or execute; shadow only records observation", async () => {
  for (const controlMode of ["disabled", "shadow"] as const) {
    const context = runtime({ controlMode });
    await assert.rejects(
      context.service.claimExecution(scope, context.request.id, "worker-a")
    );
    assert.equal(context.calls.includes("request-cas"), false);
    assert.equal(context.calls.includes("domain-effect"), false);
    assert.equal(context.request.executionStatus, "not_started");
    assert.equal(context.calls.includes("audit"), controlMode === "shadow");
  }
});

test("runtime control rollback and re-enable preserves authority and never restores direct execution", async () => {
  const context = runtime({ controlMode: "disabled" });
  await assert.rejects(context.service.claimExecution(scope, context.request.id, "worker-disabled"));
  assert.equal(context.request.executionStatus, "not_started");
  assert.equal(context.calls.includes("domain-effect"), false);

  context.setControlMode("enforce");
  const claim = await context.service.claimExecution(scope, context.request.id, "worker-enforced");
  await context.service.executeClaim(scope, claim);
  assert.equal(context.request.executionStatus, "executed");
  assert.equal(context.calls.filter((call) => call === "domain-effect").length, 1);
  assert.equal(context.persistedReceipts.length, 1);
  assert.equal(context.executedAudits.length, 1);
  assert.equal(context.persistedOutbox.length, 1);

  context.setControlMode("disabled");
  assert.equal(context.request.executionStatus, "executed");
  assert.equal(context.calls.filter((call) => call === "domain-effect").length, 1);
  assert.equal(context.persistedReceipts.length, 1);
  assert.equal(context.executedAudits.length, 1);
  assert.equal(context.persistedOutbox.length, 1);
});

test("execution CAS affected zero is a stable fenced version conflict", async () => {
  const context = runtime({ casExecutionResult: false });
  await assert.rejects(
    context.service.claimExecution(scope, context.request.id, "worker-a"),
    (error: unknown) =>
      error instanceof ConflictException
      && (error.getResponse() as { errorCode: string }).errorCode
        === "property-version-conflict"
  );
  assert.equal(context.calls.includes("domain-effect"), false);
});

test("execute uses one manager for domain effect, receipts, terminal audit and outbox", async () => {
  const context = runtime();
  const claim = await context.service.claimExecution(scope, context.request.id, "worker-a");
  const result = await context.service.executeClaim(scope, claim);
  assert.equal(result.executionStatus, "executed");
  const domainIndex = context.calls.indexOf("domain-effect");
  const receiptIndex = context.calls.indexOf("receipts", domainIndex);
  const executedIndex = context.calls.indexOf("request-cas", receiptIndex);
  const auditIndex = context.calls.indexOf("audit", executedIndex);
  const outboxIndex = context.calls.indexOf("outbox", auditIndex);
  assert.ok(domainIndex < receiptIndex);
  assert.ok(receiptIndex < executedIndex);
  assert.ok(executedIndex < auditIndex);
  assert.ok(auditIndex < outboxIndex);
});

test("repository locks manifests strictly by frozen effect ordinal", async () => {
  const ordering: Array<[string, string]> = [];
  const query = {
    setLock: () => query,
    where: () => query,
    andWhere: () => query,
    orderBy: (column: string, direction: string) => {
      ordering.push([column, direction]);
      return query;
    },
    addOrderBy: (column: string, direction: string) => {
      ordering.push([column, direction]);
      return query;
    },
    getMany: async () => []
  };
  const repository = new PropertyApprovalRepository({} as never);
  await repository.lockManifests(
    {
      getRepository: () => ({
        createQueryBuilder: () => query
      })
    } as never,
    scope,
    "20000000-0000-4000-8000-000000000001"
  );
  assert.deepEqual(ordering, [["manifest.effect_ordinal", "ASC"]]);
});

test("mixed financial effect kinds execute in frozen ordinal order, not lexical order", async () => {
  for (const financialKinds of [
    ["homestay.ledger.waiver", "homestay.ledger.refund"],
    [
      "housing.ledger.waiver",
      "housing.ledger.deposit.refund",
      "housing.ledger.refund"
    ]
  ] as const) {
    const context = runtime({ financialKinds });
    const claim = await context.service.claimExecution(scope, context.request.id, "worker-a");
    const result = await context.service.executeClaim(scope, claim);
    assert.equal(result.executionStatus, "executed");
    assert.deepEqual(
      context.persistedReceipts.map((item) => item.effectKind),
      [...financialKinds]
    );
    assert.deepEqual(
      context.persistedReceipts.map((item) => item.effectOrdinal),
      financialKinds.map((_, ordinal) => ordinal)
    );
    assert.equal(context.calls.filter((call) => call === "domain-effect").length, 1);
  }
});

test("stale reclaim observes an authoritative concurrent completion without re-executing", async () => {
  const context = runtime();
  const claim = await context.service.claimExecution(scope, context.request.id, "worker-a");
  const executed = await context.service.executeClaim(scope, claim);
  const callsAfterCommit = [...context.calls];
  const observed = await context.service.executeClaim(scope, {
    ...claim,
    claimEpoch: "999",
    claimToken: "70000000-0000-4000-8000-000000000001",
    workerId: "stale-reclaim-worker"
  });
  assert.equal(observed, executed);
  assert.deepEqual(context.calls, callsAfterCommit);
  assert.equal(context.calls.filter((call) => call === "domain-effect").length, 1);
});

test("stale incident retry returns an authoritative concurrent completion", async () => {
  const context = runtime();
  const claim = await context.service.claimExecution(scope, context.request.id, "worker-a");
  await context.service.executeClaim(scope, claim);
  const callsAfterCommit = [...context.calls];
  const result = await context.service.reconcileExhaustedExecution(
    scope,
    {
      sub: "10000000-0000-4000-8000-000000000009",
      username: "incident-operator",
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      roles: [],
      permissions: ["*"]
    },
    context.request.id,
    {
      expectedExecutionVersion: 1,
      clientKey: "stale-incident-after-complete",
      incidentId: "incident-stale-complete",
      reason: "concurrent worker already committed"
    }
  );
  assert.equal(result.outcome, "complete");
  assert.equal(result.request.executionStatus, "executed");
  assert.deepEqual(context.calls, callsAfterCommit);
  assert.equal(context.calls.filter((call) => call === "domain-effect").length, 1);
});

test("persisted authority rejects outbox corruption after enqueue", async () => {
  for (const fault of ["status", "sequence", "payloadHash"] as const) {
    const context = runtime();
    const claim = await context.service.claimExecution(scope, context.request.id, "worker-a");
    await context.service.executeClaim(scope, claim);
    const original = { ...context.persistedOutbox[0]! };
    const corrupted = {
      ...original,
      ...(fault === "status" ? { status: "published" } : {}),
      ...(fault === "sequence" ? { sequence: "0" } : {}),
      ...(fault === "payloadHash" ? { payloadHash: "f".repeat(64) } : {})
    };
    assert.throws(() => validatePersistedExecutionAuthority(
      context.request as never,
      [context.receipt],
      original as never,
      {
        receipts: context.persistedReceipts as never,
        executedAudits: context.executedAudits as never,
        outbox: [corrupted] as never
      }
    ), ApprovalExecutionError);
  }
});

test("persisted authority consumes every database uniqueness proof column", async () => {
  for (const fault of ["owningUniqueName", "uniqueKeyHash", "observedCardinality"] as const) {
    const context = runtime();
    const claim = await context.service.claimExecution(scope, context.request.id, "worker-a");
    await context.service.executeClaim(scope, claim);
    const persistedReceipt = {
      ...context.persistedReceipts[0]!,
      ...(fault === "owningUniqueName" ? { owningUniqueName: "uq_wrong_authority" } : {}),
      ...(fault === "uniqueKeyHash" ? { uniqueKeyHash: "f".repeat(64) } : {}),
      ...(fault === "observedCardinality" ? { observedCardinality: 1 } : {})
    };
    assert.throws(() => validatePersistedExecutionAuthority(
      context.request as never,
      [context.receipt],
      context.persistedOutbox[0] as never,
      {
        receipts: [persistedReceipt] as never,
        executedAudits: context.executedAudits as never,
        outbox: context.persistedOutbox as never
      }
    ), ApprovalExecutionError);
  }
});

test("adapter-only complete cannot mark an expired reclaim executed", async () => {
  const context = runtime({ reconcile: "complete" });
  const first = await context.service.claimExecution(scope, context.request.id, "worker-a");
  context.request.leaseExpiresAt = new Date(now.getTime() - 1);
  const claim = await context.service.claimExecution(scope, context.request.id, "worker-b");
  assert.notEqual(claim.claimToken, first.claimToken);
  await assert.rejects(context.service.executeClaim(scope, claim), ConflictException);
  assert.equal(context.request.executionStatus, "infra_exhausted");
  assert.equal(context.request.executedAt, null);
  assert.ok(context.calls.includes("reconcile"));
  assert.equal(context.calls.includes("domain-effect"), false);
});

test("commit-unknown preserves executing state for lease-expiry reconciliation", async () => {
  const context = runtime({
    executeError: new ApprovalExecutionError(
      "commit_unknown",
      "database-commit-unknown",
      "Commit result unknown"
    )
  });
  const claim = await context.service.claimExecution(scope, context.request.id, "worker-a");
  await assert.rejects(context.service.executeClaim(scope, claim), ApprovalExecutionError);
  assert.equal(context.request.executionStatus, "executing");
  assert.equal(context.request.claimToken, claim.claimToken);
});

test("adapter self-reported proof is ignored in favor of the trusted verifier", async () => {
  const context = runtime({ wrongReceipt: true });
  const claim = await context.service.claimExecution(scope, context.request.id, "worker-a");
  assert.equal((await context.service.executeClaim(scope, claim)).executionStatus, "executed");
});

test("trusted verifier wrong table/cardinality/domain row or row count never executes", async () => {
  for (const proofFault of [
    "wrong-table", "wrong-cardinality", "wrong-domain-row", "missing-row", "duplicate-row"
  ] as const) {
    const context = runtime({ proofFault });
    const claim = await context.service.claimExecution(scope, context.request.id, "worker-a");
    await assert.rejects(context.service.executeClaim(scope, claim), ConflictException);
    assert.equal(context.request.executionStatus, "infra_exhausted");
    assert.equal(context.request.executedAt, null);
  }
});

test("manifest cardinality requires an exact trusted observed-cardinality proof", async () => {
  const context = runtime({ proofFault: "wrong-cardinality" });
  const claim = await context.service.claimExecution(scope, context.request.id, "worker-a");
  await assert.rejects(context.service.executeClaim(scope, claim), ConflictException);
  assert.equal(context.request.executionStatus, "infra_exhausted");
});

test("non-financial actions prove zero financial mutations", async () => {
  const context = runtime({ financialMutationCount: 1 });
  const claim = await context.service.claimExecution(scope, context.request.id, "worker-a");
  await assert.rejects(context.service.executeClaim(scope, claim), ConflictException);
  assert.equal(context.request.executionStatus, "infra_exhausted");
});

test("malformed adapter amounts are ignored when trusted proof matches frozen amount", async () => {
  for (const receiptAmount of ["not-a-number", "10.001", "10000000000000000.00"]) {
    const context = runtime({ financial: true, receiptAmount });
    const claim = await context.service.claimExecution(scope, context.request.id, "worker-a");
    assert.equal((await context.service.executeClaim(scope, claim)).executionStatus, "executed");
  }
});

test("normal execution rejects non-exact outbox count, payload, aggregate, order, version, ordinal or hash", async () => {
  for (const outboxFault of [
    "two-events",
    "payload",
    "aggregate",
    "ordering",
    "version",
    "ordinal",
    "hash"
  ] as const) {
    const context = runtime({ outboxFault });
    const claim = await context.service.claimExecution(scope, context.request.id, "worker-a");
    await assert.rejects(context.service.executeClaim(scope, claim), ConflictException);
    assert.equal(context.request.executionStatus, "infra_exhausted");
  }
});

test("database uniqueness and serialization conflicts have stable execution classification", async () => {
  const cases = [
    {
      error: {
        code: "23505",
        constraint: "uq_biz_property_execution_effect_receipt_line"
      },
      expectedStatus: "infra_exhausted"
    },
    {
      error: { code: "40001" },
      expectedStatus: "retry_wait"
    }
  ] as const;
  for (const item of cases) {
    const context = runtime({ executeError: item.error });
    const claim = await context.service.claimExecution(scope, context.request.id, "worker-a");
    await assert.rejects(context.service.executeClaim(scope, claim), ConflictException);
    assert.equal(context.request.executionStatus, item.expectedStatus);
    assert.equal(context.request.claimToken, null);
  }
});

test("incident reconcile only requeues authority-absent effects and quarantines fake complete/partial", async () => {
  for (const outcome of ["absent", "complete", "partial"] as const) {
    const context = runtime({ reconcile: outcome });
    context.request.executionStatus = "infra_exhausted";
    context.request.executionVersion = 9;
    context.request.infraExhaustedAt = now;
    context.request.lastErrorCategory = "infra";
    context.request.lastErrorCode = "approval-max-attempts-exhausted";
    const result = await context.service.reconcileExhaustedExecution(
      scope,
      {
        sub: "10000000-0000-4000-8000-000000000009",
        username: "incident-operator",
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        roles: [],
        permissions: [
          "property:approval-incidents:page",
          "property_approval:read_incident",
          "property_approval:retry"
        ]
      },
      context.request.id,
      {
        expectedExecutionVersion: 9,
        clientKey: `retry-${outcome}`,
        incidentId: `incident-${outcome}`,
        reason: "operator reviewed durable evidence"
      }
    );
    assert.equal(result.outcome, outcome === "complete" ? "partial" : outcome);
    assert.equal(
      result.request.executionStatus,
      outcome === "absent"
        ? "retry_wait"
        : "infra_exhausted"
    );
    assert.equal(context.mutations.at(-1)?.receiptStatus, "completed");
    assert.ok(context.calls.includes("reconcile"));
    assert.equal(context.calls.includes("domain-effect"), false);
    assert.equal(context.incidentAuthInputs.length, 1);
    assert.deepEqual(
      Object.keys(context.incidentAuthInputs[0] as object).sort(),
      ["actorId", "manager", "requestId", "scope"]
    );
  }
});

test("incident retry cannot bypass module assignment, permission or incident-scope authorization", async () => {
  for (const reason of [
    "module-missing",
    "module-disabled",
    "module-expired",
    "page-permission-missing",
    "read-permission-missing",
    "retry-permission-missing",
    "incident-scope-missing"
  ]) {
    const context = runtime({
      incidentAuthorizationError: new ForbiddenException({
        errorCode: "property-action-forbidden",
        details: { reason }
      })
    });
    context.request.executionStatus = "infra_exhausted";
    context.request.executionVersion = 9;
    context.request.infraExhaustedAt = now;
    context.request.lastErrorCategory = "infra";
    context.request.lastErrorCode = "approval-max-attempts-exhausted";
    await assert.rejects(
      context.service.reconcileExhaustedExecution(
        scope,
        {
          sub: "10000000-0000-4000-8000-000000000009",
          username: "incident-operator",
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          roles: [],
          permissions: ["*"]
        },
        context.request.id,
        {
          expectedExecutionVersion: 9,
          clientKey: `retry-denied-${reason}`,
          incidentId: `incident-${reason}`,
          reason: "operator attempted retry"
        }
      ),
      ForbiddenException
    );
    assert.equal(context.calls.includes("reconcile"), false);
    assert.equal(context.mutations.length, 0);
  }
});
