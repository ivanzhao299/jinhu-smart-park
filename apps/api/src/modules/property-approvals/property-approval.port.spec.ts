import assert from "node:assert/strict";
import test from "node:test";
import {
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException
} from "@nestjs/common";
import {
  PROPERTY_APPROVAL_PORT_CONTRACT_VERSION,
  type CreatePendingPropertyApprovalCommand,
  type TenantParkScope
} from "@jinhu/shared";
import { EntityManager } from "typeorm";
import {
  canonicalEffectLines,
  canonicalEffectInvariantHash,
  classifyPortDatabaseError,
  hash,
  PROPERTY_APPROVAL_DEPENDENT_UNIQUE_CONSTRAINTS,
  propertyApprovalCanonicalHash,
  propertyApprovalCanonicalText,
  PropertyApprovalService
} from "./property-approval.service";

const scope: TenantParkScope = { tenantId: "tenant-a", parkId: "park-a" };
const requesterId = "10000000-0000-4000-8000-000000000001";
const checkerId = "10000000-0000-4000-8000-000000000002";
const sourceId = "30000000-0000-4000-8000-000000000001";

function approvalErrorCode(error: unknown): unknown {
  const response = (error as { getResponse?: () => unknown }).getResponse?.();
  return response && (response as { errorCode?: unknown }).errorCode;
}

async function proveManagerUsable(
  manager: EntityManager & { statements: string[] },
  label: string
): Promise<void> {
  await manager.query(`SELECT 1 AS sentinel_${label}`);
  await manager.query(`INSERT INTO sentinel_${label}(value) VALUES (1)`);
  assert.deepEqual(manager.statements.slice(-2), [
    `SELECT 1 AS sentinel_${label}`,
    `INSERT INTO sentinel_${label}(value) VALUES (1)`
  ]);
}

function command(
  overrides: Partial<CreatePendingPropertyApprovalCommand> = {}
): CreatePendingPropertyApprovalCommand {
  return {
    contractVersion: PROPERTY_APPROVAL_PORT_CONTRACT_VERSION,
    scope,
    actionId: "property.mode-transition.request",
    sourceType: "property-unit",
    sourceId,
    sourceExpectedVersion: 1,
    requesterId,
    submitterId: requesterId,
    actorId: requesterId,
    clientKey: "approval-port-1",
    businessIntentKey: "mode-transition:1",
    canonicalPayload: { unitId: sourceId },
    payloadSchemaVersion: 1,
    amount: null,
    currency: null,
    ...overrides
  };
}

function activeManager(): EntityManager & {
  statements: string[];
  onSavepoint?: () => void;
  onRollback?: () => void;
} {
  const manager = Object.create(EntityManager.prototype) as EntityManager & {
    statements: string[];
    onSavepoint?: () => void;
    onRollback?: () => void;
  };
  manager.statements = [];
  Object.defineProperty(manager, "queryRunner", {
    value: { isTransactionActive: true },
    configurable: true
  });
  manager.query = (async (statement: string) => {
    manager.statements.push(statement);
    if (statement === "SAVEPOINT jinhu_approval_port_v2") manager.onSavepoint?.();
    if (statement === "ROLLBACK TO SAVEPOINT jinhu_approval_port_v2") manager.onRollback?.();
    return [];
  }) as EntityManager["query"];
  return manager;
}

