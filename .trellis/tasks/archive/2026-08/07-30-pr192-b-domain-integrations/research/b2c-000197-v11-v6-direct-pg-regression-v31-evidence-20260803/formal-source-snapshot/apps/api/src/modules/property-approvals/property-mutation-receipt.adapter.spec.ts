import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PROPERTY_MUTATION_RECEIPT_CONTRACT_VERSION,
  PROPERTY_TASK_PORT_V2_ACTION_IDENTITY_MODE_MANIFEST,
  propertyTaskMutationResultHash,
  type PropertyMutationReceiptAcquireInput,
  type PropertyMutationReceiptCompleteInput
} from "@jinhu/shared";
import type { EntityManager } from "typeorm";
import {
  DatabasePropertyMutationReceiptAdapter,
  isPropertyMutationReceiptSerializationFailure
} from
  "./property-mutation-receipt.adapter";

const tenantId = "11111111-1111-4111-8111-111111111111";
const parkId = "22222222-2222-4222-8222-222222222222";
const actorId = "33333333-3333-4333-8333-333333333333";
const targetId = "44444444-4444-4444-8444-444444444444";
const receiptId = "55555555-5555-4555-8555-555555555555";
const requestHash = "a".repeat(64);
const taskKey = "b".repeat(64);
const identity = { tag: "property-task" as const, businessOccurrenceKey: "booking:42", taskKey };

const acquireInput: PropertyMutationReceiptAcquireInput = {
  scope: { tenantId, parkId }, contractVersion: PROPERTY_MUTATION_RECEIPT_CONTRACT_VERSION,
  actorId, actionId: "property.task.claim", targetId, clientKey: "client-key-1",
  requestHash, identity, acquireMode: "execute-or-replay"
};

function errorCode(error: unknown): unknown {
  return (error as { getResponse?: () => unknown }).getResponse?.()
    && ((error as { getResponse: () => { errorCode?: unknown } }).getResponse()).errorCode;
}

function managerWith(
  query: (sql: string, params?: unknown[]) => Promise<unknown>
): EntityManager {
  return { query } as unknown as EntityManager;
}

async function completedRow(overrides: Record<string, unknown> = {}) {
  const resultVersion = 2;
  const resultRef = `property-task/${targetId}/v${resultVersion}`;
  const resultHash = await propertyTaskMutationResultHash({
    actionId: "property.task.claim", targetId, identity, resultRef, resultVersion
  });
  return {
    id: receiptId, receipt_contract_version: "port-v2", tenant_id: tenantId,
    park_id: parkId, actor_id: actorId, action_id: "property.task.claim",
    target_id: targetId, client_key: "client-key-1", request_hash: requestHash,
    receipt_status: "completed", identity_kind: "property-task",
    business_occurrence_key: identity.businessOccurrenceKey, task_key: taskKey,
    identity_source_type: null, result_ref: resultRef, result_hash: resultHash,
    result_version: resultVersion, ...overrides
  };
}

