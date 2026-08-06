import assert from "node:assert/strict";
import test from "node:test";
import type { TenantParkScope } from "@jinhu/shared";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException
} from "@nestjs/common";
import {
  ApprovalExecutionError,
  canonicalEffectLines,
  canonicalEffectInvariantHash,
  freezeActorExclusions,
  hash,
  normalizeObject,
  PropertyApprovalService,
  validateEffectReceipts,
  validateFrozenPolicy
} from "./property-approval.service";
import type { FrozenApprovalEffect } from "./property-approval.ports";

const scope: TenantParkScope = { tenantId: "tenant-a", parkId: "park-a" };
const enforceControls = {
  inspect: async () => ({ effective: true, mode: "enforce" as const, version: 1 }),
  approvalMode: async () => "enforce" as const,
  requireApprovalEnforce: async () => undefined
};
const noProofVerifiers = { get: () => null };

function frozenEffect<T extends Omit<FrozenApprovalEffect, "invariantHash">>(
  effect: T,
  canonicalPayload: Record<string, unknown> = {}
): T & { invariantHash: string } {
  return { ...effect, invariantHash: canonicalEffectInvariantHash(effect, canonicalPayload) };
}
const actor = {
  sub: "10000000-0000-4000-8000-000000000001",
  username: "requester",
  tenantId: scope.tenantId,
  parkId: scope.parkId,
  roles: [],
  permissions: ["property_approval:read", "property_approval:withdraw"]
};