function serviceForCreatedPath(
  terminalSeed: Record<string, unknown> | null = null,
  failAt: string | null = null
) {
  const manager = activeManager();
  const audits: Array<Record<string, unknown>> = [];
  const stages: Array<Record<string, unknown>> = [];
  const exclusions: Array<Record<string, unknown>> = [];
  const manifests: Array<Record<string, unknown>> = [];
  const mutations: Array<Record<string, unknown>> = [];
  const trace: string[] = [];
  let persisted: Record<string, unknown> | null = null;
  let activeCopies = 1;
  let terminalOverride = terminalSeed;
  let snapshot = {
    audits: 0, stages: 0, exclusions: 0, manifests: 0, mutations: 0,
    persisted: null as Record<string, unknown> | null
  };
  manager.onSavepoint = () => {
    snapshot = {
      audits: audits.length, stages: stages.length, exclusions: exclusions.length,
      manifests: manifests.length, mutations: mutations.length, persisted
    };
  };
  manager.onRollback = () => {
    audits.length = snapshot.audits;
    stages.length = snapshot.stages;
    exclusions.length = snapshot.exclusions;
    manifests.length = snapshot.manifests;
    mutations.length = snapshot.mutations;
    persisted = snapshot.persisted;
  };
  const maybeFail = (boundary: string) => {
    if (boundary === "request" && failAt?.startsWith("db23505:")) {
      throw { code: "23505", constraint: failAt.slice("db23505:".length) };
    }
    if (boundary === "request" && failAt === "db-unknown") {
      throw { code: "XX999", message: "unknown database failure" };
    }
    if (failAt === boundary) throw new Error(`fault-after:${boundary}`);
  };
  const now = new Date("2026-08-02T00:00:00.000Z");
  const repository = {
    transaction: async () => { throw new Error("nested transaction forbidden"); },
    dbNow: async (received: EntityManager) => {
      assert.equal(received, manager);
      return now;
    },
    findByClientKey: async (
      _manager: EntityManager,
      _scope: TenantParkScope,
      _requesterId: string,
      _actionId: string,
      clientKey: string
    ) => persisted && persisted.clientIdempotencyKey === clientKey ? persisted : null,
    findByBusinessIntent: async (
      _manager: EntityManager,
      _scope: TenantParkScope,
      _actionId: string,
      businessIntentKey: string
    ) => persisted && persisted.businessIntentKey === businessIntentKey ? persisted : null,
    findActiveBySource: async () => {
      if (!persisted) return [];
      const decision = persisted.decisionStatus;
      const execution = persisted.executionStatus;
      return ["draft", "submitted", "pending_approval"].includes(String(decision))
        || (decision === "approved" && [
          "not_started", "executing", "retry_wait", "infra_exhausted"
        ].includes(String(execution))) ? Array.from({ length: activeCopies }, () => persisted!) : [];
    },
    listBySource: async () => persisted ? [persisted] : [],
    findLatestTerminalBySource: async () => {
      trace.push("find-latest-terminal");
      if (terminalOverride) return terminalOverride;
      if (!persisted) return null;
      return ["rejected", "withdrawn", "expired"].includes(String(persisted.decisionStatus))
        || (persisted.decisionStatus === "approved" && [
          "executed", "execution_failed"
        ].includes(String(persisted.executionStatus))) ? persisted : null;
    },
    requestRepository: () => ({
      create: (value: Record<string, unknown>) => value,
      save: async (value: Record<string, unknown>) => value
    }),
    insertRequestOnConflict: async (received: EntityManager, value: Record<string, unknown>) => {
      trace.push("insert-request");
      assert.equal(received, manager);
      if (persisted) return false;
      persisted = value;
      maybeFail("request");
      return true;
    },
    stageRepository: () => ({
      create: (value: Record<string, unknown>) => value,
      save: async (values: Array<Record<string, unknown>>) => {
        stages.push(...values); maybeFail("stages");
      }
    }),
    exclusionRepository: () => ({
      create: (value: Record<string, unknown>) => value,
      save: async (values: Array<Record<string, unknown>>) => {
        exclusions.push(...values); maybeFail("exclusions");
      }
    }),
    manifestRepository: () => ({
      create: (value: Record<string, unknown>) => value,
      save: async (values: Array<Record<string, unknown>>) => {
        manifests.push(...values); maybeFail("manifests");
      }
    }),
    auditRepository: () => ({
      insert: async (value: Record<string, unknown>) => {
        audits.push(value);
        maybeFail(`audit:${String(value.actionId)}`);
      }
    }),
    lockRequest: async () => persisted,
    mutationRepository: () => ({
      create: (value: Record<string, unknown>) => value,
      save: async (value: Record<string, unknown>) => {
        if (!mutations.includes(value)) mutations.push(value);
        if (value.receiptStatus === "completed") maybeFail("receipt-complete");
        return value;
      }
    }),
    insertMutationOnConflict: async (_received: EntityManager, value: Record<string, unknown>) => {
      mutations.push(value);
      maybeFail("receipt-start");
      return true;
    },
    findMutation: async () => null,
    findSubmitMutations: async () => mutations,
    casDecisionRequest: async () => { maybeFail("request-cas"); return true; }
  };
  const eligibility = {
    requiredPermissions: ["property_approval:decide"],
    eligibleActorIds: [checkerId],
    auditorActorIds: [checkerId],
    incidentActorIds: [checkerId],
    sourceScopes: [{ sourceType: "property-unit", sourceId }]
  };
  const effectBase = {
    effectKind: "property.mode.transition",
    effectOrdinal: 0,
    effectLineKey: `unit:${sourceId}`,
    owningTable: "biz_property_mode_transition_log",
    owningUniqueName: "uq_property_mode_transition_approval_line",
    expectedCardinality: 2,
    lineAmount: null,
    currency: null
  };
  const service = new PropertyApprovalService(
    repository as never,
    {
      resolve: async (input) => ({
        policyId: "40000000-0000-4000-8000-000000000001",
        policyVersion: 1,
        policyHash: "a".repeat(64),
        stages: [{
          stageCode: "gate",
          stageOrdinal: 1,
          eligibilityPolicySnapshot: eligibility,
          eligibilityPolicyVersion: 1,
          eligibilityPolicyHash: hash(eligibility),
          requiredCount: 1
        }],
        exclusions: [{
          actorId: "10000000-0000-4000-8000-000000000003",
          reasonCode: "source_creator",
          sourceType: "property-unit",
          sourceId
        }],
        effects: [{
          ...effectBase,
          invariantHash: canonicalEffectInvariantHash(effectBase, input.canonicalPayload)
        }]
      })
    },
    { authorizeDecision: async () => ({ permissionSnapshot: {} }), canDecide: async () => false },
    { get: () => null },
    { append: async () => undefined },
    { predicate: async () => ({} as never), authorizeSource: async () => undefined },
    { authorizeRetry: async () => ({ scopeAssignmentId: "scope" }) },
    {
      inspect: async () => ({ effective: true, mode: "enforce", version: 1 }),
      approvalMode: async () => "enforce",
      requireApprovalEnforce: async () => undefined
    },
    { get: () => null }
  );
  return {
    service, manager, audits, stages, exclusions, manifests, mutations,
    persisted: () => persisted,
    setActiveCopies: (value: number) => { activeCopies = value; },
    setTerminalOverride: (value: Record<string, unknown> | null) => {
      terminalOverride = value;
    },
    trace
  };
}

