import assert from "node:assert/strict";
import test from "node:test";
import type { EntityManager } from "typeorm";
import { PropertyApprovalRepository } from "./property-approval.repository";

function queryHarness() {
  const predicates: Array<{ sql: string; params?: Record<string, unknown> }> = [];
  const builder = {
    where(sql: string, params?: Record<string, unknown>) {
      predicates.push({ sql, params }); return this;
    },
    andWhere(sql: string, params?: Record<string, unknown>) {
      predicates.push({ sql, params }); return this;
    },
    orderBy() { return this; },
    addOrderBy() { return this; },
    take() { return this; },
    getMany: async () => [],
    getOne: async () => null
  };
  const manager = {
    getRepository: () => ({ createQueryBuilder: () => builder })
  } as unknown as EntityManager;
  return { manager, predicates };
}

test("repository active and terminal source predicates exactly partition legal states", async () => {
  const repository = new PropertyApprovalRepository({} as never);
  const active = queryHarness();
  await repository.findActiveBySource(
    active.manager,
    { tenantId: "tenant", parkId: "park" },
    {
      actionId: "property.mode-transition.request",
      sourceType: "property-unit",
      sourceId: "source",
      sourceExpectedVersion: 1
    }
  );
  const activeStatus = active.predicates.at(-1)!;
  assert.match(activeStatus.sql, /decision_status IN/u);
  assert.match(activeStatus.sql, /execution_status IN/u);
  assert.deepEqual(activeStatus.params, {
    activeDecisionStatuses: ["draft", "submitted", "pending_approval"],
    approvedStatus: "approved",
    activeApprovedExecutionStatuses: [
      "not_started", "executing", "retry_wait", "infra_exhausted"
    ]
  });

  const terminal = queryHarness();
  await repository.findLatestTerminalBySource(
    terminal.manager,
    { tenantId: "tenant", parkId: "park" },
    {
      actionId: "property.mode-transition.request",
      sourceType: "property-unit",
      sourceId: "source"
    }
  );
  const terminalStatus = terminal.predicates.at(-1)!;
  assert.match(terminalStatus.sql, /decision_status IN/u);
  assert.match(terminalStatus.sql, /execution_status IN/u);
  assert.deepEqual(terminalStatus.params, {
    terminalDecisionStatuses: ["rejected", "withdrawn", "expired"],
    approvedStatus: "approved",
    terminalApprovedExecutionStatuses: ["executed", "execution_failed"]
  });
});

test("execution candidates exclude disabled and shadow approval scopes before applying the limit", async () => {
  let capturedSql = "";
  let capturedParams: unknown[] = [];
  const repository = new PropertyApprovalRepository({
    query: async (sql: string, params: unknown[]) => {
      capturedSql = sql;
      capturedParams = params;
      return [];
    }
  } as never);

  await repository.listExecutionCandidates(50);

  assert.match(capturedSql, /EXISTS[\s\S]+control_key = 'approval\.enforce'/u);
  assert.match(capturedSql, /enabled = true[\s\S]+control_mode = 'enforce'/u);
  assert.ok(capturedSql.indexOf("EXISTS") < capturedSql.indexOf("LIMIT $1"));
  assert.deepEqual(capturedParams, [50]);
});