describe("DatabasePropertyMutationReceiptAdapter", () => {
  it("uses the caller manager unchanged and never opens a transaction", async () => {
    const calls: string[] = [];
    const manager = managerWith(async (sql) => { calls.push(sql); return [{ id: receiptId }]; });
    const result = await new DatabasePropertyMutationReceiptAdapter().acquire(manager, acquireInput);
    assert.deepEqual(result, { kind: "execute", receiptId });
    assert.equal(calls.length, 1);
    assert.match(calls[0]!, /INSERT INTO biz_property_mutation_receipt/i);
    assert.equal("transaction" in (manager as object), false);
  });

  it("rejects every signed action with an invalid action/identity/mode before SQL", async () => {
    for (const row of PROPERTY_TASK_PORT_V2_ACTION_IDENTITY_MODE_MANIFEST) {
      let queries = 0;
      const bad = {
        ...acquireInput, actionId: row.actionId,
        identity: row.identityTag === "property-task"
          ? { tag: "property-task-source-rebuild", sourceType: "booking", sourceId: targetId }
          : identity,
        acquireMode: "execute-or-replay"
      } as unknown as PropertyMutationReceiptAcquireInput;
      await assert.rejects(
        new DatabasePropertyMutationReceiptAdapter().acquire(
          managerWith(async () => { queries += 1; return []; }), bad
        ),
        (error) => errorCode(error) === "property-validation-failed"
      );
      assert.equal(queries, 0, row.actionId);
    }
  });

  it("rejects the complete common-input boundary matrix before any SQL", async () => {
    const rebuild = {
      ...acquireInput,
      actionId: "property.task.rebuild",
      identity: { tag: "property-task-source-rebuild", sourceType: "booking", sourceId: targetId },
      acquireMode: "execute-or-replay"
    } as unknown as PropertyMutationReceiptAcquireInput;
    const cases: [string, PropertyMutationReceiptAcquireInput][] = [
      ["contractVersion", { ...acquireInput, contractVersion: "legacy-v1" } as unknown as PropertyMutationReceiptAcquireInput],
      ["scope TAB", { ...acquireInput, scope: { tenantId: "bad\t", parkId } }],
      ["scope replacement", { ...acquireInput, scope: { tenantId: "bad\ufffd", parkId } }],
      ["scope lone surrogate", { ...acquireInput, scope: { tenantId: "bad\ud800", parkId } }],
      ["scope length", { ...acquireInput, scope: { tenantId: "x".repeat(65), parkId } }],
      ["actor UUID", { ...acquireInput,
        actorId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA" }],
      ["actor UUID version", { ...acquireInput, actorId: "33333333-3333-6333-8333-333333333333" }],
      ["target UUID", { ...acquireInput,
        targetId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA" }],
      ["request hash", { ...acquireInput, requestHash: "A".repeat(64) }],
      ["request hash length", { ...acquireInput, requestHash: "a".repeat(63) }],
      ["clientKey empty", { ...acquireInput, clientKey: "" }],
      ["clientKey spaces", { ...acquireInput, clientKey: "   " }],
      ["clientKey Unicode", { ...acquireInput, clientKey: "客户端" }],
      ["clientKey length", { ...acquireInput, clientKey: "x".repeat(129) }],
      ["occurrence replacement", { ...acquireInput,
        identity: { ...identity, businessOccurrenceKey: "bad\ufffd" } }],
      ["occurrence lone surrogate", { ...acquireInput,
        identity: { ...identity, businessOccurrenceKey: "bad\udc00" } }],
      ["occurrence UTF-8 byte limit", { ...acquireInput,
        identity: { ...identity, businessOccurrenceKey: "界".repeat(86) } }],
      ["source UUID", ({ ...rebuild,
        identity: { tag: "property-task-source-rebuild", sourceType: "booking", sourceId: "not-a-uuid" }
      } as unknown as PropertyMutationReceiptAcquireInput)],
      ["target/source mismatch", { ...rebuild, targetId: tenantId }],
      ["non-terminal existing-only", { ...acquireInput, actionId: "property.task.claim",
        acquireMode: "existing-only" } as unknown as PropertyMutationReceiptAcquireInput],
      ["terminal invalid mode", { ...acquireInput,
        actionId: "property.task.source-terminal.closed", acquireMode: "invalid-mode"
      } as unknown as PropertyMutationReceiptAcquireInput]
    ];
    for (const [name, input] of cases) {
      let queries = 0;
      await assert.rejects(new DatabasePropertyMutationReceiptAdapter().acquire(
        managerWith(async () => { queries += 1; return []; }), input
      ), (error) => errorCode(error) === "property-validation-failed", name);
      assert.equal(queries, 0, name);
    }
  });

  it("returns insert winner, locks conflict loser, and replays an exact completed row", async () => {
    const row = await completedRow();
    const sqls: string[] = [];
    const result = await new DatabasePropertyMutationReceiptAdapter().acquire(
      managerWith(async (sql) => {
        sqls.push(sql);
        return sqls.length === 1 ? [] : [row];
      }), acquireInput
    );
    assert.deepEqual(result, {
      kind: "replay", resultHash: row.result_hash, resultRef: row.result_ref,
      resultVersion: row.result_version
    });
    assert.match(sqls[0]!, /ON CONFLICT ON CONSTRAINT[\s\S]*DO NOTHING/i);
    assert.match(sqls[1]!, /FOR UPDATE/i);
  });

  it("classifies request/identity mismatch as conflict and started/failed as unavailable", async () => {
    for (const [overrides, expected] of [
      [{ request_hash: "c".repeat(64) }, "idempotency-key-conflict"],
      [{ task_key: "d".repeat(64) }, "idempotency-key-conflict"],
      [{ receipt_status: "started", result_ref: null, result_hash: null, result_version: null }, "property-runtime-unavailable"],
      [{ receipt_status: "failed" }, "property-runtime-unavailable"]
    ] as const) {
      let calls = 0;
      await assert.rejects(new DatabasePropertyMutationReceiptAdapter().acquire(
        managerWith(async () => (++calls === 1 ? [] : [await completedRow(overrides)])),
        acquireInput
      ), (error) => errorCode(error) === expected);
    }
  });

  it("existing-only performs one lock read, never inserts, and fails closed when absent", async () => {
    for (const rows of [[], [await completedRow()]]) {
      const sqls: string[] = [];
      const promise = new DatabasePropertyMutationReceiptAdapter().acquire(
        managerWith(async (sql) => { sqls.push(sql); return rows; }),
        ({
          ...acquireInput,
          actionId: "property.task.source-terminal.closed",
          acquireMode: "existing-only"
        } as PropertyMutationReceiptAcquireInput)
      );
      if (rows.length === 0) await assert.rejects(promise,
        (error) => errorCode(error) === "property-runtime-unavailable");
      else await assert.rejects(promise,
        (error) => errorCode(error) === "idempotency-key-conflict");
      assert.equal(sqls.length, 1);
      assert.doesNotMatch(sqls[0]!, /INSERT/i);
      assert.match(sqls[0]!, /FOR UPDATE/i);
    }
  });

  it("existing-only returns an exact terminal replay without an insert", async () => {
    const actionId = "property.task.source-terminal.closed" as const;
    const resultVersion = 3;
    const resultRef = `property-task-source-terminal/booking/${targetId}/closed/v${resultVersion}`;
    const resultHash = await propertyTaskMutationResultHash({
      actionId, targetId, identity, resultRef, resultVersion
    });
    const row = await completedRow({ action_id: actionId, result_ref: resultRef,
      result_hash: resultHash, result_version: resultVersion });
    const sqls: string[] = [];
    const result = await new DatabasePropertyMutationReceiptAdapter().acquire(
      managerWith(async (sql) => { sqls.push(sql); return [row]; }),
      { ...acquireInput, actionId, acquireMode: "existing-only" }
    );
    assert.deepEqual(result, { kind: "replay", resultRef, resultHash, resultVersion });
    assert.equal(sqls.length, 1);
    assert.doesNotMatch(sqls[0]!, /INSERT/i);
  });

  it("rebuilds the stored result hash and rejects corrupted stored outcomes", async () => {
    let calls = 0;
    await assert.rejects(new DatabasePropertyMutationReceiptAdapter().acquire(
      managerWith(async () => (++calls === 1 ? [] : [await completedRow({ result_hash: "0".repeat(64) })])),
      acquireInput
    ), (error) => errorCode(error) === "idempotency-key-conflict");
  });

  it("complete recomputes canonical hash and uses a full-field started CAS", async () => {
    const row = await completedRow();
    const input: PropertyMutationReceiptCompleteInput = {
      ...acquireInput, receiptId, resultRef: row.result_ref as string,
      resultHash: row.result_hash as string, resultVersion: row.result_version as number
    };
    let captured: { sql: string; params?: unknown[] } | undefined;
    await new DatabasePropertyMutationReceiptAdapter().complete(
      managerWith(async (sql, params) => { captured = { sql, params }; return [{ id: receiptId }]; }), input
    );
    assert.match(captured!.sql, /^\s*WITH completed AS\s*\(/i);
    assert.match(captured!.sql, /RETURNING id\s*\)\s*SELECT id FROM completed\s*$/i);
    assert.doesNotMatch(captured!.sql, /^\s*UPDATE\b/i);
    assert.match(captured!.sql, /UPDATE biz_property_mutation_receipt/i);
    for (const field of ["id", "tenant_id", "park_id", "actor_id", "action_id", "target_id",
      "client_key", "request_hash", "receipt_contract_version", "identity_kind",
      "business_occurrence_key", "task_key", "identity_source_type", "receipt_status",
      "result_ref", "result_hash", "result_version", "completed_at"])
      assert.match(captured!.sql, new RegExp(field, "i"), field);
    assert.ok(captured!.params?.includes(row.result_hash));
  });

  it("complete rejects caller hash drift before SQL and zero-row CAS as unavailable", async () => {
    const row = await completedRow();
    const base = {
      ...acquireInput, receiptId, resultRef: row.result_ref as string,
      resultHash: row.result_hash as string, resultVersion: row.result_version as number
    } satisfies PropertyMutationReceiptCompleteInput;
    let calls = 0;
    await assert.rejects(new DatabasePropertyMutationReceiptAdapter().complete(
      managerWith(async () => { calls += 1; return []; }), { ...base, resultHash: "0".repeat(64) }
    ), (error) => errorCode(error) === "property-validation-failed");
    assert.equal(calls, 0);
    await assert.rejects(new DatabasePropertyMutationReceiptAdapter().complete(
      managerWith(async () => []), base
    ), (error) => errorCode(error) === "property-runtime-unavailable");
  });

  it("complete rejects invalid result versions, refs, hashes and receipt UUID before SQL", async () => {
    const row = await completedRow();
    const base = {
      ...acquireInput, receiptId, resultRef: row.result_ref as string,
      resultHash: row.result_hash as string, resultVersion: row.result_version as number
    } satisfies PropertyMutationReceiptCompleteInput;
    const cases: [string, PropertyMutationReceiptCompleteInput][] = [
      ["receipt UUID", { ...base,
        receiptId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA" }],
      ["result version zero", { ...base, resultVersion: 0 }],
      ["result version fraction", { ...base, resultVersion: 1.5 }],
      ["result version overflow", { ...base, resultVersion: 2147483648 }],
      ["result ref", { ...base, resultRef: `property-task/${targetId}/v3` }],
      ["result hash grammar", { ...base, resultHash: "A".repeat(64) }],
      ["result hash mismatch", { ...base, resultHash: "0".repeat(64) }]
    ];
    for (const [name, input] of cases) {
      let queries = 0;
      await assert.rejects(new DatabasePropertyMutationReceiptAdapter().complete(
        managerWith(async () => { queries += 1; return []; }), input
      ), (error) => errorCode(error) === "property-validation-failed", name);
      assert.equal(queries, 0, name);
    }
  });

  it("translates database invariant errors to retryable runtime unavailable", async () => {
    const codes = [
      "22001", "22023", "22P02", "23502", "23505", "23514",
      "40001", "40P01", "55P03", "57014"
    ];
    for (const code of codes) {
      for (const error of [{ code }, { driverError: { code } }]) {
        await assert.rejects(new DatabasePropertyMutationReceiptAdapter().acquire(
          managerWith(async () => { throw error; }), acquireInput
        ), (caught) => {
          assert.equal(errorCode(caught), "property-runtime-unavailable");
          assert.equal(isPropertyMutationReceiptSerializationFailure(caught),
            code === "40001");
          if (code === "40001") {
            assert.equal((caught as { cause?: unknown }).cause, error);
            assert.equal(Object.prototype.propertyIsEnumerable.call(caught, "cause"), false);
          }
          return true;
        }, `${code}`);
      }
    }
    assert.equal(isPropertyMutationReceiptSerializationFailure({
      cause: { code: "40001" }
    }), false, "an unmarked lookalike must not cross the narrow adapter boundary");
    const sentinel = new Error("unknown database failure");
    await assert.rejects(new DatabasePropertyMutationReceiptAdapter().acquire(
      managerWith(async () => { throw sentinel; }), acquireInput
    ), (error) => error === sentinel);
  });
});