test("canonical serializer preserves unsigned UTF-8 ordering and signed hashes", () => {
  const mixed = Object.assign(Object.create(null), {
    "2": "two", "10": "ten", "é": "accent", "普通": "zh", normal: "plain"
  });
  assert.equal(
    propertyApprovalCanonicalText(mixed),
    "{\"10\":\"ten\",\"2\":\"two\",\"normal\":\"plain\",\"é\":\"accent\",\"普通\":\"zh\"}"
  );
  assert.equal(
    propertyApprovalCanonicalHash(mixed),
    "81750994c44057efbb4e4ede693ac676a9adbee08324a0e171db48707aa0ca2c"
  );
  assert.equal(
    propertyApprovalCanonicalHash({
      expectedDecisionVersion: 1,
      requestId: "00000000-0000-4000-8000-000000000001"
    }),
    "37331ea1ca0efb36c78053d53eeab1400303b83c96d46d66326df728cbc573c9"
  );
  assert.equal(
    propertyApprovalCanonicalHash({
      executionStatus: "not_started",
      executionVersion: 1,
      outcome: "submitted",
      requestId: "00000000-0000-4000-8000-000000000001"
    }),
    "9810b46fb58878540c89ce90df0435613dc9ac52eba950a17a2b83d8236b45f0"
  );
  assert.equal(
    propertyApprovalCanonicalHash({ a: [1, "x", true, null], "é": "é" }),
    "d5f0de89c59ea42aedc78d14fa2fad3686d0dabcb4a5de030977327ac7287ba9"
  );
  assert.equal(
    propertyApprovalCanonicalHash({ "é": "é" }),
    "b98131ef426c7a9368e586407f639060d85b2b4582d1fe96851950bf6de90ee2"
  );
  assert.notEqual(propertyApprovalCanonicalHash({ "é": "é" }), propertyApprovalCanonicalHash({ "é": "é" }));
  assert.equal(
    propertyApprovalCanonicalHash({ "line\nkey": "tab\tvalue" }),
    "78ecd4824f6ac29e98ff4e9f86a0f1760bc3380cc14913b4be31ae94e53cf1fe"
  );
});

test("command port rejects missing, fake and inactive caller transactions", async () => {
  const { service } = serviceForCreatedPath();
  const inactive = activeManager();
  Object.defineProperty(inactive, "queryRunner", {
    value: { isTransactionActive: false },
    configurable: true
  });
  for (const transactionContext of [null, {}, inactive]) {
    await assert.rejects(
      service.createPendingRequest({ transactionContext }, command()),
      ServiceUnavailableException
    );
  }
});

test("command port creates and submits atomically on the supplied manager", async () => {
  const { service, manager, audits, stages, exclusions, manifests, mutations } =
    serviceForCreatedPath();
  const result = await service.createPendingRequest(
    { transactionContext: manager },
    command()
  );
  assert.equal(result.disposition, "created");
  assert.equal(result.request.decisionStatus, "pending_approval");
  assert.equal(result.request.executionStatus, "not_started");
  assert.deepEqual(manager.statements, [
    "SAVEPOINT jinhu_approval_port_v2",
    "RELEASE SAVEPOINT jinhu_approval_port_v2"
  ]);
  assert.equal(stages.length, 1);
  assert.equal(exclusions.length, 3);
  assert.equal(manifests.length, 1);
  assert.deepEqual(
    audits.map((audit) => audit.actionId),
    ["property.approval.draft", "property.approval.submit", "property.approval.activate"]
  );
  assert.equal(mutations.length, 1);
  assert.equal(mutations[0]!.receiptContractVersion, "legacy-v1");
  assert.equal(mutations[0]!.actorId, requesterId);
  assert.equal(mutations[0]!.receiptStatus, "completed");
  assert.equal(mutations[0]!.resultVersion, null);

  assert.equal((await service.findById(
    { transactionContext: manager },
    { scope, requestId: result.request.requestId }
  ))?.requestId, result.request.requestId);
  assert.equal((await service.findActiveBySource(
    { transactionContext: manager },
    {
      scope,
      actionId: command().actionId,
      sourceType: command().sourceType,
      sourceId,
      sourceExpectedVersion: 1
    }
  ))?.requestId, result.request.requestId);
  assert.deepEqual((await service.listBySource(
    { transactionContext: manager },
    { scope, actionId: command().actionId, sourceType: command().sourceType, sourceId }
  )).map((item) => item.requestId), [result.request.requestId]);

  const replay = await service.createPendingRequest(
    { transactionContext: manager },
    command()
  );
  assert.equal(replay.disposition, "replayed-client-key");
  assert.equal(audits.length, 3);
  assert.equal(mutations.length, 1);
  assert.deepEqual(manager.statements.slice(-2), [
    "SAVEPOINT jinhu_approval_port_v2",
    "RELEASE SAVEPOINT jinhu_approval_port_v2"
  ]);

  mutations[0]!.resultHash = "0".repeat(64);
  await assert.rejects(
    service.createPendingRequest({ transactionContext: manager }, command()),
    ConflictException
  );
  assert.deepEqual(manager.statements.slice(-3), [
    "SAVEPOINT jinhu_approval_port_v2",
    "ROLLBACK TO SAVEPOINT jinhu_approval_port_v2",
    "RELEASE SAVEPOINT jinhu_approval_port_v2"
  ]);
});