function request(overrides: Record<string, unknown> = {}) {
  return {
    id: "20000000-0000-4000-8000-000000000001",
    ...scope,
    actionId: "property.mode-transition.request",
    sourceType: "property-unit",
    sourceId: "30000000-0000-4000-8000-000000000001",
    sourceExpectedVersion: 1,
    requesterId: actor.sub,
    submitterId: actor.sub,
    clientIdempotencyKey: "draft-1",
    businessIntentKey: "intent-1",
    canonicalPayload: { toMode: "homestay" },
    payloadSchemaVersion: 1,
    payloadHash: "a".repeat(64),
    amount: null,
    currency: null,
    policyId: "40000000-0000-4000-8000-000000000001",
    policyVersion: 1,
    policyHash: "b".repeat(64),
    decisionStatus: "pending_approval",
    executionStatus: "not_started",
    decisionVersion: 2,
    executionVersion: 1,
    executionIdempotencyKey: "execution-1",
    claimEpoch: "0",
    claimToken: null,
    workerId: null,
    leaseExpiresAt: null,
    heartbeatAt: null,
    attemptCount: 0,
    nextRetryAt: null,
    reconcileRequired: false,
    lastErrorCategory: null,
    lastErrorCode: null,
    lastErrorRedactedMessage: null,
    infraExhaustedAt: null,
    submittedAt: new Date(),
    decidedAt: null,
    executedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

function serviceFor(options: {
  locked?: ReturnType<typeof request>;
  decisionCount?: number;
  mutation?: Record<string, unknown> | null;
  sourceDenied?: boolean;
} = {}) {
  const locked = options.locked ?? request();
  const audits: unknown[] = [];
  const mutations: Array<Record<string, unknown>> = [];
  const repository = {
    transaction: async (work: (manager: object) => Promise<unknown>) => work({}),
    lockRequest: async () => locked,
    countDecisions: async () => options.decisionCount ?? 0,
    findMutation: async () => options.mutation ?? null,
    mutationRepository: () => ({
      create: (value: Record<string, unknown>) => value,
      save: async (value: Record<string, unknown>) => {
        if (!mutations.includes(value)) mutations.push(value);
        return value;
      }
    }),
    requestRepository: () => ({
      save: async (value: unknown) => value
    }),
    casDecisionRequest: async () => true,
    auditRepository: () => ({
      insert: async (value: unknown) => {
        audits.push(value);
      }
    })
  };
  return {
    service: new PropertyApprovalService(
      repository as never,
      { resolve: async () => { throw new Error("unused"); } },
      {
        authorizeDecision: async () => { throw new Error("unused"); },
        canDecide: async () => false
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
        authorizeSource: async () => {
          if (options.sourceDenied) throw new NotFoundException();
        }
      },
      { authorizeRetry: async () => ({ scopeAssignmentId: "scope-a" }) },
      enforceControls,
      noProofVerifiers
    ),
    locked,
    audits,
    mutations
  };
}

test("canonical request hashing is key-order invariant", () => {
  assert.deepEqual(
    normalizeObject({ z: 1, a: { y: 2, x: 3 } }),
    { a: { x: 3, y: 2 }, z: 1 }
  );
  assert.equal(hash({ z: 1, a: 2 }), hash({ a: 2, z: 1 }));
});

test("all 11 approval actions derive the exact ordered 15-kind stable-line contract", () => {
  const id = (n: number) => `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const cases = [
    ["homestay.bookings.cancel.request", { bookingId: id(1) }, [
      ["homestay.booking.cancel", `booking:${id(1)}`]
    ]],
    ["homestay.finance.refund-or-waive.request", { lines: [
      { entryType: "refund", sourceReceivableId: id(2), amount: "1.00", currency: "CNY" },
      { entryType: "waiver", sourceReceivableId: id(3), amount: "2.00", currency: "CNY" }
    ] }, [
      ["homestay.ledger.refund", `ledger:refund:${id(2)}`],
      ["homestay.ledger.waiver", `ledger:waiver:${id(3)}`]
    ]],
    ["housing.leases.approve.request", { leaseId: id(4) }, [
      ["housing.lease.approve", `lease:${id(4)}`]
    ]],
    ["housing.leases.void.request", { leaseId: id(5) }, [
      ["housing.lease.void", `lease:${id(5)}`]
    ]],
    ["housing.leases.checkout.request", { leaseId: id(6) }, [
      ["housing.lease.checkout", `lease:${id(6)}`]
    ]],
    ["housing.finance.refund-waive-or-deposit-refund.request", { lines: [
      { entryType: "refund", receivableId: id(7), amount: "1.00", currency: "CNY" },
      { entryType: "waiver", receivableId: id(8), amount: "2.00", currency: "CNY" },
      { entryType: "deposit-refund", receivableId: id(9), amount: "3.00", currency: "CNY" }
    ] }, [
      ["housing.ledger.refund", `ledger:refund:${id(7)}`],
      ["housing.ledger.waiver", `ledger:waiver:${id(8)}`],
      ["housing.ledger.deposit.refund", `ledger:deposit-refund:${id(9)}`]
    ]],
    ["housing.handovers.complete-move-out-financial.request", {
      handoverId: id(10), deductions: [{ itemId: id(11), amount: "1.00", currency: "CNY" }]
    }, [
      ["housing.handover.complete.financial", `handover:${id(10)}`],
      ["housing.ledger.deduction", `deduction:${id(11)}`]
    ]],
    ["housing.purchases.lifecycle.request", { purchaseId: id(12) }, [
      ["housing.purchase.lifecycle", `purchase:${id(12)}`]
    ]],
    ["housing.purchases.transfer.request", { items: [{ purchaseItemId: id(13) }] }, [
      ["housing.purchase.transfer", `item:${id(13)}`]
    ]],
    ["property.mode-transition.request", { unitId: id(14) }, [
      ["property.mode.transition", `unit:${id(14)}`]
    ]],
    ["property.occupancy.force-release.request", { occupancyId: id(15) }, [
      ["property.occupancy.force.release", `occupancy:${id(15)}`]
    ]]
  ] as const;
  const authority: Record<string, [string, string, number]> = {
    "homestay.booking.cancel": ["biz_homestay_booking_action_log", "uq_homestay_booking_action_log_approval_line", 2],
    "homestay.ledger.refund": ["biz_homestay_ledger_entry", "uq_homestay_ledger_approval_line", 1],
    "homestay.ledger.waiver": ["biz_homestay_ledger_entry", "uq_homestay_ledger_approval_line", 1],
    "housing.lease.approve": ["biz_housing_lease", "pk_biz_housing_lease", 1],
    "housing.lease.void": ["biz_housing_lease_audit", "uq_housing_lease_audit_approval_line", 2],
    "housing.lease.checkout": ["biz_housing_checkout_audit", "uq_housing_checkout_audit_approval_line", 2],
    "housing.ledger.refund": ["biz_housing_ledger_entry", "uq_housing_ledger_approval_line", 1],
    "housing.ledger.waiver": ["biz_housing_ledger_entry", "uq_housing_ledger_approval_line", 1],
    "housing.ledger.deposit.refund": ["biz_housing_ledger_entry", "uq_housing_ledger_approval_line", 1],
    "housing.handover.complete.financial": ["biz_housing_handover", "pk_biz_housing_handover", 1],
    "housing.ledger.deduction": ["biz_housing_ledger_entry", "uq_housing_ledger_approval_line", 1],
    "housing.purchase.lifecycle": ["biz_housing_purchase_audit", "uq_housing_purchase_audit_approval_line", 2],
    "housing.purchase.transfer": ["biz_housing_purchase_transfer_audit", "uq_housing_purchase_transfer_audit_approval_line", 1],
    "property.mode.transition": ["biz_property_mode_transition_log", "uq_property_mode_transition_approval_line", 2],
    "property.occupancy.force.release": ["biz_property_occupancy_release_audit", "uq_property_occupancy_release_audit_approval_line", 2]
  };
  const kinds = new Set<string>();
  for (const [actionId, payload, expected] of cases) {
    const actual = canonicalEffectLines(actionId, payload);
    assert.deepEqual(actual.map(({ effectKind, effectLineKey }) => ({ effectKind, effectLineKey })), expected.map(([effectKind, effectLineKey]) => ({
      effectKind, effectLineKey
    })));
    actual.forEach((line) => kinds.add(line.effectKind));
    const effects = actual.map((line, effectOrdinal) => {
      const [owningTable, owningUniqueName, expectedCardinality] = authority[line.effectKind]!;
      const effect = { ...line, effectOrdinal, owningTable, owningUniqueName, expectedCardinality };
      return { ...effect, invariantHash: canonicalEffectInvariantHash(effect, payload) };
    });
    const tampered = {
      ...effects[0]!,
      effectLineKey: effects[0]!.effectLineKey.replace(/[0-9a-f-]{36}$/, id(99))
    };
    tampered.invariantHash = canonicalEffectInvariantHash(tampered, payload);
    const amount = actual.filter((line) => line.lineAmount != null)
      .reduce((sum, line) => sum + Number(line.lineAmount), 0);
    assert.throws(() => validateFrozenPolicy(actionId, {
      policyId: "40000000-0000-4000-8000-000000000001", policyVersion: 1,
      policyHash: "a".repeat(64), exclusions: [],
      stages: [{ stageCode: "gate", stageOrdinal: 1, eligibilityPolicySnapshot: {},
        eligibilityPolicyVersion: 1, eligibilityPolicyHash: "b".repeat(64), requiredCount: 1 }],
      effects: [tampered, ...effects.slice(1)]
    }, amount ? amount.toFixed(2) : null, amount ? "CNY" : null, payload), ConflictException);
  }
  assert.equal(cases.length, 11);
  assert.equal(kinds.size, 15);
});

test("canonical array order rejects missing, extra, reordered and duplicate identities", () => {
  const id = (n: number) => `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const line = (n: number) => ({
    entryType: n === 1 ? "refund" : "waiver",
    sourceReceivableId: id(n), amount: "1.00", currency: "CNY"
  });
  const original = canonicalEffectLines("homestay.finance.refund-or-waive.request", {
    lines: [line(1), line(2)]
  });
  assert.equal(original.length, 2);
  assert.notDeepEqual(canonicalEffectLines("homestay.finance.refund-or-waive.request", {
    lines: [line(1)]
  }), original);
  assert.notDeepEqual(canonicalEffectLines("homestay.finance.refund-or-waive.request", {
    lines: [line(1), line(2), { ...line(1), sourceReceivableId: id(3) }]
  }), original);
  assert.notDeepEqual(canonicalEffectLines("homestay.finance.refund-or-waive.request", {
    lines: [line(2), line(1)]
  }), original);
  assert.throws(() => canonicalEffectLines("homestay.finance.refund-or-waive.request", {
    lines: [line(1), line(1)]
  }), ConflictException);
});

test("actor exclusion freeze rejects resolver omissions for every required historical edge", () => {
  const command = {
    actionId: "housing.purchases.transfer.request" as const,
    sourceType: "housing-purchase",
    sourceId: "30000000-0000-4000-8000-000000000001",
    sourceExpectedVersion: 1,
    requesterId: "10000000-0000-4000-8000-000000000001",
    submitterId: "10000000-0000-4000-8000-000000000002",
    clientKey: "draft-actors",
    businessIntentKey: "intent-actors",
    canonicalPayload: {},
    payloadSchemaVersion: 1
  };
  const historical = [
    ["source_creator", "10000000-0000-4000-8000-000000000003"],
    ["purchase_creator", "10000000-0000-4000-8000-000000000004"],
    ["payment_executor", "10000000-0000-4000-8000-000000000005"]
  ].map(([reasonCode, actorId]) => ({
    actorId: actorId!,
    reasonCode: reasonCode!,
    sourceType: command.sourceType,
    sourceId: command.sourceId
  }));
  const frozen = freezeActorExclusions(command, historical);
  assert.deepEqual(
    frozen.map((item) => item.reasonCode).sort(),
    ["payment_executor", "purchase_creator", "requester", "source_creator", "submitter"]
  );
  for (const required of ["source_creator", "purchase_creator", "payment_executor"]) {
    assert.throws(
      () => freezeActorExclusions(
        command,
        historical.filter((item) => item.reasonCode !== required)
      ),
      ConflictException
    );
  }
  const financeCommand = {
    ...command,
    actionId: "homestay.finance.refund-or-waive.request" as const
  };
  assert.throws(
    () => freezeActorExclusions(financeCommand, [historical[0]!]),
    ConflictException
  );
  assert.doesNotThrow(() => freezeActorExclusions(financeCommand, [
    historical[0]!,
    { ...historical[1]!, reasonCode: "payment_recorder" }
  ]));
});

test("policy effect kinds must exactly match the frozen action manifest", () => {
  const canonicalPayload = { unitId: "30000000-0000-4000-8000-000000000001" };
  const base = {
    policyId: "40000000-0000-4000-8000-000000000001",
    policyVersion: 1,
    policyHash: "a".repeat(64),
    stages: [{
      stageCode: "finance",
      stageOrdinal: 1,
      eligibilityPolicySnapshot: {},
      eligibilityPolicyVersion: 1,
      eligibilityPolicyHash: "b".repeat(64),
      requiredCount: 1
    }],
    exclusions: [],
    effects: [frozenEffect({
      effectKind: "property.mode.transition",
      effectOrdinal: 0,
      effectLineKey: "unit:30000000-0000-4000-8000-000000000001",
      owningTable: "biz_property_mode_transition_log",
      owningUniqueName: "uq_property_mode_transition_approval_line",
      expectedCardinality: 2
    }, canonicalPayload)]
  };
  assert.doesNotThrow(() =>
    validateFrozenPolicy("property.mode-transition.request", base, null, null, canonicalPayload)
  );
  assert.throws(
    () => validateFrozenPolicy("property.mode-transition.request", {
      ...base,
      effects: [{ ...base.effects[0]!, effectKind: "housing.lease.void" }]
    }, null, null, canonicalPayload),
    ConflictException
  );
  const second = frozenEffect({
    ...base.effects[0]!,
    effectOrdinal: 1,
    effectLineKey: "unit:30000000-0000-4000-8000-000000000002"
  });
  assert.throws(() => validateFrozenPolicy("property.mode-transition.request", {
    ...base,
    effects: [
      base.effects[0]!,
      frozenEffect({ ...second, effectOrdinal: 2 })
    ]
  }, null, null, canonicalPayload), ConflictException);
  assert.throws(() => validateFrozenPolicy("property.mode-transition.request", {
    ...base,
    effects: [second, base.effects[0]!]
  }, null, null, canonicalPayload), ConflictException);
  assert.throws(() => validateFrozenPolicy("property.mode-transition.request", {
    ...base,
    effects: [{
      ...base.effects[0]!,
      owningTable: "biz_tampered_table"
    }]
  }, null, null, canonicalPayload), ConflictException);
  const selfConsistentTamper = {
    ...base.effects[0]!,
    owningTable: "biz_tampered_table"
  };
  assert.throws(() => validateFrozenPolicy("property.mode-transition.request", {
    ...base,
    effects: [{
      ...selfConsistentTamper,
      invariantHash: canonicalEffectInvariantHash(selfConsistentTamper)
    }]
  }, null, null, canonicalPayload), ConflictException);
});

test("financial policies allow frozen refund-only, waiver-only and repeated stable lines", () => {
  const stages = [{
    stageCode: "finance",
    stageOrdinal: 1,
    eligibilityPolicySnapshot: {},
    eligibilityPolicyVersion: 1,
    eligibilityPolicyHash: "b".repeat(64),
    requiredCount: 1
  }];
  const line = (
    effectKind: "homestay.ledger.refund" | "homestay.ledger.waiver",
    effectOrdinal: number,
    amount: string
  ) => frozenEffect({
    effectKind,
    effectOrdinal,
    effectLineKey: `${effectKind.endsWith("waiver") ? "ledger:waiver" : "ledger:refund"}`
      + `:30000000-0000-4000-8000-${String(effectOrdinal + 1).padStart(12, "0")}`,
    owningTable: "biz_homestay_ledger_entry",
    owningUniqueName: "uq_homestay_ledger_approval_line",
    expectedCardinality: 1,
    lineAmount: amount,
    currency: "CNY"
  });
  const policy = (effects: ReturnType<typeof line>[]) => {
    const canonicalPayload = { lines: effects.map((effect) => ({
      entryType: effect.effectKind.endsWith("waiver") ? "waiver" : "refund",
      sourceReceivableId: effect.effectLineKey.split(":")[2],
      amount: effect.lineAmount,
      currency: effect.currency
    })) };
    return {
      canonicalPayload,
      frozen: {
        policyId: "40000000-0000-4000-8000-000000000001",
        policyVersion: 1,
        policyHash: "a".repeat(64), stages, exclusions: [],
        effects: effects.map((effect) => ({
          ...effect,
          invariantHash: canonicalEffectInvariantHash(effect, canonicalPayload)
        }))
      }
    };
  };
  const validates = (effects: ReturnType<typeof line>[], amount: string) => {
    const value = policy(effects);
    return () => validateFrozenPolicy(
      "homestay.finance.refund-or-waive.request",
      value.frozen,
      amount,
      "CNY",
      value.canonicalPayload
    );
  };
  assert.doesNotThrow(() => validateFrozenPolicy(
    "homestay.finance.refund-or-waive.request", policy([
      line("homestay.ledger.refund", 0, "10.00")
    ]).frozen, "10.00", "CNY", policy([
      line("homestay.ledger.refund", 0, "10.00")
    ]).canonicalPayload
  ));
  assert.doesNotThrow(validates([line("homestay.ledger.waiver", 0, "10.00")], "10.00"));
  assert.doesNotThrow(validates([
      line("homestay.ledger.refund", 0, "4.25"),
      line("homestay.ledger.refund", 1, "5.75")
    ], "10.00"));
  assert.doesNotThrow(validates([
    line("homestay.ledger.refund", 0, "9999999999999999.99")
  ], "9999999999999999.99"));
});

test("financial policy rejects zero line, currency drift, total drift and non-financial amounts", () => {
  const stage = [{
    stageCode: "finance",
    stageOrdinal: 1,
    eligibilityPolicySnapshot: {},
    eligibilityPolicyVersion: 1,
    eligibilityPolicyHash: "b".repeat(64),
    requiredCount: 1
  }];
  const financialBase = {
    policyId: "40000000-0000-4000-8000-000000000001",
    policyVersion: 1,
    policyHash: "a".repeat(64),
    stages: stage,
    exclusions: []
  };
  const financialLine = frozenEffect({
    effectKind: "homestay.ledger.refund" as const,
    effectOrdinal: 0,
    effectLineKey: "ledger:refund:30000000-0000-4000-8000-000000000001",
    owningTable: "biz_homestay_ledger_entry",
    owningUniqueName: "uq_homestay_ledger_approval_line",
    expectedCardinality: 1,
    lineAmount: "10.00",
    currency: "CNY"
  });
  for (const effects of [
    [{ ...financialLine, lineAmount: "0.00" }],
    [{ ...financialLine, currency: "USD" }],
    [{ ...financialLine, lineAmount: "9.99" }]
  ]) {
    assert.throws(() => validateFrozenPolicy(
      "homestay.finance.refund-or-waive.request",
      { ...financialBase, effects },
      "10.00",
      "CNY"
    ), ConflictException);
  }
  assert.throws(() => validateFrozenPolicy(
    "property.mode-transition.request",
    {
      ...financialBase,
      effects: [{
        ...financialLine,
        effectKind: "property.mode.transition",
        expectedCardinality: 2
      }]
    },
    "10.00",
    "CNY"
  ), ConflictException);
});

test("financial canonical lines reject malformed payload money and bind each ordinal exactly", () => {
  const receivable = (n: number) =>
    `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  for (const line of [
    { entryType: "refund", sourceReceivableId: receivable(1), amount: 1, currency: "CNY" },
    { entryType: "refund", sourceReceivableId: receivable(1), currency: "CNY" },
    { entryType: "refund", sourceReceivableId: receivable(1), amount: "1.001", currency: "CNY" },
    { entryType: "refund", sourceReceivableId: receivable(1), amount: "01.00", currency: "CNY" },
    { entryType: "refund", sourceReceivableId: receivable(1), amount: "1.00", currency: "cny" }
  ]) assert.throws(() => canonicalEffectLines(
    "homestay.finance.refund-or-waive.request", { lines: [line] }
  ), ConflictException);

  const payload = { lines: [
    { entryType: "refund", sourceReceivableId: receivable(1), amount: "6.00", currency: "CNY" },
    { entryType: "waiver", sourceReceivableId: receivable(2), amount: "4.00", currency: "CNY" }
  ] };
  const definitions = [
    ["homestay.ledger.refund", `ledger:refund:${receivable(1)}`],
    ["homestay.ledger.waiver", `ledger:waiver:${receivable(2)}`]
  ] as const;
  const effects = definitions.map(([effectKind, effectLineKey], effectOrdinal) => {
    const effect = {
      effectKind, effectOrdinal, effectLineKey,
      owningTable: "biz_homestay_ledger_entry",
      owningUniqueName: "uq_homestay_ledger_approval_line",
      expectedCardinality: 1,
      lineAmount: "5.00",
      currency: "CNY"
    };
    return { ...effect, invariantHash: canonicalEffectInvariantHash(effect, payload) };
  });
  assert.throws(() => validateFrozenPolicy(
    "homestay.finance.refund-or-waive.request",
    {
      policyId: "40000000-0000-4000-8000-000000000001",
      policyVersion: 1, policyHash: "a".repeat(64), exclusions: [],
      stages: [{
        stageCode: "finance", stageOrdinal: 1, eligibilityPolicySnapshot: {},
        eligibilityPolicyVersion: 1, eligibilityPolicyHash: "b".repeat(64), requiredCount: 1
      }],
      effects
    },
    "10.00", "CNY", payload
  ), ConflictException);
});

test("financial receipts bind every frozen line and exactly match amount/currency totals", () => {
  const canonicalPayload = { lines: [0, 1].map((ordinal) => ({
    entryType: "refund",
    sourceReceivableId: `30000000-0000-4000-8000-${String(ordinal + 1).padStart(12, "0")}`,
    amount: ordinal === 0 ? "4.25" : "5.75",
    currency: "CNY"
  })) };
  const manifests = [0, 1].map((ordinal) => frozenEffect({
    id: `40000000-0000-4000-8000-00000000000${ordinal + 1}`,
    effectKind: "homestay.ledger.refund",
    effectOrdinal: ordinal,
    effectLineKey:
      `ledger:refund:30000000-0000-4000-8000-${String(ordinal + 1).padStart(12, "0")}`,
    owningTable: "biz_homestay_ledger_entry",
    owningUniqueName: "uq_homestay_ledger_approval_line",
    expectedCardinality: 1,
    lineAmount: ordinal === 0 ? "4.25" : "5.75",
    currency: "CNY"
  }, canonicalPayload));
  const receipts = manifests.map((manifest, ordinal) => ({
    manifestId: manifest.id,
    effectKind: manifest.effectKind,
    effectOrdinal: ordinal,
    effectLineKey: manifest.effectLineKey,
    domainTable: manifest.owningTable,
    domainRowId: `50000000-0000-4000-8000-00000000000${ordinal + 1}`,
    effectHash: manifest.invariantHash,
    owningUniqueName: manifest.owningUniqueName,
    uniqueKeyHash: String(ordinal + 4).repeat(64),
    observedCardinality: 1,
    lineAmount: manifest.lineAmount,
    currency: "CNY"
  }));
  assert.doesNotThrow(() => validateEffectReceipts(
    { actionId: "homestay.finance.refund-or-waive.request", canonicalPayload,
      amount: "10.00", currency: "CNY" } as never,
    manifests as never,
    receipts,
    2
  ));
  assert.throws(() => validateEffectReceipts(
    { actionId: "homestay.finance.refund-or-waive.request", canonicalPayload,
      amount: "10.00", currency: "CNY" } as never,
    manifests as never,
    [{ ...receipts[0]!, lineAmount: "4.24" }, receipts[1]!],
    2
  ), ApprovalExecutionError);
  assert.throws(() => validateEffectReceipts(
    { actionId: "homestay.finance.refund-or-waive.request", canonicalPayload,
      amount: "10.00", currency: "CNY" } as never,
    manifests as never,
    [{ ...receipts[0]!, currency: "USD" }, receipts[1]!],
    2
  ), ApprovalExecutionError);
});

test("draft rejects malformed UUID and non-printable client keys before repository access", async () => {
  const { service } = serviceFor();
  const base = {
    actionId: "property.mode-transition.request" as const,
    sourceType: "property-unit",
    sourceId: "30000000-0000-4000-8000-000000000001",
    sourceExpectedVersion: 1,
    requesterId: actor.sub,
    submitterId: actor.sub,
    clientKey: "draft-1",
    businessIntentKey: "intent-1",
    canonicalPayload: { toMode: "homestay" },
    payloadSchemaVersion: 1
  };
  await assert.rejects(
    service.createDraft(scope, { ...base, sourceId: "not-a-uuid" }),
    BadRequestException
  );
  await assert.rejects(
    service.createDraft(scope, { ...base, clientKey: "bad\nkey" }),
    BadRequestException
  );
});

test("submit performs request CAS and records submitted plus active audit states", async () => {
  const draft = request({ decisionStatus: "draft", decisionVersion: 1, submittedAt: null });
  const { service, audits } = serviceFor({ locked: draft });
  const result = await service.submit(scope, actor, draft.id, {
    clientKey: "submit-1",
    expectedDecisionVersion: 1
  });
  assert.equal(result.decisionStatus, "pending_approval");
  assert.equal(result.decisionVersion, 2);
  assert.equal(audits.length, 2);
  assert.deepEqual(
    audits.map((item) => (item as { toDecisionStatus: string }).toDecisionStatus),
    ["submitted", "pending_approval"]
  );
});

test("submit rejects a stale request version", async () => {
  const draft = request({ decisionStatus: "draft", decisionVersion: 3 });
  const { service } = serviceFor({ locked: draft });
  await assert.rejects(
    service.submit(scope, actor, draft.id, {
      clientKey: "submit-stale",
      expectedDecisionVersion: 2
    }),
    (error: unknown) =>
      error instanceof ConflictException
      && (error.getResponse() as { errorCode: string }).errorCode === "property-version-conflict"
  );
});

test("withdraw requires requester, pending state, matching CAS and zero decisions", async () => {
  const { service, locked, mutations } = serviceFor();
  const result = await service.withdraw(scope, actor, locked.id, {
    clientKey: "withdraw-1",
    expectedDecisionVersion: 2,
    reason: "request cancelled"
  });
  assert.equal(result.decisionStatus, "withdrawn");
  assert.equal(result.executionStatus, "not_required");
  assert.equal(result.decisionVersion, 3);
  assert.equal(mutations.at(-1)?.receiptStatus, "completed");
});

test("submit and withdraw replay completed mutation receipts and conflict on hash drift", async () => {
  const submitDraft = request({ decisionStatus: "draft", decisionVersion: 1 });
  const firstSubmit = serviceFor({ locked: submitDraft });
  await firstSubmit.service.submit(scope, actor, submitDraft.id, {
    clientKey: "submit-replay",
    expectedDecisionVersion: 1
  });
  const submitReceipt = firstSubmit.mutations[0]!;
  const submitReplay = serviceFor({ locked: submitDraft, mutation: submitReceipt });
  assert.equal(
    (await submitReplay.service.submit(scope, actor, submitDraft.id, {
      clientKey: "submit-replay",
      expectedDecisionVersion: 1
    })).id,
    submitDraft.id
  );
  await assert.rejects(
    submitReplay.service.submit(scope, actor, submitDraft.id, {
      clientKey: "submit-replay",
      expectedDecisionVersion: 9
    }),
    (error: unknown) =>
      error instanceof ConflictException
      && (error.getResponse() as { errorCode: string }).errorCode === "idempotency-key-conflict"
  );

  const pending = request();
  const firstWithdraw = serviceFor({ locked: pending });
  await firstWithdraw.service.withdraw(scope, actor, pending.id, {
    clientKey: "withdraw-replay",
    expectedDecisionVersion: 2,
    reason: "cancel request"
  });
  const withdrawReceipt = firstWithdraw.mutations[0]!;
  const withdrawReplay = serviceFor({ locked: pending, mutation: withdrawReceipt });
  assert.equal(
    (await withdrawReplay.service.withdraw(scope, actor, pending.id, {
      clientKey: "withdraw-replay",
      expectedDecisionVersion: 2,
      reason: "cancel request"
    })).id,
    pending.id
  );
});

test("list applies read predicate and combines wildcard permission with stage eligibility", async () => {
  const value = request();
  const stage = {
    id: "70000000-0000-4000-8000-000000000001",
    requestId: value.id,
    eligibilityPolicySnapshot: { queue: "finance" },
    eligibilityPolicyHash: "e".repeat(64),
    stageStatus: "pending"
  };
  let receivedPredicate: unknown;
  const repository = {
    list: async (_scope: unknown, predicate: unknown) => {
      receivedPredicate = predicate;
      return [[value], 1];
    },
    findCurrentStages: async () => new Map([[value.id, stage]]),
    findDecisionCounts: async () => new Map([[value.id, 0]])
  };
  const wildcardActor = { ...actor, permissions: ["property_approval:*"] };
  const service = new PropertyApprovalService(
    repository as never,
    { resolve: async () => { throw new Error("unused"); } },
    {
      authorizeDecision: async () => { throw new Error("unused"); },
      canDecide: async () => true
    },
    { get: () => null },
    { append: async () => undefined },
    {
      predicate: async () => ({
        canReadAll: false,
        requesterId: actor.sub,
        requesterRequestIds: [value.id],
        allowedSources: [{
          sourceType: "property-unit",
          sourceId: value.sourceId
        }],
        eligibleApproverRequestIds: [value.id],
        auditorRequestIds: [],
        canAudit: false
      }),
      authorizeSource: async () => undefined
    },
    { authorizeRetry: async () => ({ scopeAssignmentId: "scope-a" }) },
    enforceControls,
    noProofVerifiers
  );
  const result = await service.list(scope, wildcardActor, {
    page: 1,
    pageSize: 20,
    sort: "createdAt",
    order: "desc"
  });
  assert.deepEqual(receivedPredicate, {
    canReadAll: false,
    requesterId: actor.sub,
    requesterRequestIds: [value.id],
    allowedSources: [{
      sourceType: "property-unit",
      sourceId: value.sourceId
    }],
    eligibleApproverRequestIds: [value.id],
    auditorRequestIds: [],
    canAudit: false
  });
  assert.deepEqual(result.items[0]?.allowedActions, [
    "property.approval.decide",
    "property.approval.withdraw"
  ]);
});

test("detail is source-authorized and never spreads payload, token or worker fields", async () => {
  const value = request();
  const stage = {
    id: "70000000-0000-4000-8000-000000000001",
    requestId: value.id,
    stageCode: "finance",
    stageOrdinal: 1,
    eligibilityPolicySnapshot: { secretRule: "hidden" },
    eligibilityPolicyHash: "e".repeat(64),
    requiredCount: 1,
    approvedCount: 0,
    rejectedCount: 0,
    stageStatus: "pending",
    version: 1
  };
  let sourceAuthorized = false;
  const repository = {
    findDetail: async () => ({
      request: value,
      stages: [stage],
      decisions: [{
        id: "80000000-0000-4000-8000-000000000001",
        stageId: stage.id,
        actorId: "10000000-0000-4000-8000-000000000002",
        decision: "approve",
        reason: null,
        decidedAt: new Date()
      }]
    })
  };
  const service = new PropertyApprovalService(
    repository as never,
    { resolve: async () => { throw new Error("unused"); } },
    {
      authorizeDecision: async () => { throw new Error("unused"); },
      canDecide: async () => false
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
      authorizeSource: async () => { sourceAuthorized = true; }
    },
    { authorizeRetry: async () => ({ scopeAssignmentId: "scope-a" }) },
    enforceControls,
    noProofVerifiers
  );
  const detail = await service.detail(scope, actor, value.id);
  assert.equal(sourceAuthorized, true);
  assert.equal("canonicalPayload" in detail.request, false);
  assert.equal("payloadHash" in detail.request, false);
  assert.equal("claimToken" in detail.request, false);
  assert.equal("workerId" in detail.request, false);
  assert.equal("eligibilityPolicySnapshot" in detail.stages[0]!, false);
  assert.deepEqual(detail.decisions, []);
  assert.deepEqual(detail.request.allowedActions, []);
});

test("detail maps denied source scope to safe not-found behavior", async () => {
  const value = request();
  const service = new PropertyApprovalService(
    { findDetail: async () => ({ request: value, stages: [], decisions: [] }) } as never,
    { resolve: async () => { throw new Error("unused"); } },
    {
      authorizeDecision: async () => { throw new Error("unused"); },
      canDecide: async () => false
    },
    { get: () => null },
    { append: async () => undefined },
    {
      predicate: async () => ({
        canReadAll: false,
        requesterId: null,
        requesterRequestIds: [],
        allowedSources: [],
        eligibleApproverRequestIds: [],
        auditorRequestIds: [],
        canAudit: false
      }),
      authorizeSource: async () => {
        throw new NotFoundException({ errorCode: "property-resource-not-found" });
      }
    },
    { authorizeRetry: async () => ({ scopeAssignmentId: "scope-a" }) },
    enforceControls,
    noProofVerifiers
  );
  await assert.rejects(service.detail(scope, actor, value.id), NotFoundException);
});

test("withdraw fails closed after any decision exists", async () => {
  const { service, locked } = serviceFor({ decisionCount: 1 });
  await assert.rejects(
    service.withdraw(scope, actor, locked.id, {
      clientKey: "withdraw-2",
      expectedDecisionVersion: 2,
      reason: "too late"
    }),
    (error: unknown) =>
      error instanceof ForbiddenException
      && (error.getResponse() as { errorCode: string }).errorCode === "approval-withdraw-forbidden"
  );
});

test("withdraw cannot use requester identity when the frozen source scope is denied", async () => {
  const locked = request();
  const context = serviceFor({ locked, sourceDenied: true });
  await assert.rejects(context.service.withdraw(scope, actor, locked.id, {
    clientKey: "withdraw-source-mismatch",
    expectedDecisionVersion: 2,
    reason: "cancel"
  }), NotFoundException);
  assert.equal(locked.decisionStatus, "pending_approval");
});