test("every create/submit write boundary rolls back to zero partial state", async () => {
  const boundaries = [
    "request", "stages", "exclusions", "manifests",
    "audit:property.approval.draft", "receipt-start", "request-cas",
    "audit:property.approval.submit", "audit:property.approval.activate", "receipt-complete"
  ];
  for (const boundary of boundaries) {
    const fixture = serviceForCreatedPath(null, boundary);
    await assert.rejects(fixture.service.createPendingRequest(
      { transactionContext: fixture.manager }, command()
    ));
    assert.equal(fixture.persisted(), null, boundary);
    assert.deepEqual([
      fixture.stages.length, fixture.exclusions.length, fixture.manifests.length,
      fixture.audits.length, fixture.mutations.length
    ], [0, 0, 0, 0, 0], boundary);
    assert.equal(
      fixture.manager.statements.at(-2),
      "ROLLBACK TO SAVEPOINT jinhu_approval_port_v2",
      boundary
    );
  }
});

test("command validation rejects actor drift, open JSON and non-fixed money", async () => {
  const { service, manager } = serviceForCreatedPath();
  await assert.rejects(
    service.createPendingRequest(
      { transactionContext: manager },
      command({ actorId: checkerId })
    ),
    ForbiddenException
  );
  for (const canonicalPayload of [
    { value: undefined },
    { value: new Date() },
    { value: -0 },
    { value: "\ud800" }
  ]) {
    await assert.rejects(
      service.createPendingRequest(
        { transactionContext: manager },
        command({ canonicalPayload: canonicalPayload as never })
      )
    );
  }
  await assert.rejects(
    service.createPendingRequest(
      { transactionContext: manager },
      command({
        actionId: "homestay.finance.refund-or-waive.request",
        amount: "1.0",
        currency: "CNY"
      })
    )
  );
});

test("financial effect lines require canonical positive fixed cents without Number conversion", () => {
  const payload = (amount: string) => ({
    lines: [{
      entryType: "refund",
      sourceLedgerEntryId: "50000000-0000-4000-8000-000000000001",
      amount,
      currency: "CNY"
    }]
  });
  assert.equal(
    canonicalEffectLines("homestay.finance.refund-or-waive.request", payload("0.01"))[0]?.lineAmount,
    "0.01"
  );
  assert.equal(
    canonicalEffectLines(
      "homestay.finance.refund-or-waive.request",
      payload("99999999999999999999.99")
    )[0]?.lineAmount,
    "99999999999999999999.99"
  );
  for (const amount of [
    "1", "1.0", "01.00", "+1.00", "1e0", "1.000", "0.00", "-1.00", " 1.00"
  ]) {
    assert.throws(() => canonicalEffectLines(
      "homestay.finance.refund-or-waive.request",
      payload(amount)
    ), `must reject ${amount}`);
  }
  const financialSource = canonicalEffectLines.toString();
  assert.doesNotMatch(financialSource, /\bNumber\s*\(/u);
  assert.match(financialSource, /decimalCents/u);
});

test("receipt clientKey must exactly equal the authoritative request identity", async () => {
  const { service, manager, mutations } = serviceForCreatedPath();
  await service.createPendingRequest({ transactionContext: manager }, command());
  mutations[0]!.clientKey = "different-authoritative-key";
  await assert.rejects(
    service.createPendingRequest({ transactionContext: manager }, command()),
    ConflictException
  );
  assert.deepEqual(manager.statements.slice(-3), [
    "SAVEPOINT jinhu_approval_port_v2",
    "ROLLBACK TO SAVEPOINT jinhu_approval_port_v2",
    "RELEASE SAVEPOINT jinhu_approval_port_v2"
  ]);
});

test("receipt replay independently rejects every frozen field corruption", async () => {
  const corruptions: Array<(receipt: Record<string, unknown>) => void> = [
    (receipt) => { receipt.requestHash = "0".repeat(64); },
    (receipt) => { receipt.resultHash = "0".repeat(64); },
    (receipt) => { receipt.resultRef = "property-approval:wrong:submitted"; },
    (receipt) => { receipt.actorId = checkerId; },
    (receipt) => { receipt.receiptContractVersion = "v2"; },
    (receipt) => { receipt.identityKind = "property-task"; },
    (receipt) => { receipt.businessOccurrenceKey = "unexpected"; },
    (receipt) => { receipt.taskKey = "0".repeat(64); },
    (receipt) => { receipt.identitySourceType = "property-unit"; },
    (receipt) => { receipt.resultVersion = 1; },
    (receipt) => { receipt.completedAt = null; },
    (receipt) => { receipt.receiptStatus = "started"; }
  ];
  for (const corrupt of corruptions) {
    const fixture = serviceForCreatedPath();
    await fixture.service.createPendingRequest(
      { transactionContext: fixture.manager }, command()
    );
    corrupt(fixture.mutations[0]!);
    await assert.rejects(fixture.service.createPendingRequest(
      { transactionContext: fixture.manager }, command()
    ));
    assert.equal(
      fixture.manager.statements.at(-2),
      "ROLLBACK TO SAVEPOINT jinhu_approval_port_v2"
    );
  }
});

test("business intent replay ignores the new client key but rejects request drift", async () => {
  const fixture = serviceForCreatedPath();
  await fixture.service.createPendingRequest(
    { transactionContext: fixture.manager }, command()
  );
  const replay = await fixture.service.createPendingRequest(
    { transactionContext: fixture.manager }, command({ clientKey: "approval-port-2" })
  );
  assert.equal(replay.disposition, "replayed-business-intent");
  await assert.rejects(fixture.service.createPendingRequest(
    { transactionContext: fixture.manager },
    command({ clientKey: "approval-port-3", canonicalPayload: { unitId: sourceId, drift: true } })
  ), ConflictException);
  await proveManagerUsable(fixture.manager, "business_intent_mismatch");
});

test("client-key mismatch recovers savepoint before same-manager sentinel writes", async () => {
  const fixture = serviceForCreatedPath();
  await fixture.service.createPendingRequest(
    { transactionContext: fixture.manager }, command()
  );
  await assert.rejects(fixture.service.createPendingRequest(
    { transactionContext: fixture.manager }, command({
      businessIntentKey: "client-key-mismatch-intent"
    })
  ), (error) => approvalErrorCode(error) === "idempotency-key-conflict");
  await proveManagerUsable(fixture.manager, "client_key_mismatch");
});

async function legacyDraftFixture() {
  const fixture = serviceForCreatedPath();
  await fixture.service.createPendingRequest(
    { transactionContext: fixture.manager }, command()
  );
  Object.assign(fixture.persisted()!, {
    decisionStatus: "draft",
    executionStatus: "not_started",
    decisionVersion: 1,
    executionVersion: 1,
    submittedAt: null,
    decidedAt: null,
    executedAt: null
  });
  fixture.mutations.length = 0;
  fixture.trace.length = 0;
  return fixture;
}

test("legacy draft alternate-key completion preserves authoritative receipt identity", async () => {
  const fixture = await legacyDraftFixture();
  const originalKey = command().clientKey;
  const alternateKey = "legacy-alternate-1";
  const completed = await fixture.service.createPendingRequest(
    { transactionContext: fixture.manager }, command({ clientKey: alternateKey })
  );
  assert.equal(completed.disposition, "replayed-business-intent");
  assert.equal(fixture.persisted()!.clientIdempotencyKey, originalKey);
  assert.equal(fixture.mutations.length, 1);
  assert.equal(fixture.mutations[0]!.clientKey, originalKey);
  assert.equal(fixture.mutations[0]!.requestHash, propertyApprovalCanonicalHash({
    expectedDecisionVersion: 1,
    requestId: String(fixture.persisted()!.id).toLowerCase()
  }));
  assert.equal(fixture.mutations[0]!.resultHash, propertyApprovalCanonicalHash({
    executionStatus: "not_started",
    executionVersion: 1,
    outcome: "submitted",
    requestId: String(fixture.persisted()!.id).toLowerCase()
  }));
  assert.doesNotMatch(fixture.trace.join(","), /insert-request/u);
  await proveManagerUsable(fixture.manager, "legacy_first_alternate");

  const third = await fixture.service.createPendingRequest(
    { transactionContext: fixture.manager }, command({ clientKey: "legacy-alternate-2" })
  );
  assert.equal(third.disposition, "replayed-business-intent");
  assert.equal(fixture.mutations.length, 1);
  assert.doesNotMatch(fixture.trace.join(","), /insert-request/u);
  await proveManagerUsable(fixture.manager, "legacy_third_key");

  const original = await fixture.service.createPendingRequest(
    { transactionContext: fixture.manager }, command()
  );
  assert.equal(original.disposition, "replayed-client-key");
  assert.equal(fixture.mutations.length, 1);
  await proveManagerUsable(fixture.manager, "legacy_original_key");
});

test("legacy draft authoritative-key conflict matrix stays deterministic", async () => {
  const fixture = await legacyDraftFixture();
  await fixture.service.createPendingRequest(
    { transactionContext: fixture.manager }, command({ clientKey: "legacy-alternate-1" })
  );
  await assert.rejects(fixture.service.createPendingRequest(
    { transactionContext: fixture.manager }, command({ businessIntentKey: "changed-intent" })
  ), (error) => approvalErrorCode(error) === "idempotency-key-conflict");
  await proveManagerUsable(fixture.manager, "legacy_original_changed_intent");
  await assert.rejects(fixture.service.createPendingRequest(
    { transactionContext: fixture.manager }, command({
      clientKey: "unreserved-alternate",
      businessIntentKey: "another-intent"
    })
  ), (error) => approvalErrorCode(error) === "property-version-conflict");
  await proveManagerUsable(fixture.manager, "legacy_unreserved_active");
});

test("legacy draft receipt dual proof rejects either hash and either alternate receipt key", async () => {
  const corruptions: Array<(receipt: Record<string, unknown>) => void> = [
    (receipt) => { receipt.requestHash = "0".repeat(64); },
    (receipt) => { receipt.resultHash = "0".repeat(64); },
    (receipt) => { receipt.clientKey = "legacy-alternate-1"; },
    (receipt) => { receipt.clientKey = "legacy-alternate-2"; }
  ];
  for (const [ordinal, corrupt] of corruptions.entries()) {
    const fixture = await legacyDraftFixture();
    await fixture.service.createPendingRequest(
      { transactionContext: fixture.manager }, command({ clientKey: "legacy-alternate-1" })
    );
    corrupt(fixture.mutations[0]!);
    await assert.rejects(fixture.service.createPendingRequest(
      { transactionContext: fixture.manager }, command({ clientKey: "legacy-alternate-2" })
    ), (error) => approvalErrorCode(error) === "idempotency-key-conflict");
    await proveManagerUsable(fixture.manager, `legacy_receipt_corrupt_${ordinal}`);
  }
});

test("legacy non-strict submit keeps its incoming HTTP mutation key semantics", async () => {
  const fixture = await legacyDraftFixture();
  await fixture.service.submitWithManager(
    fixture.manager,
    scope,
    {
      sub: requesterId,
      username: "legacy-http",
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      roles: [],
      permissions: []
    },
    String(fixture.persisted()!.id),
    { clientKey: "legacy-http-submit-key", expectedDecisionVersion: 1 }
  );
  assert.equal(fixture.mutations.length, 1);
  assert.equal(fixture.mutations[0]!.clientKey, "legacy-http-submit-key");
});

test("conflict priority is client key, business intent, active source, terminal, then receipt", async () => {
  const fixture = serviceForCreatedPath();
  await fixture.service.createPendingRequest(
    { transactionContext: fixture.manager }, command()
  );
  fixture.setTerminalOverride({ sourceExpectedVersion: 99 });
  assert.equal((await fixture.service.createPendingRequest(
    { transactionContext: fixture.manager }, command()
  )).disposition, "replayed-client-key");
  await proveManagerUsable(fixture.manager, "priority_client");

  assert.equal((await fixture.service.createPendingRequest(
    { transactionContext: fixture.manager }, command({ clientKey: "priority-business" })
  )).disposition, "replayed-business-intent");
  await proveManagerUsable(fixture.manager, "priority_business");

  await assert.rejects(fixture.service.createPendingRequest(
    { transactionContext: fixture.manager }, command({
      clientKey: "priority-active", businessIntentKey: "priority-active"
    })
  ), (error) => approvalErrorCode(error) === "property-version-conflict");
  await proveManagerUsable(fixture.manager, "priority_active");

  Object.assign(fixture.persisted()!, {
    decisionStatus: "approved", executionStatus: "executed"
  });
  await assert.rejects(fixture.service.createPendingRequest(
    { transactionContext: fixture.manager }, command({
      clientKey: "priority-terminal", businessIntentKey: "priority-terminal"
    })
  ), (error) => approvalErrorCode(error) === "approval-source-changed");
  await proveManagerUsable(fixture.manager, "priority_terminal");

  fixture.setTerminalOverride(null);
  fixture.mutations[0]!.resultHash = "0".repeat(64);
  await assert.rejects(fixture.service.createPendingRequest(
    { transactionContext: fixture.manager }, command()
  ), (error) => approvalErrorCode(error) === "idempotency-key-conflict");
  await proveManagerUsable(fixture.manager, "priority_receipt");
});

test("database classifier covers every dependent constraint and fails unknowns closed", () => {
  for (const constraint of PROPERTY_APPROVAL_DEPENDENT_UNIQUE_CONSTRAINTS) {
    assert.equal(
      approvalErrorCode(classifyPortDatabaseError({ code: "23505", constraint })),
      "approval-reconcile-partial",
      constraint
    );
    assert.equal(
      approvalErrorCode(classifyPortDatabaseError({
        driverError: { code: "23505", constraint }
      })),
      "approval-reconcile-partial",
      `driver:${constraint}`
    );
  }
  assert.equal(
    approvalErrorCode(classifyPortDatabaseError({
      code: "23505", constraint: "uq_unknown_approval_stage_like_name"
    })),
    "property-runtime-unavailable"
  );
  assert.equal(classifyPortDatabaseError({ code: "XX999" }), null);
  assert.equal(classifyPortDatabaseError(new Error("unknown")), null);
});

test("known and unknown database failures recover savepoint and preserve manager usability", async () => {
  for (const [ordinal, constraint] of PROPERTY_APPROVAL_DEPENDENT_UNIQUE_CONSTRAINTS.entries()) {
    const fixture = serviceForCreatedPath(null, `db23505:${constraint}`);
    await assert.rejects(fixture.service.createPendingRequest(
      { transactionContext: fixture.manager }, command({
        clientKey: `dependent-${ordinal}`, businessIntentKey: `dependent-${ordinal}`
      })
    ), (error) => approvalErrorCode(error) === "approval-reconcile-partial");
    assert.deepEqual(fixture.manager.statements.slice(-3), [
      "SAVEPOINT jinhu_approval_port_v2",
      "ROLLBACK TO SAVEPOINT jinhu_approval_port_v2",
      "RELEASE SAVEPOINT jinhu_approval_port_v2"
    ]);
    await proveManagerUsable(fixture.manager, `dependent_${ordinal}`);
  }
  for (const [label, fault] of [
    ["unknown_constraint", "db23505:uq_unknown_constraint"],
    ["unknown_database", "db-unknown"]
  ] as const) {
    const fixture = serviceForCreatedPath(null, fault);
    await assert.rejects(fixture.service.createPendingRequest(
      { transactionContext: fixture.manager }, command({
        clientKey: label, businessIntentKey: label
      })
    ), (error) => approvalErrorCode(error) === "property-runtime-unavailable");
    assert.deepEqual(fixture.manager.statements.slice(-3), [
      "SAVEPOINT jinhu_approval_port_v2",
      "ROLLBACK TO SAVEPOINT jinhu_approval_port_v2",
      "RELEASE SAVEPOINT jinhu_approval_port_v2"
    ]);
    await proveManagerUsable(fixture.manager, label);
  }
});

test("active-source conflict and terminal source-version monotonicity are deterministic", async () => {
  const active = serviceForCreatedPath();
  await active.service.createPendingRequest({ transactionContext: active.manager }, command());
  await assert.rejects(active.service.createPendingRequest(
    { transactionContext: active.manager },
    command({ clientKey: "active-2", businessIntentKey: "mode-transition:other" })
  ), ConflictException);

  Object.assign(active.persisted()!, {
    decisionStatus: "approved", executionStatus: "executed"
  });
  await assert.rejects(active.service.createPendingRequest(
    { transactionContext: active.manager },
    command({ clientKey: "terminal-2", businessIntentKey: "mode-transition:new" })
  ), ConflictException);
});

test("active duplicate corruption fails closed for projections and conflict classification", async () => {
  const fixture = serviceForCreatedPath();
  await fixture.service.createPendingRequest(
    { transactionContext: fixture.manager }, command()
  );
  fixture.setActiveCopies(2);
  await assert.rejects(fixture.service.findActiveBySource(
    { transactionContext: fixture.manager },
    {
      scope, actionId: command().actionId, sourceType: command().sourceType,
      sourceId, sourceExpectedVersion: 1
    }
  ));
  await assert.rejects(fixture.service.createPendingRequest(
    { transactionContext: fixture.manager },
    command({ clientKey: "duplicate-2", businessIntentKey: "duplicate-2" })
  ));
});

test("terminal source-version monotonicity runs before insert and allows only a higher version", async () => {
  for (const sourceExpectedVersion of [1, 2]) {
    const fixture = serviceForCreatedPath({ sourceExpectedVersion: 2 });
    await assert.rejects(fixture.service.createPendingRequest(
      { transactionContext: fixture.manager },
      command({ sourceExpectedVersion })
    ));
    assert.deepEqual(fixture.trace, ["find-latest-terminal"]);
  }
  const higher = serviceForCreatedPath({ sourceExpectedVersion: 2 });
  assert.equal((await higher.service.createPendingRequest(
    { transactionContext: higher.manager }, command({ sourceExpectedVersion: 3 })
  )).disposition, "created");
  assert.deepEqual(higher.trace.slice(0, 2), ["find-latest-terminal", "insert-request"]);
});

test("rejected and withdrawn terminals allow a separately keyed same-version retry", async () => {
  for (const decisionStatus of ["rejected", "withdrawn"] as const) {
    const fixture = serviceForCreatedPath({
      sourceExpectedVersion: 1,
      decisionStatus,
      executionStatus: "not_required"
    });
    const retryCommand = command({
      clientKey: `approval-retry-${decisionStatus}`,
      canonicalPayload: { unitId: sourceId, corrected: true }
    });
    const created = await fixture.service.createPendingRequest(
      { transactionContext: fixture.manager }, retryCommand
    );
    assert.equal(created.disposition, "created");
    assert.match(created.request.businessIntentKey, /^approval-retry:[0-9a-f]{64}$/);

    const replay = await fixture.service.createPendingRequest(
      { transactionContext: fixture.manager }, retryCommand
    );
    assert.equal(replay.disposition, "replayed-client-key");
    assert.equal(replay.request.requestId, created.request.requestId);
  }
});

test("port version and byte-length boundaries are exact", async () => {
  for (const value of [1, 2_147_483_647]) {
    const { service, manager } = serviceForCreatedPath();
    const result = await service.createPendingRequest(
      { transactionContext: manager },
      command({ sourceExpectedVersion: value, payloadSchemaVersion: value })
    );
    assert.equal(result.disposition, "created");
  }
  for (const value of [0, -1, 1.5, 2_147_483_648, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity]) {
    const { service, manager } = serviceForCreatedPath();
    await assert.rejects(service.createPendingRequest(
      { transactionContext: manager },
      command({ sourceExpectedVersion: value })
    ));
  }
  const accepted = [
    { sourceType: "x".repeat(64) },
    { sourceType: "界".repeat(21) + "x" },
    { businessIntentKey: "i".repeat(128) },
    { clientKey: "k".repeat(128) }
  ];
  for (const override of accepted) {
    const { service, manager } = serviceForCreatedPath();
    assert.equal((await service.createPendingRequest(
      { transactionContext: manager }, command(override)
    )).disposition, "created");
  }
  for (const override of [
    { sourceType: "x".repeat(65) },
    { sourceType: "界".repeat(22) },
    { businessIntentKey: "i".repeat(129) },
    { businessIntentKey: "界".repeat(43) },
    { clientKey: "k".repeat(129) }
  ]) {
    const { service, manager } = serviceForCreatedPath();
    await assert.rejects(service.createPendingRequest(
      { transactionContext: manager }, command(override)
    ));
  }
});

test("closed JSON rejects every non-data, non-scalar and cyclic category", () => {
  const sparse: unknown[] = [];
  sparse.length = 1;
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  const accessor = {};
  Object.defineProperty(accessor, "value", { enumerable: true, get: () => 1 });
  const hidden = {};
  Object.defineProperty(hidden, "value", { enumerable: false, value: 1 });
  class Instance { value = 1; }
  for (const value of [
    undefined, () => undefined, Symbol("x"), 1n, NaN, Infinity, -Infinity, 1.5, -0,
    sparse, cyclic, new Date(), Buffer.from("x"), new Uint8Array([1]), new Map(),
    new Set(), /x/u, new Instance(), accessor, hidden, { value: "\ud800" }
  ]) {
    assert.throws(() => propertyApprovalCanonicalText(value as never));
  }
  const symbolObject = { value: 1 } as Record<string | symbol, unknown>;
  symbolObject[Symbol("hidden")] = true;
  assert.throws(() => propertyApprovalCanonicalText(symbolObject as never));
  const nullPrototype = Object.assign(Object.create(null), { nested: [[1, true, null]] });
  assert.equal(propertyApprovalCanonicalText(nullPrototype), "{\"nested\":[[1,true,null]]}");
});

test("replay accepts all nine frozen legal terminal combinations", async () => {
  const legal = [
    ["approved", "not_started"],
    ["approved", "executing"],
    ["approved", "retry_wait"],
    ["approved", "executed"],
    ["approved", "execution_failed"],
    ["approved", "infra_exhausted"],
    ["rejected", "not_required"],
    ["withdrawn", "not_required"],
    ["expired", "not_required"]
  ] as const;
  for (const [decisionStatus, executionStatus] of legal) {
    const fixture = serviceForCreatedPath();
    await fixture.service.createPendingRequest(
      { transactionContext: fixture.manager }, command()
    );
    Object.assign(fixture.persisted()!, { decisionStatus, executionStatus });
    const replay = await fixture.service.createPendingRequest(
      { transactionContext: fixture.manager }, command()
    );
    assert.equal(replay.disposition, "replayed-client-key");
    assert.equal(replay.request.decisionStatus, decisionStatus);
    assert.equal(replay.request.executionStatus, executionStatus);
  }
});

test("replay fails closed for every illegal terminal decision/execution combination", async () => {
  const decisions = ["approved", "rejected", "withdrawn", "expired"] as const;
  const executions = [
    "not_started", "executing", "retry_wait", "executed", "execution_failed",
    "infra_exhausted", "not_required"
  ] as const;
  const legal = new Set([
    "approved:not_started", "approved:executing", "approved:retry_wait",
    "approved:executed", "approved:execution_failed", "approved:infra_exhausted",
    "rejected:not_required", "withdrawn:not_required", "expired:not_required"
  ]);
  for (const decisionStatus of decisions) {
    for (const executionStatus of executions) {
      if (legal.has(`${decisionStatus}:${executionStatus}`)) continue;
      const fixture = serviceForCreatedPath();
      await fixture.service.createPendingRequest(
        { transactionContext: fixture.manager }, command()
      );
      Object.assign(fixture.persisted()!, { decisionStatus, executionStatus });
      await assert.rejects(fixture.service.createPendingRequest(
        { transactionContext: fixture.manager }, command()
      ));
    }
  }
});
