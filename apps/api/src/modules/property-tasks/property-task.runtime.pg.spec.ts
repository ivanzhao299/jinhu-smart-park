import "reflect-metadata";
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { after, before, describe, it } from "node:test";
import {
  PROPERTY_MUTATION_RECEIPT_CONTRACT_VERSION,
  PROPERTY_TASK_TERMINAL_CLIENT_KEY_PREFIX,
  PropertyTaskSourceRegistry,
  propertyTaskMutationResultHash,
  propertyTaskSourceTerminalClientKeyCanonicalBytes,
  type PropertyMutationReceiptAcquireInput,
  type PropertyMutationReceiptCompleteInput,
  type PropertyMutationReceiptPort,
  type PropertyTaskAction,
  type PropertyTaskProjectorSource,
  type PropertyTaskSourceResolver,
  type PropertyTaskSourceSnapshot,
  type PropertyTaskSourceTerminalRequestV1,
  type PropertyTaskStatus
} from "@jinhu/shared";
import { DataSource, type EntityManager, type QueryRunner } from "typeorm";
import { DatabasePropertyMutationReceiptAdapter } from
  "../property-approvals/property-mutation-receipt.adapter";
import { PropertyTaskListQueryDto } from "./dto/property-task.dto";
import { PropertyTaskAccessEvaluatorService } from "./property-task.access";
import {
  PropertyTaskAssignmentRepository,
  type PropertyTaskAssignmentRow
} from "./property-task.assignment.repository";
import { PropertyTaskProjectionRepository } from
  "./property-task.projection.repository";
import type { PropertyTaskProjectionRow, PropertyTaskProjectionWriteRow } from
  "./property-task.projection.repository";
import {
  canonicalPropertyTaskRequestHash,
  derivePropertyTaskIdentity,
  sha256Hex
} from "./property-task.canonical";
import { PropertyTaskMapper } from "./property-task.mapper";
import { PropertyTaskOrchestrator } from "./property-task.orchestrator";
import { PropertyTaskSourceRegistryProvider } from "./property-task.registry";
import { PropertyTaskService } from "./property-task.service";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";

const url = process.env.PROPERTY_B2A_C4_PG_URL;
const runnerRunId = process.env.PROPERTY_B2A_C4_RUN_ID;
const gateRequired = process.env.PROPERTY_TASK_PG_GATE_REQUIRED === "1";
if ((gateRequired || runnerRunId) && !url) {
  throw new Error("PROPERTY_B2A_C4_PG_URL is required for the property-task PG gate");
}
const suite = url ? describe : describe.skip;
const hash = (character: string) => character.repeat(64);
const fixtureTaskKey = () => createHash("sha256").update(randomUUID()).digest("hex");
const WAITER_LOCK_TIMEOUT_SQL = "SET LOCAL lock_timeout='5s'";
const ACTOR_STATEMENT_TIMEOUT_SQL = "SET LOCAL statement_timeout='60s'";
const OBSERVER_STATEMENT_TIMEOUT_SQL = "SET LOCAL statement_timeout='2s'";
const OBSERVER_SNAPSHOT_TIMEOUT_SQL = "SET LOCAL statement_timeout='500ms'";
const OBSERVER_DEADLINE_MS = 3_000;
const OBSERVER_LOCK_SUMMARY_LIMIT = 24;
const C4_MATRIX_FREEZE_SHA256 =
  "04770205f1be4ccb0f7d722f300f0942b59f4372a1df9bef24f0836526285770";
const C4_MATRIX_SIGNOFF_SHA256 =
  "43b7d067c87eeabf909190cd0f73448518a4661e4e89eec8765c2051aaa967f5";
const C4_MATRIX_RESEARCH_ROOT =
  "../../../../../.trellis/tasks/archive/2026-08/07-30-pr192-b-approval-runtime-tasks/research";
const rawFileSha256 = (name: string) => createHash("sha256")
  .update(readFileSync(resolve(__dirname, C4_MATRIX_RESEARCH_ROOT, name))).digest("hex");
const independentCanonicalJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => independentCanonicalJson(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) =>
    `${JSON.stringify(key)}:${independentCanonicalJson(record[key])}`).join(",")}}`;
};
const independentRequestHash = (value: unknown): string => createHash("sha256")
  .update(independentCanonicalJson(value)).digest("hex");
assert.equal(rawFileSha256("c4-full-concurrency-matrix-freeze-v1.md"),
  C4_MATRIX_FREEZE_SHA256);
assert.equal(rawFileSha256("c4-full-concurrency-matrix-freeze-v1-signoff.md"),
  C4_MATRIX_SIGNOFF_SHA256);
assert.match(fixtureTaskKey(), /^[0-9a-f]{64}$/u);

const ACTOR_FAILURE = Symbol("actor-failure");

type ActorRole = "holder" | "waiter";
type ActorWatch = {
  role: ActorRole;
  status: "pending" | "fulfilled" | "rejected";
  value?: unknown;
  error?: unknown;
};

function rolledBackActorResult(error: unknown, code: unknown) {
  const result = { kind: "rolled-back" as const, code };
  Object.defineProperty(result, ACTOR_FAILURE, {
    configurable: false,
    enumerable: false,
    value: error
  });
  return result as typeof result & { [ACTOR_FAILURE]: unknown };
}

function watchActor(role: ActorRole, promise: Promise<unknown>): ActorWatch {
  const watch: ActorWatch = { role, status: "pending" };
  void promise.then(
    (value) => {
      watch.status = "fulfilled";
      watch.value = value;
    },
    (error: unknown) => {
      watch.status = "rejected";
      watch.error = error;
    }
  );
  return watch;
}

function prematureActorFailure(watches: readonly ActorWatch[]): unknown | null {
  for (const watch of watches) {
    if (watch.status === "rejected") return watch.error;
  }
  for (const watch of watches) {
    if (watch.status !== "fulfilled") continue;
    if (watch.value && typeof watch.value === "object"
      && ACTOR_FAILURE in watch.value) {
      return (watch.value as { [ACTOR_FAILURE]: unknown })[ACTOR_FAILURE];
    }
  }
  const settled = watches.find((watch) => watch.status === "fulfilled");
  if (!settled) return null;
  const kind = settled.value && typeof settled.value === "object"
    && "kind" in settled.value && typeof settled.value.kind === "string"
    ? settled.value.kind
    : "unknown";
  return new Error(
    `${settled.role} settled before the expected lock wait was observed (${kind})`
  );
}

const actorFailureSentinel = new Error("actor-failure-sentinel");
assert.equal(prematureActorFailure([{
  role: "waiter",
  status: "fulfilled",
  value: rolledBackActorResult(actorFailureSentinel, "fixture-conflict")
}]), actorFailureSentinel);
assert.match((prematureActorFailure([{
  role: "holder", status: "fulfilled", value: { kind: "committed" }
}]) as Error).message, /holder settled.*committed/u);

function errorCode(error: unknown): unknown {
  const response = (error as { getResponse?: () => unknown }).getResponse?.();
  return response && (response as { errorCode?: unknown }).errorCode;
}

function databaseCode(error: unknown): unknown {
  const value = error as { code?: unknown; driverError?: { code?: unknown } };
  return value.code ?? value.driverError?.code;
}

function exactReturningRows<Row>(value: unknown): Row[] {
  assert.ok(Array.isArray(value));
  if (Array.isArray(value[0])) {
    assert.equal(value.length, 2);
    assert.equal(value[0].length, value[1]);
    return value[0] as Row[];
  }
  return value as Row[];
}

function recordSecondaryCleanupErrors(primaryError: unknown, errors: readonly unknown[]): void {
  if (!(primaryError instanceof Error)) return;
  const existing = (primaryError as Error & { secondaryCleanupErrors?: readonly unknown[] })
    .secondaryCleanupErrors ?? [];
  Object.defineProperty(primaryError, "secondaryCleanupErrors", {
    configurable: true,
    enumerable: false,
    value: [...existing, ...errors]
  });
}

async function assertSettledOperations(
  label: string,
  operations: readonly Promise<unknown>[],
  primaryError: unknown | null = null,
  primaryWillPropagate = true
): Promise<void> {
  const results = await Promise.allSettled(operations);
  const errors = results.flatMap((result) =>
    result.status === "rejected" ? [result.reason] : []
  );
  if (errors.length === 0) return;
  if (primaryError !== null) {
    recordSecondaryCleanupErrors(primaryError, errors);
    if (primaryWillPropagate) return;
    const combined = new AggregateError([primaryError, ...errors], `${label} failed`);
    Object.defineProperty(combined, "cause", { value: primaryError });
    throw combined;
  }
  throw new AggregateError(errors, `${label} failed`);
}

type CoordinatorLatch = "after-first-lock" | "lock-before-ready" | "waiter-started";

function createConcurrencyCoordinator() {
  const absoluteDeadline = Date.now() + 10_000;
  const latches = new Map<CoordinatorLatch, {
    promise: Promise<void>;
    resolve: () => void;
  }>();
  for (const name of [
    "after-first-lock", "lock-before-ready", "waiter-started"
  ] as const) {
    let resolve: () => void = () => {};
    const promise = new Promise<void>((done) => { resolve = done; });
    latches.set(name, { promise, resolve });
  }
  return {
    signal(name: CoordinatorLatch): void {
      latches.get(name)!.resolve();
    },
    wait(name: CoordinatorLatch): Promise<void> {
      return withAbsoluteDeadline(
        latches.get(name)!.promise,
        absoluteDeadline,
        `coordinator:${name}`
      );
    }
  };
}

function withAbsoluteDeadline<T>(
  promise: Promise<T>,
  absoluteDeadline: number,
  label: string
): Promise<T> {
  const remaining = absoluteDeadline - Date.now();
  if (remaining <= 0) return Promise.reject(new Error(`${label} deadline exceeded`));
  return new Promise<T>((resolve, reject) => {
    const watchdog = setTimeout(
      () => reject(new Error(`${label} deadline exceeded`)),
      remaining
    );
    promise.then(
      (value) => { clearTimeout(watchdog); resolve(value); },
      (error: unknown) => { clearTimeout(watchdog); reject(error); }
    );
  });
}

type C4MatrixCase = {
  key: string;
  family: "shared-fence" | "rebuild-fence";
  actionKey: string;
  terminalKey?: string;
  order: "command-first" | "terminal-first" | "rebuild-first"
    | "action-first-stale-N" | "action-first-current-N-plus-1";
  holderIsolation: "READ COMMITTED" | "SERIALIZABLE";
  waiterIsolation: "READ COMMITTED" | "SERIALIZABLE";
  expectedOutcome: "one-winner" | "two-success" | "stale-conflict";
  coordination: "pg-lock-wait" | "post-commit-latch";
};

type C4FixtureOperationContext = {
  operation: "command" | "terminal" | "rebuild" | "read";
  terminal?: "closed" | "cancelled";
  sourceMutation?: "apply-terminal" | "observe-only";
  sourceVersion?: number;
  outcomeCode?: string;
  outcomeAt?: string;
  beforeSourceLock?: (evidence: C4FixtureSourceLockEvidence) => void | Promise<void>;
  afterSourceLock?: (evidence: C4FixtureSourceLockEvidence) => void | Promise<void>;
  beforeProjectionLock?: (evidence: C4FixtureSourceLockEvidence) => void;
  afterProjectionLock?: (evidence: C4FixtureSourceLockEvidence) => void | Promise<void>;
  receiptAccess?: C4ReceiptAccessEvidence;
  lateFailure?: "projection" | "receipt-complete";
  lateFailureEvidence?: {
    projectionReplaceCompleted: boolean;
    receiptCompleteCompleted: boolean;
  };
};

type C4ReceiptAccessEvidence = {
  executeOrReplay: number;
  existingOnly: number;
  total: number;
};

type C4FixtureSourceLockEvidence = {
  pid: number;
  lockKey: string;
};

type C4FixtureSourceRow = {
  sourceId: string;
  sourceVersion: number;
  lifecycle: "eligible" | "succeeded" | "cancelled";
  outcomeCode: string | null;
  outcomeAt: Date | string | null;
  businessOccurrenceKey: string;
  title: string;
};

const c4FixtureOperationStorage =
  new AsyncLocalStorage<C4FixtureOperationContext>();

const C4_CROSS_OPERATION_MATRIX_MANIFEST_JSON = String.raw`[
  {
    "key": "shared-fence:claim-open:terminal-open-closed:command-first",
    "family": "shared-fence",
    "actionKey": "claim-open",
    "terminalKey": "terminal-open-closed",
    "order": "command-first",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "READ COMMITTED",
    "expectedOutcome": "one-winner",
    "coordination": "pg-lock-wait"
  },
  {
    "key": "shared-fence:claim-open:terminal-open-closed:terminal-first",
    "family": "shared-fence",
    "actionKey": "claim-open",
    "terminalKey": "terminal-open-closed",
    "order": "terminal-first",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "READ COMMITTED",
    "expectedOutcome": "one-winner",
    "coordination": "pg-lock-wait"
  },
  {
    "key": "shared-fence:claim-open:terminal-open-cancelled:command-first",
    "family": "shared-fence",
    "actionKey": "claim-open",
    "terminalKey": "terminal-open-cancelled",
    "order": "command-first",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "READ COMMITTED",
    "expectedOutcome": "one-winner",
    "coordination": "pg-lock-wait"
  },
  {
    "key": "shared-fence:claim-open:terminal-open-cancelled:terminal-first",
    "family": "shared-fence",
    "actionKey": "claim-open",
    "terminalKey": "terminal-open-cancelled",
    "order": "terminal-first",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "READ COMMITTED",
    "expectedOutcome": "one-winner",
    "coordination": "pg-lock-wait"
  },
  {
    "key": "shared-fence:start-claimed:terminal-claimed-closed:command-first",
    "family": "shared-fence",
    "actionKey": "start-claimed",
    "terminalKey": "terminal-claimed-closed",
    "order": "command-first",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "READ COMMITTED",
    "expectedOutcome": "one-winner",
    "coordination": "pg-lock-wait"
  },
  {
    "key": "shared-fence:start-claimed:terminal-claimed-closed:terminal-first",
    "family": "shared-fence",
    "actionKey": "start-claimed",
    "terminalKey": "terminal-claimed-closed",
    "order": "terminal-first",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "READ COMMITTED",
    "expectedOutcome": "one-winner",
    "coordination": "pg-lock-wait"
  },
  {
    "key": "shared-fence:start-claimed:terminal-claimed-cancelled:command-first",
    "family": "shared-fence",
    "actionKey": "start-claimed",
    "terminalKey": "terminal-claimed-cancelled",
    "order": "command-first",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "READ COMMITTED",
    "expectedOutcome": "one-winner",
    "coordination": "pg-lock-wait"
  },
  {
    "key": "shared-fence:start-claimed:terminal-claimed-cancelled:terminal-first",
    "family": "shared-fence",
    "actionKey": "start-claimed",
    "terminalKey": "terminal-claimed-cancelled",
    "order": "terminal-first",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "READ COMMITTED",
    "expectedOutcome": "one-winner",
    "coordination": "pg-lock-wait"
  },
  {
    "key": "shared-fence:block-in-progress:terminal-in-progress-closed:command-first",
    "family": "shared-fence",
    "actionKey": "block-in-progress",
    "terminalKey": "terminal-in-progress-closed",
    "order": "command-first",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "READ COMMITTED",
    "expectedOutcome": "one-winner",
    "coordination": "pg-lock-wait"
  },
  {
    "key": "shared-fence:block-in-progress:terminal-in-progress-closed:terminal-first",
    "family": "shared-fence",
    "actionKey": "block-in-progress",
    "terminalKey": "terminal-in-progress-closed",
    "order": "terminal-first",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "READ COMMITTED",
    "expectedOutcome": "one-winner",
    "coordination": "pg-lock-wait"
  },
  {
    "key": "shared-fence:block-in-progress:terminal-in-progress-cancelled:command-first",
    "family": "shared-fence",
    "actionKey": "block-in-progress",
    "terminalKey": "terminal-in-progress-cancelled",
    "order": "command-first",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "READ COMMITTED",
    "expectedOutcome": "one-winner",
    "coordination": "pg-lock-wait"
  },
  {
    "key": "shared-fence:block-in-progress:terminal-in-progress-cancelled:terminal-first",
    "family": "shared-fence",
    "actionKey": "block-in-progress",
    "terminalKey": "terminal-in-progress-cancelled",
    "order": "terminal-first",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "READ COMMITTED",
    "expectedOutcome": "one-winner",
    "coordination": "pg-lock-wait"
  },
  {
    "key": "shared-fence:unblock-blocked:terminal-blocked-closed:command-first",
    "family": "shared-fence",
    "actionKey": "unblock-blocked",
    "terminalKey": "terminal-blocked-closed",
    "order": "command-first",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "READ COMMITTED",
    "expectedOutcome": "one-winner",
    "coordination": "pg-lock-wait"
  },
  {
    "key": "shared-fence:unblock-blocked:terminal-blocked-closed:terminal-first",
    "family": "shared-fence",
    "actionKey": "unblock-blocked",
    "terminalKey": "terminal-blocked-closed",
    "order": "terminal-first",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "READ COMMITTED",
    "expectedOutcome": "one-winner",
    "coordination": "pg-lock-wait"
  },
  {
    "key": "shared-fence:unblock-blocked:terminal-blocked-cancelled:command-first",
    "family": "shared-fence",
    "actionKey": "unblock-blocked",
    "terminalKey": "terminal-blocked-cancelled",
    "order": "command-first",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "READ COMMITTED",
    "expectedOutcome": "one-winner",
    "coordination": "pg-lock-wait"
  },
  {
    "key": "shared-fence:unblock-blocked:terminal-blocked-cancelled:terminal-first",
    "family": "shared-fence",
    "actionKey": "unblock-blocked",
    "terminalKey": "terminal-blocked-cancelled",
    "order": "terminal-first",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "READ COMMITTED",
    "expectedOutcome": "one-winner",
    "coordination": "pg-lock-wait"
  },
  {
    "key": "shared-fence:release-claimed:terminal-claimed-closed:command-first",
    "family": "shared-fence",
    "actionKey": "release-claimed",
    "terminalKey": "terminal-claimed-closed",
    "order": "command-first",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "READ COMMITTED",
    "expectedOutcome": "one-winner",
    "coordination": "pg-lock-wait"
  },
  {
    "key": "shared-fence:release-claimed:terminal-claimed-closed:terminal-first",
    "family": "shared-fence",
    "actionKey": "release-claimed",
    "terminalKey": "terminal-claimed-closed",
    "order": "terminal-first",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "READ COMMITTED",
    "expectedOutcome": "one-winner",
    "coordination": "pg-lock-wait"
  },
  {
    "key": "shared-fence:release-claimed:terminal-claimed-cancelled:command-first",
    "family": "shared-fence",
    "actionKey": "release-claimed",
    "terminalKey": "terminal-claimed-cancelled",
    "order": "command-first",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "READ COMMITTED",
    "expectedOutcome": "one-winner",
    "coordination": "pg-lock-wait"
  },
  {
    "key": "shared-fence:release-claimed:terminal-claimed-cancelled:terminal-first",
    "family": "shared-fence",
    "actionKey": "release-claimed",
    "terminalKey": "terminal-claimed-cancelled",
    "order": "terminal-first",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "READ COMMITTED",
    "expectedOutcome": "one-winner",
    "coordination": "pg-lock-wait"
  },
  {
    "key": "shared-fence:release-in-progress:terminal-in-progress-closed:command-first",
    "family": "shared-fence",
    "actionKey": "release-in-progress",
    "terminalKey": "terminal-in-progress-closed",
    "order": "command-first",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "READ COMMITTED",
    "expectedOutcome": "one-winner",
    "coordination": "pg-lock-wait"
  },
  {
    "key": "shared-fence:release-in-progress:terminal-in-progress-closed:terminal-first",
    "family": "shared-fence",
    "actionKey": "release-in-progress",
    "terminalKey": "terminal-in-progress-closed",
    "order": "terminal-first",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "READ COMMITTED",
    "expectedOutcome": "one-winner",
    "coordination": "pg-lock-wait"
  },
  {
    "key": "shared-fence:release-in-progress:terminal-in-progress-cancelled:command-first",
    "family": "shared-fence",
    "actionKey": "release-in-progress",
    "terminalKey": "terminal-in-progress-cancelled",
    "order": "command-first",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "READ COMMITTED",
    "expectedOutcome": "one-winner",
    "coordination": "pg-lock-wait"
  },
  {
    "key": "shared-fence:release-in-progress:terminal-in-progress-cancelled:terminal-first",
    "family": "shared-fence",
    "actionKey": "release-in-progress",
    "terminalKey": "terminal-in-progress-cancelled",
    "order": "terminal-first",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "READ COMMITTED",
    "expectedOutcome": "one-winner",
    "coordination": "pg-lock-wait"
  },
  {
    "key": "shared-fence:release-blocked:terminal-blocked-closed:command-first",
    "family": "shared-fence",
    "actionKey": "release-blocked",
    "terminalKey": "terminal-blocked-closed",
    "order": "command-first",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "READ COMMITTED",
    "expectedOutcome": "one-winner",
    "coordination": "pg-lock-wait"
  },
  {
    "key": "shared-fence:release-blocked:terminal-blocked-closed:terminal-first",
    "family": "shared-fence",
    "actionKey": "release-blocked",
    "terminalKey": "terminal-blocked-closed",
    "order": "terminal-first",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "READ COMMITTED",
    "expectedOutcome": "one-winner",
    "coordination": "pg-lock-wait"
  },
  {
    "key": "shared-fence:release-blocked:terminal-blocked-cancelled:command-first",
    "family": "shared-fence",
    "actionKey": "release-blocked",
    "terminalKey": "terminal-blocked-cancelled",
    "order": "command-first",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "READ COMMITTED",
    "expectedOutcome": "one-winner",
    "coordination": "pg-lock-wait"
  },
  {
    "key": "shared-fence:release-blocked:terminal-blocked-cancelled:terminal-first",
    "family": "shared-fence",
    "actionKey": "release-blocked",
    "terminalKey": "terminal-blocked-cancelled",
    "order": "terminal-first",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "READ COMMITTED",
    "expectedOutcome": "one-winner",
    "coordination": "pg-lock-wait"
  },
  {
    "key": "rebuild-fence:claim-open:rebuild-first",
    "family": "rebuild-fence",
    "actionKey": "claim-open",
    "order": "rebuild-first",
    "holderIsolation": "SERIALIZABLE",
    "waiterIsolation": "READ COMMITTED",
    "expectedOutcome": "two-success",
    "coordination": "pg-lock-wait"
  },
  {
    "key": "rebuild-fence:claim-open:action-first-stale-N",
    "family": "rebuild-fence",
    "actionKey": "claim-open",
    "order": "action-first-stale-N",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "SERIALIZABLE",
    "expectedOutcome": "stale-conflict",
    "coordination": "post-commit-latch"
  },
  {
    "key": "rebuild-fence:claim-open:action-first-current-N-plus-1",
    "family": "rebuild-fence",
    "actionKey": "claim-open",
    "order": "action-first-current-N-plus-1",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "SERIALIZABLE",
    "expectedOutcome": "two-success",
    "coordination": "post-commit-latch"
  },
  {
    "key": "rebuild-fence:start-claimed:rebuild-first",
    "family": "rebuild-fence",
    "actionKey": "start-claimed",
    "order": "rebuild-first",
    "holderIsolation": "SERIALIZABLE",
    "waiterIsolation": "READ COMMITTED",
    "expectedOutcome": "two-success",
    "coordination": "pg-lock-wait"
  },
  {
    "key": "rebuild-fence:start-claimed:action-first-stale-N",
    "family": "rebuild-fence",
    "actionKey": "start-claimed",
    "order": "action-first-stale-N",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "SERIALIZABLE",
    "expectedOutcome": "stale-conflict",
    "coordination": "post-commit-latch"
  },
  {
    "key": "rebuild-fence:start-claimed:action-first-current-N-plus-1",
    "family": "rebuild-fence",
    "actionKey": "start-claimed",
    "order": "action-first-current-N-plus-1",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "SERIALIZABLE",
    "expectedOutcome": "two-success",
    "coordination": "post-commit-latch"
  },
  {
    "key": "rebuild-fence:block-in-progress:rebuild-first",
    "family": "rebuild-fence",
    "actionKey": "block-in-progress",
    "order": "rebuild-first",
    "holderIsolation": "SERIALIZABLE",
    "waiterIsolation": "READ COMMITTED",
    "expectedOutcome": "two-success",
    "coordination": "pg-lock-wait"
  },
  {
    "key": "rebuild-fence:block-in-progress:action-first-stale-N",
    "family": "rebuild-fence",
    "actionKey": "block-in-progress",
    "order": "action-first-stale-N",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "SERIALIZABLE",
    "expectedOutcome": "stale-conflict",
    "coordination": "post-commit-latch"
  },
  {
    "key": "rebuild-fence:block-in-progress:action-first-current-N-plus-1",
    "family": "rebuild-fence",
    "actionKey": "block-in-progress",
    "order": "action-first-current-N-plus-1",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "SERIALIZABLE",
    "expectedOutcome": "two-success",
    "coordination": "post-commit-latch"
  },
  {
    "key": "rebuild-fence:unblock-blocked:rebuild-first",
    "family": "rebuild-fence",
    "actionKey": "unblock-blocked",
    "order": "rebuild-first",
    "holderIsolation": "SERIALIZABLE",
    "waiterIsolation": "READ COMMITTED",
    "expectedOutcome": "two-success",
    "coordination": "pg-lock-wait"
  },
  {
    "key": "rebuild-fence:unblock-blocked:action-first-stale-N",
    "family": "rebuild-fence",
    "actionKey": "unblock-blocked",
    "order": "action-first-stale-N",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "SERIALIZABLE",
    "expectedOutcome": "stale-conflict",
    "coordination": "post-commit-latch"
  },
  {
    "key": "rebuild-fence:unblock-blocked:action-first-current-N-plus-1",
    "family": "rebuild-fence",
    "actionKey": "unblock-blocked",
    "order": "action-first-current-N-plus-1",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "SERIALIZABLE",
    "expectedOutcome": "two-success",
    "coordination": "post-commit-latch"
  },
  {
    "key": "rebuild-fence:release-claimed:rebuild-first",
    "family": "rebuild-fence",
    "actionKey": "release-claimed",
    "order": "rebuild-first",
    "holderIsolation": "SERIALIZABLE",
    "waiterIsolation": "READ COMMITTED",
    "expectedOutcome": "two-success",
    "coordination": "pg-lock-wait"
  },
  {
    "key": "rebuild-fence:release-claimed:action-first-stale-N",
    "family": "rebuild-fence",
    "actionKey": "release-claimed",
    "order": "action-first-stale-N",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "SERIALIZABLE",
    "expectedOutcome": "stale-conflict",
    "coordination": "post-commit-latch"
  },
  {
    "key": "rebuild-fence:release-claimed:action-first-current-N-plus-1",
    "family": "rebuild-fence",
    "actionKey": "release-claimed",
    "order": "action-first-current-N-plus-1",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "SERIALIZABLE",
    "expectedOutcome": "two-success",
    "coordination": "post-commit-latch"
  },
  {
    "key": "rebuild-fence:release-in-progress:rebuild-first",
    "family": "rebuild-fence",
    "actionKey": "release-in-progress",
    "order": "rebuild-first",
    "holderIsolation": "SERIALIZABLE",
    "waiterIsolation": "READ COMMITTED",
    "expectedOutcome": "two-success",
    "coordination": "pg-lock-wait"
  },
  {
    "key": "rebuild-fence:release-in-progress:action-first-stale-N",
    "family": "rebuild-fence",
    "actionKey": "release-in-progress",
    "order": "action-first-stale-N",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "SERIALIZABLE",
    "expectedOutcome": "stale-conflict",
    "coordination": "post-commit-latch"
  },
  {
    "key": "rebuild-fence:release-in-progress:action-first-current-N-plus-1",
    "family": "rebuild-fence",
    "actionKey": "release-in-progress",
    "order": "action-first-current-N-plus-1",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "SERIALIZABLE",
    "expectedOutcome": "two-success",
    "coordination": "post-commit-latch"
  },
  {
    "key": "rebuild-fence:release-blocked:rebuild-first",
    "family": "rebuild-fence",
    "actionKey": "release-blocked",
    "order": "rebuild-first",
    "holderIsolation": "SERIALIZABLE",
    "waiterIsolation": "READ COMMITTED",
    "expectedOutcome": "two-success",
    "coordination": "pg-lock-wait"
  },
  {
    "key": "rebuild-fence:release-blocked:action-first-stale-N",
    "family": "rebuild-fence",
    "actionKey": "release-blocked",
    "order": "action-first-stale-N",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "SERIALIZABLE",
    "expectedOutcome": "stale-conflict",
    "coordination": "post-commit-latch"
  },
  {
    "key": "rebuild-fence:release-blocked:action-first-current-N-plus-1",
    "family": "rebuild-fence",
    "actionKey": "release-blocked",
    "order": "action-first-current-N-plus-1",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "SERIALIZABLE",
    "expectedOutcome": "two-success",
    "coordination": "post-commit-latch"
  },
  {
    "key": "rebuild-fence:terminal-open-closed:rebuild-first",
    "family": "rebuild-fence",
    "actionKey": "terminal-open-closed",
    "order": "rebuild-first",
    "holderIsolation": "SERIALIZABLE",
    "waiterIsolation": "READ COMMITTED",
    "expectedOutcome": "two-success",
    "coordination": "pg-lock-wait"
  },
  {
    "key": "rebuild-fence:terminal-open-closed:action-first-stale-N",
    "family": "rebuild-fence",
    "actionKey": "terminal-open-closed",
    "order": "action-first-stale-N",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "SERIALIZABLE",
    "expectedOutcome": "stale-conflict",
    "coordination": "post-commit-latch"
  },
  {
    "key": "rebuild-fence:terminal-open-closed:action-first-current-N-plus-1",
    "family": "rebuild-fence",
    "actionKey": "terminal-open-closed",
    "order": "action-first-current-N-plus-1",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "SERIALIZABLE",
    "expectedOutcome": "two-success",
    "coordination": "post-commit-latch"
  },
  {
    "key": "rebuild-fence:terminal-claimed-closed:rebuild-first",
    "family": "rebuild-fence",
    "actionKey": "terminal-claimed-closed",
    "order": "rebuild-first",
    "holderIsolation": "SERIALIZABLE",
    "waiterIsolation": "READ COMMITTED",
    "expectedOutcome": "two-success",
    "coordination": "pg-lock-wait"
  },
  {
    "key": "rebuild-fence:terminal-claimed-closed:action-first-stale-N",
    "family": "rebuild-fence",
    "actionKey": "terminal-claimed-closed",
    "order": "action-first-stale-N",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "SERIALIZABLE",
    "expectedOutcome": "stale-conflict",
    "coordination": "post-commit-latch"
  },
  {
    "key": "rebuild-fence:terminal-claimed-closed:action-first-current-N-plus-1",
    "family": "rebuild-fence",
    "actionKey": "terminal-claimed-closed",
    "order": "action-first-current-N-plus-1",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "SERIALIZABLE",
    "expectedOutcome": "two-success",
    "coordination": "post-commit-latch"
  },
  {
    "key": "rebuild-fence:terminal-in-progress-closed:rebuild-first",
    "family": "rebuild-fence",
    "actionKey": "terminal-in-progress-closed",
    "order": "rebuild-first",
    "holderIsolation": "SERIALIZABLE",
    "waiterIsolation": "READ COMMITTED",
    "expectedOutcome": "two-success",
    "coordination": "pg-lock-wait"
  },
  {
    "key": "rebuild-fence:terminal-in-progress-closed:action-first-stale-N",
    "family": "rebuild-fence",
    "actionKey": "terminal-in-progress-closed",
    "order": "action-first-stale-N",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "SERIALIZABLE",
    "expectedOutcome": "stale-conflict",
    "coordination": "post-commit-latch"
  },
  {
    "key": "rebuild-fence:terminal-in-progress-closed:action-first-current-N-plus-1",
    "family": "rebuild-fence",
    "actionKey": "terminal-in-progress-closed",
    "order": "action-first-current-N-plus-1",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "SERIALIZABLE",
    "expectedOutcome": "two-success",
    "coordination": "post-commit-latch"
  },
  {
    "key": "rebuild-fence:terminal-blocked-closed:rebuild-first",
    "family": "rebuild-fence",
    "actionKey": "terminal-blocked-closed",
    "order": "rebuild-first",
    "holderIsolation": "SERIALIZABLE",
    "waiterIsolation": "READ COMMITTED",
    "expectedOutcome": "two-success",
    "coordination": "pg-lock-wait"
  },
  {
    "key": "rebuild-fence:terminal-blocked-closed:action-first-stale-N",
    "family": "rebuild-fence",
    "actionKey": "terminal-blocked-closed",
    "order": "action-first-stale-N",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "SERIALIZABLE",
    "expectedOutcome": "stale-conflict",
    "coordination": "post-commit-latch"
  },
  {
    "key": "rebuild-fence:terminal-blocked-closed:action-first-current-N-plus-1",
    "family": "rebuild-fence",
    "actionKey": "terminal-blocked-closed",
    "order": "action-first-current-N-plus-1",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "SERIALIZABLE",
    "expectedOutcome": "two-success",
    "coordination": "post-commit-latch"
  },
  {
    "key": "rebuild-fence:terminal-open-cancelled:rebuild-first",
    "family": "rebuild-fence",
    "actionKey": "terminal-open-cancelled",
    "order": "rebuild-first",
    "holderIsolation": "SERIALIZABLE",
    "waiterIsolation": "READ COMMITTED",
    "expectedOutcome": "two-success",
    "coordination": "pg-lock-wait"
  },
  {
    "key": "rebuild-fence:terminal-open-cancelled:action-first-stale-N",
    "family": "rebuild-fence",
    "actionKey": "terminal-open-cancelled",
    "order": "action-first-stale-N",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "SERIALIZABLE",
    "expectedOutcome": "stale-conflict",
    "coordination": "post-commit-latch"
  },
  {
    "key": "rebuild-fence:terminal-open-cancelled:action-first-current-N-plus-1",
    "family": "rebuild-fence",
    "actionKey": "terminal-open-cancelled",
    "order": "action-first-current-N-plus-1",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "SERIALIZABLE",
    "expectedOutcome": "two-success",
    "coordination": "post-commit-latch"
  },
  {
    "key": "rebuild-fence:terminal-claimed-cancelled:rebuild-first",
    "family": "rebuild-fence",
    "actionKey": "terminal-claimed-cancelled",
    "order": "rebuild-first",
    "holderIsolation": "SERIALIZABLE",
    "waiterIsolation": "READ COMMITTED",
    "expectedOutcome": "two-success",
    "coordination": "pg-lock-wait"
  },
  {
    "key": "rebuild-fence:terminal-claimed-cancelled:action-first-stale-N",
    "family": "rebuild-fence",
    "actionKey": "terminal-claimed-cancelled",
    "order": "action-first-stale-N",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "SERIALIZABLE",
    "expectedOutcome": "stale-conflict",
    "coordination": "post-commit-latch"
  },
  {
    "key": "rebuild-fence:terminal-claimed-cancelled:action-first-current-N-plus-1",
    "family": "rebuild-fence",
    "actionKey": "terminal-claimed-cancelled",
    "order": "action-first-current-N-plus-1",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "SERIALIZABLE",
    "expectedOutcome": "two-success",
    "coordination": "post-commit-latch"
  },
  {
    "key": "rebuild-fence:terminal-in-progress-cancelled:rebuild-first",
    "family": "rebuild-fence",
    "actionKey": "terminal-in-progress-cancelled",
    "order": "rebuild-first",
    "holderIsolation": "SERIALIZABLE",
    "waiterIsolation": "READ COMMITTED",
    "expectedOutcome": "two-success",
    "coordination": "pg-lock-wait"
  },
  {
    "key": "rebuild-fence:terminal-in-progress-cancelled:action-first-stale-N",
    "family": "rebuild-fence",
    "actionKey": "terminal-in-progress-cancelled",
    "order": "action-first-stale-N",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "SERIALIZABLE",
    "expectedOutcome": "stale-conflict",
    "coordination": "post-commit-latch"
  },
  {
    "key": "rebuild-fence:terminal-in-progress-cancelled:action-first-current-N-plus-1",
    "family": "rebuild-fence",
    "actionKey": "terminal-in-progress-cancelled",
    "order": "action-first-current-N-plus-1",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "SERIALIZABLE",
    "expectedOutcome": "two-success",
    "coordination": "post-commit-latch"
  },
  {
    "key": "rebuild-fence:terminal-blocked-cancelled:rebuild-first",
    "family": "rebuild-fence",
    "actionKey": "terminal-blocked-cancelled",
    "order": "rebuild-first",
    "holderIsolation": "SERIALIZABLE",
    "waiterIsolation": "READ COMMITTED",
    "expectedOutcome": "two-success",
    "coordination": "pg-lock-wait"
  },
  {
    "key": "rebuild-fence:terminal-blocked-cancelled:action-first-stale-N",
    "family": "rebuild-fence",
    "actionKey": "terminal-blocked-cancelled",
    "order": "action-first-stale-N",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "SERIALIZABLE",
    "expectedOutcome": "stale-conflict",
    "coordination": "post-commit-latch"
  },
  {
    "key": "rebuild-fence:terminal-blocked-cancelled:action-first-current-N-plus-1",
    "family": "rebuild-fence",
    "actionKey": "terminal-blocked-cancelled",
    "order": "action-first-current-N-plus-1",
    "holderIsolation": "READ COMMITTED",
    "waiterIsolation": "SERIALIZABLE",
    "expectedOutcome": "two-success",
    "coordination": "post-commit-latch"
  }
]`;
const C4_CROSS_OPERATION_MATRIX_MANIFEST = Object.freeze(
  JSON.parse(C4_CROSS_OPERATION_MATRIX_MANIFEST_JSON) as C4MatrixCase[]
);
assert.equal(C4_CROSS_OPERATION_MATRIX_MANIFEST.length, 73);
assert.equal(new Set(C4_CROSS_OPERATION_MATRIX_MANIFEST.map(({ key }) => key)).size, 73);
assert.equal(C4_CROSS_OPERATION_MATRIX_MANIFEST.filter(
  ({ coordination }) => coordination === "pg-lock-wait"
).length, 43);
assert.equal(C4_CROSS_OPERATION_MATRIX_MANIFEST.filter(
  ({ coordination }) => coordination === "post-commit-latch"
).length, 30);


suite("C4 property task PostgreSQL 16 runtime gate", { concurrency: false }, () => {
  let dataSource: DataSource;
  let assignments: PropertyTaskAssignmentRepository;
  let projections: PropertyTaskProjectionRepository;
  let receipts: DatabasePropertyMutationReceiptAdapter;
  let propertyTaskRuntime: ReturnType<typeof createPropertyTaskRuntime>;
  let tenantId = randomUUID();
  let parkId = randomUUID();
  let scope = { tenantId, parkId };
  let actorId = randomUUID();
  const actorDisplay = "C4 Fixture Operator";
  let actor: JwtPrincipal = {
    sub: actorId,
    username: `c4_${actorId.replaceAll("-", "")}`,
    realName: actorDisplay,
    tenantId,
    parkId,
    roles: [],
    permissions: []
  };
  type CommandMatrixCase = {
    key: string;
    kind: "command";
    action: PropertyTaskAction;
    initialStatus: "open" | "claimed" | "in_progress" | "blocked";
    finalStatus: PropertyTaskStatus;
  };
  type TerminalMatrixCase = {
    key: string;
    kind: "terminal";
    terminal: "closed" | "cancelled";
    initialStatus: "open" | "claimed" | "in_progress" | "blocked";
    finalStatus: "closed" | "cancelled";
  };
  const commandMatrixCases: readonly CommandMatrixCase[] = [
    { key: "claim-open", kind: "command", action: "property.task.claim",
      initialStatus: "open", finalStatus: "claimed" },
    { key: "start-claimed", kind: "command", action: "property.task.start",
      initialStatus: "claimed", finalStatus: "in_progress" },
    { key: "block-in-progress", kind: "command", action: "property.task.block",
      initialStatus: "in_progress", finalStatus: "blocked" },
    { key: "unblock-blocked", kind: "command", action: "property.task.unblock",
      initialStatus: "blocked", finalStatus: "in_progress" },
    { key: "release-claimed", kind: "command", action: "property.task.release",
      initialStatus: "claimed", finalStatus: "open" },
    { key: "release-in-progress", kind: "command", action: "property.task.release",
      initialStatus: "in_progress", finalStatus: "open" },
    { key: "release-blocked", kind: "command", action: "property.task.release",
      initialStatus: "blocked", finalStatus: "open" }
  ];
  const terminalMatrixCases: readonly TerminalMatrixCase[] = [
    ...(["closed", "cancelled"] as const).flatMap((terminal) =>
      (["open", "claimed", "in_progress", "blocked"] as const).map((status) => ({
        key: `terminal-${status.replaceAll("_", "-")}-${terminal}`,
        kind: "terminal" as const,
        terminal,
        initialStatus: status,
        finalStatus: terminal
      })))
  ];
  assert.equal(commandMatrixCases.length, 7);
  assert.deepEqual([...new Set(commandMatrixCases.map(({ action }) => action))], [
    "property.task.claim", "property.task.start", "property.task.block",
    "property.task.unblock", "property.task.release"
  ], "five command actions require positive and incomplete-envelope negative hash proofs");
  assert.equal(terminalMatrixCases.length, 8);
  function createPropertyTaskRuntime(receiptPort: PropertyMutationReceiptPort = receipts) {
    const resolver = createFixtureResolverProjector();
    const testRegistry = new PropertyTaskSourceRegistry([resolver], "test-fixture");
    const registry = {
      get size() {
        return testRegistry.size;
      },
      resolve(sourceType: string, taskKind: string) {
        return testRegistry.resolve(sourceType, taskKind);
      },
      resolveProjector(sourceType: string, taskKind: string) {
        const candidate = testRegistry.resolve(sourceType, taskKind);
        return candidate && "scanCandidates" in candidate ? resolver : null;
      },
      projectorsForSourceType(sourceType: string) {
        return sourceType === resolver.sourceType ? [resolver] : [];
      }
    } as unknown as PropertyTaskSourceRegistryProvider;
    const access = {
      authorizeTaskRead: async () => true,
      canReadSourceDetails: async () => true,
      authorizeCommand: async (input: {
        sourceLifecycle: "eligible" | "succeeded" | "cancelled";
      }) => input.sourceLifecycle === "eligible"
    } as unknown as PropertyTaskAccessEvaluatorService;
    const observedReceipts = {
      async acquire(
        manager: EntityManager,
        input: PropertyMutationReceiptAcquireInput
      ) {
        const evidence = c4FixtureOperationStorage.getStore()?.receiptAccess;
        if (evidence) {
          evidence.total += 1;
          if (input.acquireMode === "execute-or-replay") evidence.executeOrReplay += 1;
          if (input.acquireMode === "existing-only") evidence.existingOnly += 1;
        }
        return receiptPort.acquire(manager, input);
      },
      async complete(manager: EntityManager, input: PropertyMutationReceiptCompleteInput) {
        await receiptPort.complete(manager, input);
        const context = c4FixtureOperationStorage.getStore();
        if (context?.lateFailure === "receipt-complete") {
          if (context.lateFailureEvidence) {
            context.lateFailureEvidence.receiptCompleteCompleted = true;
          }
          throw new Error("c4-receipt-complete-late-failure");
        }
      }
    };
    const observedProjections = new Proxy(projections, {
      get(target, property, receiver) {
        if (property === "lockSourceProjection") {
          return async (
            ...args: Parameters<PropertyTaskProjectionRepository["lockSourceProjection"]>
          ) => {
            const manager = args[0];
            const context = c4FixtureOperationStorage.getStore();
            const pidRows = await manager.query(
              "SELECT pg_backend_pid()::integer AS pid"
            ) as Array<{ pid: number }>;
            const evidence = {
              pid: pidRows[0]!.pid,
              lockKey: `${args[1].tenantId}:${args[1].parkId}:projection:${args[2]}:${args[3]}`
            };
            context?.beforeProjectionLock?.(evidence);
            const result = await target.lockSourceProjection(...args);
            await context?.afterProjectionLock?.(evidence);
            return result;
          };
        }
        if (property !== "replace") return Reflect.get(target, property, receiver);
        return async (...args: Parameters<PropertyTaskProjectionRepository["replace"]>) => {
          const result = await target.replace(...args);
          const context = c4FixtureOperationStorage.getStore();
          if (context?.lateFailure === "projection") {
            if (context.lateFailureEvidence) {
              context.lateFailureEvidence.projectionReplaceCompleted = true;
            }
            throw new Error("c4-projection-late-failure");
          }
          return result;
        };
      }
    });
    const mapper = new PropertyTaskMapper();
    const orchestrator = new PropertyTaskOrchestrator(
      dataSource, assignments, observedProjections, registry, access, mapper, observedReceipts
    );
    const service = new PropertyTaskService(
      dataSource, observedProjections, registry, access, mapper, orchestrator
    );
    return {
      actor,
      orchestrator,
      service,
      registry,
      resolver,
      runOperation<T>(
        context: C4FixtureOperationContext,
        operation: () => Promise<T>
      ): Promise<T> {
        return c4FixtureOperationStorage.run(context, operation);
      }
    };
  }

  function createFixtureResolverProjector():
  PropertyTaskSourceResolver & PropertyTaskProjectorSource {
    const resolver: PropertyTaskSourceResolver & PropertyTaskProjectorSource = {
      sourceType: "test_fixture_source",
      taskKind: "test_fixture_task",
      assignmentAuthority: "derived",
      access: {
        tag: "workspace",
        sourceType: "test_fixture_source",
        requiredModules: ["test_fixture_module"],
        surfaceId: "test_fixture_surface",
        pagePermission: "test_fixture_page:read",
        queueCode: "test_fixture_queue",
        domainRoute: "/test_fixture_source",
        sourceDetailPermission: "test_fixture_source:read"
      },
      async scanCandidates(input) {
        const manager = input.manager.transactionContext as EntityManager;
        const rows = await manager.query(
          `SELECT source_id::text AS "sourceId",
                  source_version::integer AS "sourceVersion",lifecycle,
                  outcome_code AS "outcomeCode",outcome_at AS "outcomeAt",
                  business_occurrence_key AS "businessOccurrenceKey",title
             FROM c4_property_task_source_fixture
            WHERE tenant_id=$1 AND park_id=$2
              AND ($3::uuid IS NULL OR source_id>$3::uuid
                OR (source_id=$3::uuid
                  AND business_occurrence_key COLLATE "C">$4 COLLATE "C"))
            ORDER BY source_id,business_occurrence_key COLLATE "C"
            LIMIT $5`,
          [input.scope.tenantId, input.scope.parkId, input.after?.sourceId ?? null,
            input.after?.businessOccurrenceKey ?? "", input.limit]
        ) as C4FixtureSourceRow[];
        return {
          items: rows.map(sourceSnapshot),
          next: rows.length === input.limit && rows.length > 0 ? {
            sourceId: rows.at(-1)!.sourceId,
            businessOccurrenceKey: rows.at(-1)!.businessOccurrenceKey
          } : null
        };
      },
      async lockAndResolve(input) {
        const manager = input.manager.transactionContext as EntityManager;
        const context = c4FixtureOperationStorage.getStore();
        await manager.query(WAITER_LOCK_TIMEOUT_SQL);
        await manager.query(ACTOR_STATEMENT_TIMEOUT_SQL);
        await manager.query("SET LOCAL deadlock_timeout='1s'");
        const pidRows = await manager.query(
          "SELECT pg_backend_pid()::integer AS pid"
        ) as Array<{ pid: number }>;
        const lockKey = fixtureSourceLockKey(
          input.scope.tenantId,
          input.scope.parkId,
          resolver.sourceType,
          input.sourceId
        );
        const evidence = { pid: pidRows[0]!.pid, lockKey };
        await context?.beforeSourceLock?.(evidence);
        await manager.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [lockKey]
        );
        await context?.afterSourceLock?.(evidence);
        if (context?.operation === "terminal") {
          if (!context.terminal || !context.sourceMutation || !context.sourceVersion
            || !context.outcomeCode || !context.outcomeAt) {
            throw new Error("c4-terminal-source-context-incomplete");
          }
          if (context.sourceMutation === "apply-terminal") {
            const terminalRows = exactReturningRows<{ sourceVersion: number }>(
              await manager.query(
                `UPDATE c4_property_task_source_fixture
                  SET lifecycle=$5,outcome_code=$6,outcome_at=$7,
                      mutation_count=mutation_count+1
                WHERE tenant_id=$1 AND park_id=$2 AND source_id=$3
                  AND business_occurrence_key=$4 AND source_version=$8
                  AND lifecycle='eligible'
                RETURNING source_version::integer AS "sourceVersion"`,
                [input.scope.tenantId, input.scope.parkId, input.sourceId,
                  input.businessOccurrenceKey,
                  context.terminal === "closed" ? "succeeded" : "cancelled",
                  context.outcomeCode, context.outcomeAt, context.sourceVersion]
              )
            );
            assert.equal(terminalRows.length, 1, "terminal source CAS must affect one row");
            assert.equal(
              terminalRows[0]!.sourceVersion,
              context.sourceVersion,
              "terminal fixture must keep the signed sourceVersion stable"
            );
          }
        }
        const rows = await manager.query(
          `SELECT source_id::text AS "sourceId",
                  source_version::integer AS "sourceVersion",lifecycle,
                  outcome_code AS "outcomeCode",outcome_at AS "outcomeAt",
                  business_occurrence_key AS "businessOccurrenceKey",title
             FROM c4_property_task_source_fixture
            WHERE tenant_id=$1 AND park_id=$2 AND source_id=$3
              AND business_occurrence_key=$4
            FOR UPDATE`,
          [input.scope.tenantId, input.scope.parkId, input.sourceId,
            input.businessOccurrenceKey]
        ) as C4FixtureSourceRow[];
        const row = rows[0];
        if (!row) return null;
        const identity = derivePropertyTaskIdentity({
          sourceType: resolver.sourceType,
          sourceId: row.sourceId,
          taskKind: resolver.taskKind,
          businessOccurrenceKey: row.businessOccurrenceKey
        });
        return identity.taskKey === input.taskKey ? sourceSnapshot(row) : null;
      }
    };
    return resolver;
  }

  function fixtureSourceLockKey(
    fixtureTenantId: string,
    fixtureParkId: string,
    sourceType: string,
    sourceId: string
  ): string {
    return `${fixtureTenantId}:${fixtureParkId}:property-task-source:`
      + `${sourceType}:${sourceId}`;
  }

  function sourceSnapshot(row: C4FixtureSourceRow): PropertyTaskSourceSnapshot {
    return {
      sourceId: row.sourceId,
      sourceVersion: row.sourceVersion,
      lifecycle: row.lifecycle,
      businessOccurrenceKey: row.businessOccurrenceKey,
      title: row.title,
      kindLabel: "Fixture",
      sourceLabel: "Fixture source",
      priority: 10,
      dueAt: null,
      sourceDeepLink: `/test_fixture_source/${row.sourceId}`,
      owningAssignment: null
    };
  }

  before(async () => {
    dataSource = new DataSource({ type: "postgres", url, entities: [] });
    await dataSource.initialize();
    await dataSource.query(
      `CREATE TABLE c4_property_task_source_fixture(
         tenant_id varchar(64) NOT NULL,
         park_id varchar(64) NOT NULL,
         source_id uuid NOT NULL,
         source_version integer NOT NULL,
         lifecycle varchar(32) NOT NULL,
         outcome_code varchar(128),
         outcome_at timestamptz,
         mutation_count integer NOT NULL DEFAULT 0,
         business_occurrence_key varchar(256) NOT NULL,
         title varchar(200) NOT NULL,
         updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
         PRIMARY KEY(tenant_id,park_id,source_id),
         CONSTRAINT ck_c4_property_task_source_lifecycle
           CHECK(lifecycle IN ('eligible','succeeded','cancelled')),
         CONSTRAINT ck_c4_property_task_source_outcome
           CHECK((lifecycle='eligible' AND outcome_code IS NULL AND outcome_at IS NULL)
             OR (lifecycle IN ('succeeded','cancelled')
               AND outcome_code IS NOT NULL AND outcome_at IS NOT NULL)),
         CONSTRAINT ck_c4_property_task_source_mutation_count
           CHECK(mutation_count>=0))`
    );
    await dataSource.query(
      `INSERT INTO sys_user(
         id,tenant_id,park_id,username,display_name,password_hash,is_enabled)
       VALUES($1,$2,$3,$4,$5,$6,true)`,
      [actorId, tenantId, parkId, `c4_${actorId.replaceAll("-", "")}`,
        actorDisplay, "!C4_PROPERTY_TASK_FIXTURE_NO_LOGIN!"]
    );
    assignments = new PropertyTaskAssignmentRepository();
    projections = new PropertyTaskProjectionRepository();
    receipts = new DatabasePropertyMutationReceiptAdapter();
    propertyTaskRuntime = createPropertyTaskRuntime();
  });

  after(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query("DROP TABLE IF EXISTS c4_property_task_source_fixture");
      await dataSource.destroy();
    }
  });

  it("requires PG16 and the exact 000188/000194/000195 runtime objects", async () => {
    assert.equal(propertyTaskRuntime.registry.size, 1);
    assert.ok(propertyTaskRuntime.orchestrator instanceof PropertyTaskOrchestrator);
    assert.ok(propertyTaskRuntime.service instanceof PropertyTaskService);
    const version = await dataSource.query("SHOW server_version_num") as
      Array<{ server_version_num: string }>;
    assert.ok(Number(version[0]!.server_version_num) >= 160000);
    const rows = await dataSource.query(
      `SELECT to_regclass('public.biz_property_task_assignment') IS NOT NULL AS assignment,
              to_regclass('public.biz_property_task_projection_head') IS NOT NULL AS head,
              to_regclass('public.biz_property_task_projection') IS NOT NULL AS projection,
              to_regclass('public.biz_property_mutation_receipt') IS NOT NULL AS receipt,
              to_regprocedure('public.fn_property_task_projection_replace_v1(character varying,character varying,character varying,uuid,uuid,uuid,character varying,character varying,integer,integer,character,character varying,character,character varying,jsonb)') IS NOT NULL AS replace,
              EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name='biz_property_mutation_receipt'
                  AND column_name='receipt_contract_version') AS port_v2`
    ) as Array<Record<string, boolean>>;
    assert.deepEqual(rows[0], {
      assignment: true,
      head: true,
      projection: true,
      receipt: true,
      replace: true,
      port_v2: true
    });
  });

  it("uses one repeatable predicate for filtered list and count", async () => {
    await assert.rejects(dataSource.transaction("REPEATABLE READ", async (manager) => {
      const headId = randomUUID();
      const sourceId = randomUUID();
      await manager.query(
        `INSERT INTO biz_property_task_projection_head(
           id,tenant_id,park_id,source_type,source_id,projection_version,
           content_hash,last_rebuilt_by)
         VALUES($1,$2,$3,'test_fixture_source',$4,1,$5,$6)`,
        [headId, tenantId, parkId, sourceId, hash("a"), actorId]
      );
      for (const [index, status] of ["open", "blocked", "open"].entries()) {
        const blocked = status === "blocked";
        await manager.query(
          `INSERT INTO biz_property_task_projection(
             tenant_id,park_id,head_id,task_id,task_key,assignment_authority,
             derived_assignment_id,source_type,source_id,source_version,
             business_occurrence_key,task_kind,queue_code,title,kind_label,
             source_label,priority,assignment_status,assignment_version,
             assignee_id,assignee_display,claimed_at,started_at,blocked_reason,
             projection_version,content_hash,created_at,updated_at)
           VALUES($1,$2,$3,$4,$5,'owning',NULL,'test_fixture_source',$6,1,
             $7,$8,'test_fixture_queue',$9,'Fixture','Fixture source',10,$10,1,
             $11,$12,$13,$14,$15,1,$16,$17,$17)`,
          [tenantId, parkId, headId, randomUUID(), (index + 1).toString(16).padStart(64, "0"),
            sourceId, `occurrence-${index}`,
            index === 2 ? "other_kind" : "test_fixture_task", `Task ${index}`, status,
            blocked ? actorId : null, blocked ? "Operator" : null,
            blocked ? new Date() : null, blocked ? new Date() : null,
            blocked ? "waiting" : null, hash(String(index + 1)), new Date()]
        );
      }
      const query = Object.assign(new PropertyTaskListQueryDto(), {
        assignmentStatus: "open" as const,
        taskKind: "test_fixture_task",
        sourceType: "test_fixture_source"
      });
      const list = await projections.findCandidates(manager, scope, query);
      const count = await manager.query(
        `SELECT count(*)::integer AS total
           FROM biz_property_task_projection projection
          WHERE projection.tenant_id=$1 AND projection.park_id=$2
            AND projection.assignment_status=$3 AND projection.task_kind=$4
            AND projection.source_type=$5`,
        [tenantId, parkId, query.assignmentStatus, query.taskKind, query.sourceType]
      ) as Array<{ total: number }>;
      assert.equal(list.length, 1);
      assert.equal(count[0]!.total, list.length);
      throw new Error("rollback-list-count-fixture");
    }), /rollback-list-count-fixture/u);
  });

  it("executes all five command CAS transitions with one immutable audit each", async () => {
    await assert.rejects(dataSource.transaction(async (manager) => {
      let row = await insertAssignment(manager, "open");
      const cases: readonly [PropertyTaskAction, PropertyTaskStatus][] = [
        ["property.task.claim", "claimed"],
        ["property.task.start", "in_progress"],
        ["property.task.block", "blocked"],
        ["property.task.unblock", "in_progress"],
        ["property.task.release", "open"]
      ];
      for (const [action, expected] of cases) {
        row = await assignments.transition(manager, {
          scope,
          assignment: row,
          actorId,
          action,
          requestHash: hash("b"),
          reason: action === "property.task.block" ? "fixture block" : "fixture release",
          blockedUntil: null
        });
        assert.equal(row.assignmentStatus, expected);
      }
      assert.equal(row.version, 6);
      const audit = await manager.query(
        `SELECT action_id AS "actionId",from_version AS "fromVersion",
                to_version AS "toVersion"
           FROM biz_property_task_assignment_audit
          WHERE tenant_id=$1 AND park_id=$2 AND assignment_id=$3
          ORDER BY to_version`,
        [tenantId, parkId, row.id]
      ) as Array<{ actionId: string; fromVersion: number; toVersion: number }>;
      assert.equal(audit.length, 5);
      assert.deepEqual(audit.map((item) => item.actionId), cases.map(([action]) => action));
      assert.ok(audit.every((item) => item.toVersion === item.fromVersion + 1));
      throw new Error("rollback-command-fixture");
    }), /rollback-command-fixture/u);
  });

  it("applies closed/cancelled terminal CAS and enforces existing-only replay", async () => {
    await assert.rejects(dataSource.transaction(async (manager) => {
      for (const terminal of ["closed", "cancelled"] as const) {
        const before = await insertAssignment(manager, "open");
        const updated = await assignments.terminal(manager, {
          scope,
          assignment: before,
          actorId,
          terminal,
          outcomeCode: `fixture-${terminal}`,
          outcomeSourceVersion: 2,
          outcomeAt: "2026-08-01T03:00:00.000Z",
          requestHash: hash("d"),
          actionId: `property.task.source-terminal.${terminal}`
        });
        assert.equal(updated.assignmentStatus, terminal);
        assert.equal(updated.version, 2);
        const audit = await manager.query(
          `SELECT action_id AS "actionId",from_version AS "fromVersion",
                  to_version AS "toVersion"
             FROM biz_property_task_assignment_audit
            WHERE tenant_id=$1 AND park_id=$2 AND assignment_id=$3`,
          [tenantId, parkId, updated.id]
        ) as Array<{ actionId: string; fromVersion: number; toVersion: number }>;
        assert.deepEqual(audit, [{
          actionId: `property.task.source-terminal.${terminal}`,
          fromVersion: 1,
          toVersion: 2
        }]);

        const targetId = randomUUID();
        const input = {
          scope,
          contractVersion: PROPERTY_MUTATION_RECEIPT_CONTRACT_VERSION,
          actorId,
          actionId: `property.task.source-terminal.${terminal}`,
          targetId,
          clientKey: `terminal-${terminal}-${randomUUID()}`,
          requestHash: hash(terminal === "closed" ? "e" : "f"),
          identity: {
            tag: "property-task" as const,
            businessOccurrenceKey: `terminal-${terminal}`,
            taskKey: fixtureTaskKey()
          },
          acquireMode: "existing-only" as const
        } as PropertyMutationReceiptAcquireInput;
        await assert.rejects(receipts.acquire(manager, input),
          (error) => errorCode(error) === "property-runtime-unavailable");
        const execute = await receipts.acquire(manager, {
          ...input,
          acquireMode: "execute-or-replay"
        } as PropertyMutationReceiptAcquireInput);
        assert.equal(execute.kind, "execute");
        if (execute.kind !== "execute") continue;
        const resultVersion = 2;
        const resultRef = `property-task-source-terminal/test_fixture_source/${targetId}/${terminal}/v2`;
        const resultHash = await propertyTaskMutationResultHash({
          actionId: input.actionId,
          targetId,
          identity: input.identity,
          resultRef,
          resultVersion
        });
        await receipts.complete(manager, {
          ...input,
          acquireMode: undefined,
          receiptId: execute.receiptId,
          resultRef,
          resultHash,
          resultVersion
        } as unknown as PropertyMutationReceiptCompleteInput);
        const replay = await receipts.acquire(manager, input);
        assert.deepEqual(replay, { kind: "replay", resultRef, resultHash, resultVersion });
      }
      throw new Error("rollback-terminal-fixture");
    }), /rollback-terminal-fixture/u);
  });

  it("supports execute/replay and rolls back an uncompleted started receipt", async () => {
    const input = receiptInput("property.task.claim", randomUUID(), "receipt-replay");
    await assert.rejects(dataSource.transaction(async (manager) => {
      const acquired = await receipts.acquire(manager, input);
      assert.equal(acquired.kind, "execute");
      if (acquired.kind !== "execute") return;
      const resultVersion = 2;
      const resultRef = `property-task/${input.targetId}/v${resultVersion}`;
      const resultHash = await propertyTaskMutationResultHash({
        actionId: input.actionId,
        targetId: input.targetId,
        identity: input.identity,
        resultRef,
        resultVersion
      });
      await receipts.complete(manager, {
        ...input,
        receiptId: acquired.receiptId,
        resultRef,
        resultHash,
        resultVersion
      } as PropertyMutationReceiptCompleteInput);
      const replay = await receipts.acquire(manager, input);
      assert.deepEqual(replay, { kind: "replay", resultRef, resultHash, resultVersion });
      throw new Error("rollback-receipt-fixture");
    }), /rollback-receipt-fixture/u);
    const rows = await dataSource.query(
      `SELECT 1 FROM biz_property_mutation_receipt
        WHERE tenant_id=$1 AND park_id=$2 AND client_key=$3`,
      [tenantId, parkId, input.clientKey]
    ) as unknown[];
    assert.equal(rows.length, 0);
  });

  it("performs manual rebuild then authority-sync with exact set/content hashes", async () => {
    await assert.rejects(dataSource.transaction(async (manager) => {
      const sourceId = randomUUID();
      const taskId = randomUUID();
      const taskKey = fixtureTaskKey();
      const occurrence = `rebuild-${randomUUID()}`;
      const unsigned: Omit<PropertyTaskProjectionWriteRow, "contentHash"> = {
        taskId,
        taskKey,
        assignmentAuthority: "owning",
        derivedAssignmentId: null,
        sourceType: "test_fixture_source",
        sourceId,
        sourceVersion: 1,
        businessOccurrenceKey: occurrence,
        taskKind: "test_fixture_task",
        queueCode: "test_fixture_queue",
        title: "Authoritative rebuild title",
        kindLabel: "Fixture",
        sourceLabel: "Fixture source",
        priority: 10,
        dueAt: null,
        assignmentStatus: "open",
        assignmentVersion: 1,
        assigneeId: null,
        assigneeDisplay: null,
        claimedAt: null,
        startedAt: null,
        blockedReason: null,
        blockedUntil: null,
        outcomeCode: null,
        outcomeSourceVersion: null,
        outcomeAt: null,
        sourceDeepLink: `/test_fixture_source/${sourceId}`,
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z"
      };
      const rowsV1 = await projections.withDatabaseContentHashes(manager, [unsigned]);
      const rebuildInput = {
        scope,
        contractVersion: PROPERTY_MUTATION_RECEIPT_CONTRACT_VERSION,
        actorId,
        actionId: "property.task.rebuild",
        targetId: sourceId,
        clientKey: `rebuild-${randomUUID()}`,
        requestHash: hash("7"),
        identity: { tag: "property-task-source-rebuild" as const,
          sourceType: "test_fixture_source", sourceId },
        acquireMode: "execute-or-replay" as const
      } satisfies PropertyMutationReceiptAcquireInput;
      const rebuildReceipt = await receipts.acquire(manager, rebuildInput);
      assert.equal(rebuildReceipt.kind, "execute");
      if (rebuildReceipt.kind !== "execute") return;
      const rebuildRef = `property-task-rebuild/test_fixture_source/${sourceId}/v1`;
      const rebuildHash = await propertyTaskMutationResultHash({
        actionId: rebuildInput.actionId,
        targetId: sourceId,
        identity: rebuildInput.identity,
        resultRef: rebuildRef,
        resultVersion: 1
      });
      assert.deepEqual(await projections.replace(manager, {
        scope,
        sourceType: "test_fixture_source",
        sourceId,
        actorId,
        receiptId: rebuildReceipt.receiptId,
        replaceMode: "manual-rebuild",
        commandAction: "property.task.rebuild",
        resultVersion: 1,
        expectedProjectionVersion: 0,
        requestHash: rebuildInput.requestHash,
        resultRef: rebuildRef,
        resultHash: rebuildHash,
        reason: "fixture manual rebuild",
        rows: rowsV1
      }), { previousProjectionVersion: 0, projectionVersion: 1,
        projectedTaskCount: 1 });
      await receipts.complete(manager, {
        ...rebuildInput,
        receiptId: rebuildReceipt.receiptId,
        resultRef: rebuildRef,
        resultHash: rebuildHash,
        resultVersion: 1
      } as PropertyMutationReceiptCompleteInput);

      const rowsV2 = await projections.withDatabaseContentHashes(manager, [{
        ...unsigned,
        sourceVersion: 2,
        assignmentStatus: "claimed",
        assignmentVersion: 2,
        assigneeId: actorId,
        assigneeDisplay: "Operator",
        claimedAt: "2026-08-01T01:00:00.000Z",
        updatedAt: "2026-08-01T01:00:00.000Z"
      }]);
      const commandInput = {
        scope,
        contractVersion: PROPERTY_MUTATION_RECEIPT_CONTRACT_VERSION,
        actorId,
        actionId: "property.task.claim",
        targetId: taskId,
        clientKey: `authority-${randomUUID()}`,
        requestHash: hash("8"),
        identity: { tag: "property-task" as const,
          businessOccurrenceKey: occurrence, taskKey },
        acquireMode: "execute-or-replay" as const
      } satisfies PropertyMutationReceiptAcquireInput;
      const commandReceipt = await receipts.acquire(manager, commandInput);
      assert.equal(commandReceipt.kind, "execute");
      if (commandReceipt.kind !== "execute") return;
      const commandRef = `property-task/${taskId}/v2`;
      const commandHash = await propertyTaskMutationResultHash({
        actionId: commandInput.actionId,
        targetId: taskId,
        identity: commandInput.identity,
        resultRef: commandRef,
        resultVersion: 2
      });
      assert.deepEqual(await projections.replace(manager, {
        scope,
        sourceType: "test_fixture_source",
        sourceId,
        actorId,
        receiptId: commandReceipt.receiptId,
        replaceMode: "authority-sync",
        commandAction: "property.task.claim",
        resultVersion: 2,
        expectedProjectionVersion: 1,
        requestHash: commandInput.requestHash,
        resultRef: commandRef,
        resultHash: commandHash,
        reason: "authority-sync:property.task.claim",
        rows: rowsV2
      }), { previousProjectionVersion: 1, projectionVersion: 2,
        projectedTaskCount: 1 });
      const persisted = await manager.query(
        `SELECT h.projection_version AS "projectionVersion",h.content_hash AS "headHash",
                p.task_id::text AS "taskId",p.content_hash AS "rowHash",
                p.assignment_status AS status,p.assignment_version AS version
           FROM biz_property_task_projection_head h
           JOIN biz_property_task_projection p ON p.head_id=h.id
            AND p.tenant_id=h.tenant_id AND p.park_id=h.park_id
          WHERE h.tenant_id=$1 AND h.park_id=$2 AND h.source_type=$3 AND h.source_id=$4`,
        [tenantId, parkId, "test_fixture_source", sourceId]
      ) as Array<{ projectionVersion: number; headHash: string; taskId: string;
        rowHash: string; status: string; version: number }>;
      assert.equal(persisted.length, 1);
      assert.deepEqual({ taskId: persisted[0]!.taskId, status: persisted[0]!.status,
        version: persisted[0]!.version, projectionVersion: persisted[0]!.projectionVersion },
      { taskId, status: "claimed", version: 2, projectionVersion: 2 });
      const expectedHeadHash = createHash("sha256")
        .update(`${taskId}\t${persisted[0]!.rowHash}\n`).digest("hex");
      assert.equal(persisted[0]!.headHash, expectedHeadHash);
      const audits = await manager.query(
        `SELECT replace_mode AS mode,from_projection_version AS "fromVersion",
                to_projection_version AS "toVersion",assignment_mutation_count AS "assignmentCount"
           FROM biz_property_task_projection_rebuild_audit
          WHERE tenant_id=$1 AND park_id=$2 AND source_type=$3 AND source_id=$4
          ORDER BY to_projection_version`,
        [tenantId, parkId, "test_fixture_source", sourceId]
      ) as Array<Record<string, unknown>>;
      assert.deepEqual(audits, [
        { mode: "manual-rebuild", fromVersion: 0, toVersion: 1, assignmentCount: 0 },
        { mode: "authority-sync", fromVersion: 1, toVersion: 2, assignmentCount: 0 }
      ]);
      throw new Error("rollback-rebuild-fixture");
    }), /rollback-rebuild-fixture/u);
  });

  it("serializes concurrent claims to one winner and one zero-mutation loser", async () => {
    const fixture = await insertRuntimeFixture(dataSource.manager, "open");
    const actorIds = [randomUUID(), randomUUID()];
    await Promise.all(actorIds.map((id, index) =>
      insertFixtureActor(id, `c4_claim_${index}_${id.replaceAll("-", "")}`)));
    const principals = actorIds.map((id, index): JwtPrincipal => ({
      sub: id,
      username: `c4_claim_${index}_${id.replaceAll("-", "")}`,
      realName: `Concurrent claimant ${index}`,
      tenantId,
      parkId,
      roles: [],
      permissions: []
    }));
    const claim = async (index: number) => {
      try {
        const updated = await propertyTaskRuntime.service.claim(
          scope, principals[index]!, fixture.taskId, {
            clientKey: `independent-claim-${index}`,
            expectedAssignmentVersion: 1,
            expectedSourceVersion: 1,
            businessOccurrenceKey: fixture.occurrence
          }
        );
        return { kind: "winner" as const, updated };
      } catch (error) {
        const code = errorCode(error);
        if (code !== "task-already-claimed") throw error;
        return { kind: "loser" as const, code };
      }
    };
    const results = await Promise.all([claim(0), claim(1)]);
    assert.equal(results.filter((item) => item.kind === "winner").length, 1);
    assert.equal(results.filter((item) => item.kind === "loser").length, 1);
    assert.equal(results.find((item) => item.kind === "loser")?.code,
      "task-already-claimed");
    const rows = await dataSource.query(
      `SELECT assignment_status AS status,version,assignee_id::text AS "assigneeId"
         FROM biz_property_task_assignment
        WHERE tenant_id=$1 AND park_id=$2 AND id=$3`,
      [tenantId, parkId, fixture.assignment.id]
    ) as Array<{ status: string; version: number; assigneeId: string }>;
    const winnerIndex = results.findIndex((item) => item.kind === "winner");
    assert.notEqual(winnerIndex, -1);
    assert.deepEqual(rows, [{
      status: "claimed",
      version: 2,
      assigneeId: principals[winnerIndex]!.sub
    }]);
    assert.ok(actorIds.some((id) => id === rows[0]!.assigneeId));
    const audit = await dataSource.query(
      `SELECT count(*)::integer AS total
         FROM biz_property_task_assignment_audit
        WHERE tenant_id=$1 AND park_id=$2 AND assignment_id=$3`,
      [tenantId, parkId, fixture.assignment.id]
    ) as Array<{ total: number }>;
    assert.equal(audit[0]!.total, 1);
    const effects = await dataSource.query(
      `SELECT
        (SELECT count(*)::integer FROM biz_property_mutation_receipt
          WHERE tenant_id=$1 AND park_id=$2 AND target_id=$3) AS receipts,
        (SELECT count(*)::integer FROM biz_property_task_projection_rebuild_audit
          WHERE tenant_id=$1 AND park_id=$2 AND source_type=$4 AND source_id=$5) AS replacements`,
      [tenantId, parkId, fixture.taskId, fixture.sourceType, fixture.sourceId]
    ) as Array<{ receipts: number; replacements: number }>;
    assert.deepEqual(effects, [{ receipts: 1, replacements: 1 }]);
  });

  it("coordinates command-first against a terminal waiter with observable PG locks",
    async () => {
      const fixture = await insertRuntimeFixture(dataSource.manager);
      const actors = await openConcurrentActors("command-first", {
        holder: "READ COMMITTED",
        waiter: "READ COMMITTED"
      });
      const coordinator = createConcurrencyCoordinator();
      const staleAssignment = fixture.assignment;
      let holderWork: Promise<unknown> | null = null;
      let waiterWork: Promise<unknown> | null = null;
      let primaryError: unknown | null = null;
      try {
        holderWork = (async () => {
          try {
            const locked = await assignments.lockById(
              actors.holder.manager, scope, fixture.assignment.id
            );
            assert.ok(locked);
            const lockedProjection = await projections.lockSourceProjection(
              actors.holder.manager, scope, fixture.sourceType, fixture.sourceId
            );
            coordinator.signal("after-first-lock");
            await coordinator.wait("lock-before-ready");
            await executeFixtureCommand(
              actors.holder.manager, fixture, locked, lockedProjection
            );
            await actors.holder.commitTransaction();
            return { kind: "committed" as const };
          } catch (error) {
            await assertSettledOperations(
              "command-first holder rollback",
              [rollbackIfActive(actors.holder)],
              error
            );
            throw error;
          }
        })();
        await coordinator.wait("after-first-lock");

        waiterWork = (async () => {
          coordinator.signal("waiter-started");
          try {
            await executeFixtureTerminal(
              actors.waiter.manager, fixture, staleAssignment,
              fixture.initialProjection
            );
            await actors.waiter.commitTransaction();
            return { kind: "committed" as const };
          } catch (error) {
            await assertSettledOperations(
              "command-first waiter rollback",
              [rollbackIfActive(actors.waiter)],
              error
            );
            return rolledBackActorResult(error, errorCode(error));
          }
        })();
        await coordinator.wait("waiter-started");
        await observeLockWait(
          actors.observer.manager, actors.waiterPid, actors.holderPid,
          [watchActor("holder", holderWork), watchActor("waiter", waiterWork)]
        );
        coordinator.signal("lock-before-ready");
        const [holderResult, waiterResult] = await Promise.all([
          holderWork, waiterWork
        ]);
        assert.deepEqual(holderResult, { kind: "committed" });
        assert.deepEqual(waiterResult, {
          kind: "rolled-back", code: "property-version-conflict"
        });
        await actors.observer.commitTransaction();
        await assertFixtureOutcome(fixture, {
          assignmentStatus: "claimed",
          assignmentVersion: 2,
          assignmentAction: "property.task.claim",
          projectionVersion: 2,
          projectionAction: "property.task.claim",
          receiptAction: "property.task.claim"
        });
      } catch (error) {
        primaryError = error;
        throw error;
      } finally {
        coordinator.signal("lock-before-ready");
        await finishConcurrentActors(actors, holderWork, waiterWork, primaryError);
      }
    });

  it("coordinates terminal-first against a command waiter with exact rollback",
    async () => {
      const fixture = await insertRuntimeFixture(dataSource.manager);
      const actors = await openConcurrentActors("terminal-first", {
        holder: "READ COMMITTED",
        waiter: "READ COMMITTED"
      });
      const coordinator = createConcurrencyCoordinator();
      let holderWork: Promise<unknown> | null = null;
      let waiterWork: Promise<unknown> | null = null;
      let primaryError: unknown | null = null;
      try {
        holderWork = (async () => {
          try {
            const locked = await assignments.lockById(
              actors.holder.manager, scope, fixture.assignment.id
            );
            assert.ok(locked);
            const lockedProjection = await projections.lockSourceProjection(
              actors.holder.manager, scope, fixture.sourceType, fixture.sourceId
            );
            coordinator.signal("after-first-lock");
            await coordinator.wait("lock-before-ready");
            await executeFixtureTerminal(
              actors.holder.manager, fixture, locked, lockedProjection
            );
            await actors.holder.commitTransaction();
            return { kind: "committed" as const };
          } catch (error) {
            await assertSettledOperations(
              "terminal-first holder rollback",
              [rollbackIfActive(actors.holder)],
              error
            );
            throw error;
          }
        })();
        await coordinator.wait("after-first-lock");
        waiterWork = (async () => {
          coordinator.signal("waiter-started");
          try {
            await executeFixtureCommand(
              actors.waiter.manager, fixture, fixture.assignment,
              fixture.initialProjection
            );
            await actors.waiter.commitTransaction();
            return { kind: "committed" as const };
          } catch (error) {
            await assertSettledOperations(
              "terminal-first waiter rollback",
              [rollbackIfActive(actors.waiter)],
              error
            );
            return rolledBackActorResult(error, errorCode(error));
          }
        })();
        await coordinator.wait("waiter-started");
        await observeLockWait(
          actors.observer.manager, actors.waiterPid, actors.holderPid,
          [watchActor("holder", holderWork), watchActor("waiter", waiterWork)]
        );
        coordinator.signal("lock-before-ready");
        assert.deepEqual(await Promise.all([holderWork, waiterWork]), [
          { kind: "committed" },
          { kind: "rolled-back", code: "task-version-conflict" }
        ]);
        await actors.observer.commitTransaction();
        await assertFixtureOutcome(fixture, {
          assignmentStatus: "closed",
          assignmentVersion: 2,
          assignmentAction: "property.task.source-terminal.closed",
          projectionVersion: 2,
          projectionAction: "property.task.source-terminal.closed",
          receiptAction: "property.task.source-terminal.closed"
        });
      } catch (error) {
        primaryError = error;
        throw error;
      } finally {
        coordinator.signal("lock-before-ready");
        await finishConcurrentActors(actors, holderWork, waiterWork, primaryError);
      }
    });

  it("commits rebuild-first then authority-sync command in production lock order",
    async () => runRebuildFirstTwoSuccess("command"));

  it("commits rebuild-first then source-terminal in production lock order",
    async () => runRebuildFirstTwoSuccess("terminal"));

  async function runRebuildFirstTwoSuccess(
    waiterKind: "command" | "terminal"
  ): Promise<void> {
    const fixture = await insertRuntimeFixture(dataSource.manager);
    const actors = await openConcurrentActors(`rebuild-first-${waiterKind}`, {
      holder: "READ COMMITTED",
      waiter: "READ COMMITTED"
    });
    const coordinator = createConcurrencyCoordinator();
    let holderWork: Promise<unknown> | null = null;
    let waiterWork: Promise<unknown> | null = null;
    let primaryError: unknown | null = null;
    try {
      holderWork = (async () => {
        try {
          const lockedAssignment = await assignments.lockById(
            actors.holder.manager, scope, fixture.assignment.id
          );
          assert.ok(lockedAssignment);
          const lockedProjection = await projections.lockSourceProjection(
            actors.holder.manager, scope, fixture.sourceType, fixture.sourceId
          );
          coordinator.signal("after-first-lock");
          await coordinator.wait("lock-before-ready");
          await executeFixtureRebuild(
            actors.holder.manager, fixture, lockedAssignment, lockedProjection
          );
          await actors.holder.commitTransaction();
          return { kind: "committed" as const };
        } catch (error) {
          await assertSettledOperations(
            `rebuild-first ${waiterKind} holder rollback`,
            [rollbackIfActive(actors.holder)],
            error
          );
          throw error;
        }
      })();
      await coordinator.wait("after-first-lock");
      waiterWork = (async () => {
        coordinator.signal("waiter-started");
        try {
          const currentAssignment = await assignments.lockById(
            actors.waiter.manager, scope, fixture.assignment.id
          );
          assert.ok(currentAssignment);
          const currentProjection = await projections.lockSourceProjection(
            actors.waiter.manager, scope, fixture.sourceType, fixture.sourceId
          );
          assert.equal(currentProjection.projectionVersion, 2);
          if (waiterKind === "command") {
            await executeFixtureCommand(
              actors.waiter.manager, fixture, currentAssignment, currentProjection
            );
          } else {
            await executeFixtureTerminal(
              actors.waiter.manager, fixture, currentAssignment, currentProjection
            );
          }
          await actors.waiter.commitTransaction();
          return { kind: "committed" as const };
        } catch (error) {
          await assertSettledOperations(
            `rebuild-first ${waiterKind} waiter rollback`,
            [rollbackIfActive(actors.waiter)],
            error
          );
          throw error;
        }
      })();
      await coordinator.wait("waiter-started");
      await observeLockWait(
        actors.observer.manager, actors.waiterPid, actors.holderPid,
        [watchActor("holder", holderWork), watchActor("waiter", waiterWork)]
      );
      coordinator.signal("lock-before-ready");
      assert.deepEqual(await Promise.all([holderWork, waiterWork]), [
        { kind: "committed" },
        { kind: "committed" }
      ]);
      await actors.observer.commitTransaction();
      await assertTwoSuccessFixtureOutcome(fixture, waiterKind);
    } catch (error) {
      primaryError = error;
      throw error;
    } finally {
      coordinator.signal("lock-before-ready");
      await finishConcurrentActors(actors, holderWork, waiterWork, primaryError);
    }
  }

  // Four signed representative cross-operation schedules are frozen by these names.
  const concurrencySchedules = [
    "command-first", "terminal-first", "rebuild-first-command",
    "rebuild-first-terminal"
  ] as const;
  assert.equal(concurrencySchedules.length, 4);

  const MATRIX_CASE_BUDGET_MS = 60_000;

  for (const matrixCase of C4_CROSS_OPERATION_MATRIX_MANIFEST) {
    it(`C4 matrix ${matrixCase.key}`, { timeout: MATRIX_CASE_BUDGET_MS }, async () => {
      await runC4CrossOperationMatrixCase(matrixCase);
    });
  }

  it("C4 matrix proof independent:rebuild-same-key-completed-replay", async () => {
    await assertC4IndependentProof("independent:rebuild-same-key-completed-replay");
  });

  it("C4 matrix proof independent:terminal-closed-completed-replay", async () => {
    await assertC4IndependentProof("independent:terminal-closed-completed-replay");
  });

  it("C4 matrix proof independent:terminal-cancelled-completed-replay", async () => {
    await assertC4IndependentProof("independent:terminal-cancelled-completed-replay");
  });

  it("C4 matrix proof independent:terminal-pre-receipt-negative-matrix", async () => {
    await assertC4IndependentProof("independent:terminal-pre-receipt-negative-matrix");
  });

  it("C4 matrix proof independent:terminal-existing-only-state-matrix", async () => {
    await assertC4IndependentProof("independent:terminal-existing-only-state-matrix");
  });

  it("C4 matrix proof independent:projection-late-failure-rollback", async () => {
    await assertC4IndependentProof("independent:projection-late-failure-rollback");
  });

  it("C4 matrix proof independent:receipt-complete-late-failure-rollback", async () => {
    await assertC4IndependentProof("independent:receipt-complete-late-failure-rollback");
  });

  it("C4 matrix proof independent:head-absent-concurrent-winner-reattest", async () => {
    await assertC4IndependentProof("independent:head-absent-concurrent-winner-reattest");
  });

  it("C4 matrix proof independent:derived-owning-boundary", async () => {
    await assertC4IndependentProof("independent:derived-owning-boundary");
  });

  async function runC4CrossOperationMatrixCase(matrixCase: C4MatrixCase): Promise<void> {
    await activateMatrixScope(matrixCase.key);
    assertMatrixIsolationMetadata(matrixCase);
    const actionCase = matrixActionCase(matrixCase.actionKey);
    if (matrixCase.family === "shared-fence") {
      assert.equal(actionCase.kind, "command");
      await runCommandTerminalFence(matrixCase, actionCase as CommandMatrixCase);
      return;
    }
    if (matrixCase.order === "rebuild-first") {
      await runRebuildFirstMatrix(matrixCase, actionCase);
      return;
    }
    await runActionFirstRebuildMatrix(matrixCase, actionCase);
  }

  type C4IndependentProof =
    | "independent:rebuild-same-key-completed-replay"
    | "independent:terminal-closed-completed-replay"
    | "independent:terminal-cancelled-completed-replay"
    | "independent:terminal-pre-receipt-negative-matrix"
    | "independent:terminal-existing-only-state-matrix"
    | "independent:projection-late-failure-rollback"
    | "independent:receipt-complete-late-failure-rollback"
    | "independent:head-absent-concurrent-winner-reattest"
    | "independent:derived-owning-boundary";

  async function assertC4IndependentProof(proof: C4IndependentProof): Promise<void> {
    await activateMatrixScope(proof);
    if (proof === "independent:rebuild-same-key-completed-replay") {
      await assertRebuildCompletedReplay();
      return;
    }
    if (proof === "independent:terminal-closed-completed-replay") {
      await assertTerminalCompletedReplay("closed");
      return;
    }
    if (proof === "independent:terminal-cancelled-completed-replay") {
      await assertTerminalCompletedReplay("cancelled");
      return;
    }
    if (proof === "independent:terminal-pre-receipt-negative-matrix") {
      await assertTerminalPreReceiptNegativeMatrix();
      return;
    }
    if (proof === "independent:terminal-existing-only-state-matrix") {
      await assertTerminalExistingOnlyStateMatrix();
      return;
    }
    if (proof === "independent:projection-late-failure-rollback") {
      await assertLateFailureRollback("projection");
      return;
    }
    if (proof === "independent:receipt-complete-late-failure-rollback") {
      await assertLateFailureRollback("receipt-complete");
      return;
    }
    if (proof === "independent:head-absent-concurrent-winner-reattest") {
      await assertHeadAbsentConcurrentWinnerReattest();
      return;
    }
    await assertDerivedOwningBoundary();
  }

  async function assertRebuildCompletedReplay(): Promise<void> {
    const fixture = await insertRuntimeFixture(dataSource.manager);
    const clientKey = "independent-rebuild-completed-replay";
    const first = await executeMatrixRebuild(fixture, 1, clientKey) as {
      replayed: boolean;
      projectionVersion: number;
    };
    assert.deepEqual({ replayed: first.replayed, projectionVersion: first.projectionVersion }, {
      replayed: false,
      projectionVersion: 2
    });
    const beforeReplay = await captureIndependentFixtureEvidence(fixture);
    const replay = await executeMatrixRebuild(fixture, 1, clientKey) as {
      replayed: boolean;
      projectionVersion: number;
      originalResultVersion: number;
    };
    assert.deepEqual({
      replayed: replay.replayed,
      projectionVersion: replay.projectionVersion,
      originalResultVersion: replay.originalResultVersion
    }, { replayed: true, projectionVersion: 2, originalResultVersion: 2 });
    assert.deepEqual(await captureIndependentFixtureEvidence(fixture), beforeReplay);
  }

  async function assertTerminalCompletedReplay(
    terminal: "closed" | "cancelled"
  ): Promise<void> {
    const fixture = await insertRuntimeFixture(dataSource.manager);
    const actionCase = terminalCase("open", terminal);
    await executeMatrixAction(actionCase, fixture, `independent-terminal-${terminal}`);
    const beforeReplay = await captureIndependentFixtureEvidence(fixture);
    const receiptAccess = emptyReceiptAccessEvidence();
    const request = matrixTerminalRequest(fixture, terminal);
    const replay = await propertyTaskRuntime.runOperation({
      operation: "terminal",
      terminal,
      sourceMutation: "observe-only",
      sourceVersion: 1,
      outcomeCode: request.outcomeCode,
      outcomeAt: request.outcomeAt,
      receiptAccess
    }, () => propertyTaskRuntime.orchestrator.sourceTerminal(request));
    const resultRef = `property-task-source-terminal/${fixture.sourceType}/`
      + `${fixture.sourceId}/${terminal}/v1`;
    const identity = {
      tag: "property-task" as const,
      businessOccurrenceKey: fixture.occurrence,
      taskKey: fixture.assignment.taskKey
    };
    const resultHash = await propertyTaskMutationResultHash({
      actionId: request.actionId,
      targetId: fixture.sourceId,
      identity,
      resultRef,
      resultVersion: 1
    });
    const clientKey = `${PROPERTY_TASK_TERMINAL_CLIENT_KEY_PREFIX}${sha256Hex(
      propertyTaskSourceTerminalClientKeyCanonicalBytes(request)
    )}`;
    assert.deepEqual({
      replayed: replay.replayed,
      originalResultVersion: replay.originalResultVersion,
      replayedResultRef: replay.replayedResultRef
    }, { replayed: true, originalResultVersion: 1, replayedResultRef: resultRef });
    const receiptRows = beforeReplay.receiptRows as Array<Record<string, unknown>>;
    assert.equal(receiptRows.length, 1);
    assert.match(String(receiptRows[0]!.id),
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
    assert.deepEqual({ ...receiptRows[0], id: undefined }, {
      id: undefined,
      status: "completed",
      clientKey,
      requestHash: canonicalPropertyTaskRequestHash(request),
      resultRef,
      resultHash,
      resultVersion: 1
    });
    assertExistingOnlyStateAccessCounts(receiptAccess, {
      executeOrReplay: 0,
      existingOnly: 1,
      total: 1
    });
    assert.deepEqual(await captureIndependentFixtureEvidence(fixture), beforeReplay);
  }

  async function assertTerminalPreReceiptNegativeMatrix(): Promise<void> {
    const cases = [
      ["expected-current", { expectedAssignmentVersion: 2 }, "property-version-conflict"],
      ["expected-current-minus-2", { expectedAssignmentVersion: 0 },
        "property-version-conflict"],
      ["expected-zero", { expectedAssignmentVersion: 0 }, "property-version-conflict"],
      ["expected-negative", { expectedAssignmentVersion: -1 }, "property-version-conflict"],
      ["expected-fractional", { expectedAssignmentVersion: 1.5 },
        "property-version-conflict"],
      ["expected-max-safe", { expectedAssignmentVersion: Number.MAX_SAFE_INTEGER },
        "property-version-conflict"],
      ["expected-overflow", { expectedAssignmentVersion: Number.MAX_SAFE_INTEGER + 1 },
        "property-version-conflict"],
      ["different-terminal", {
        terminal: "cancelled", actionId: "property.task.source-terminal.cancelled"
      }, "property-version-conflict"],
      ["different-outcome", { outcomeCode: "fixture-different-outcome" },
        "property-version-conflict"],
      ["source-version-old", { sourceVersion: 0 }, "property-version-conflict"],
      ["source-version-new", { sourceVersion: 2 }, "property-version-conflict"],
      ["different-occurrence", { businessOccurrenceKey: "different-occurrence" },
        "property-resource-not-found"],
      ["different-task-key", { taskKey: "different-task-key" },
        "property-resource-not-found"]
    ] as const;
    assert.equal(cases.length, 13);
    for (const [subkey, rawOverride, expectedError] of cases) {
      await activateMatrixScope(`independent:terminal-pre-receipt-negative-matrix:${subkey}`);
      const fixture = await insertRuntimeFixture(dataSource.manager);
      await executeMatrixAction(
        terminalCase("open", "closed"), fixture, `independent-${subkey}-seed`
      );
      const override = subkey === "different-task-key"
        ? { taskKey: fixtureTaskKey() }
        : subkey === "different-occurrence"
          ? { businessOccurrenceKey: `different-${fixture.occurrence}` }
          : rawOverride;
      const request = {
        ...matrixTerminalRequest(fixture, "closed"), ...override
      } as PropertyTaskSourceTerminalRequestV1;
      const beforeMatrix = await captureIndependentFixtureEvidence(fixture);
      const receiptAccess = emptyReceiptAccessEvidence();
      await assert.rejects(propertyTaskRuntime.runOperation({
        operation: "terminal",
        terminal: request.terminal,
        sourceMutation: "observe-only",
        sourceVersion: 1,
        outcomeCode: request.outcomeCode,
        outcomeAt: request.outcomeAt,
        receiptAccess
      }, () => propertyTaskRuntime.orchestrator.sourceTerminal(request)),
      (error: unknown) => errorCode(error) === expectedError, subkey);
      assertPreReceiptAccessCounts(receiptAccess, {
        executeOrReplay: 0,
        existingOnly: 0,
        total: 0
      });
      assert.deepEqual(await captureIndependentFixtureEvidence(fixture), beforeMatrix, subkey);
    }
  }

  async function assertTerminalExistingOnlyStateMatrix(): Promise<void> {
    const states = ["existing-only-absent", "existing-only-started",
      "existing-only-failed"] as const;
    for (const state of states) {
      await activateMatrixScope(`independent:terminal-existing-only-state-matrix:${state}`);
      const fixture = await insertRuntimeFixture(dataSource.manager);
      await executeMatrixAction(
        terminalCase("open", "closed"), fixture, `independent-${state}-seed`
      );
      const replayActorId = deterministicMatrixUuid(`${state}:replay-actor`);
      await insertFixtureActor(replayActorId, `c4_${replayActorId.replaceAll("-", "")}`);
      const request = {
        ...matrixTerminalRequest(fixture, "closed"),
        terminalActorId: replayActorId
      };
      const input = terminalReceiptInput(request, "execute-or-replay");
      let runtime = propertyTaskRuntime;
      let simulatedBoundary: ReturnType<typeof failedReceiptSimulationBoundary> | null = null;
      if (state === "existing-only-started") {
        await dataSource.transaction((manager) => receipts.acquire(manager, input));
      } else if (state === "existing-only-failed") {
        await assertFailedReceiptSchemaUnreachable(fixture, input);
        simulatedBoundary = failedReceiptSimulationBoundary(input);
        runtime = createPropertyTaskRuntime(simulatedBoundary.port);
      }
      const before = await captureIndependentFixtureEvidence(fixture);
      const receiptAccess = emptyReceiptAccessEvidence();
      await assert.rejects(runtime.runOperation({
        operation: "terminal",
        terminal: "closed",
        sourceMutation: "observe-only",
        sourceVersion: 1,
        outcomeCode: request.outcomeCode,
        outcomeAt: request.outcomeAt,
        receiptAccess
      }, () => runtime.orchestrator.sourceTerminal(request)),
      (error: unknown) => errorCode(error) === "property-runtime-unavailable", state);
      assertExistingOnlyStateAccessCounts(receiptAccess, {
        executeOrReplay: 0,
        existingOnly: 1,
        total: 1
      });
      if (simulatedBoundary) {
        assert.equal(simulatedBoundary.evidence.mode,
          "test-only-simulated-port-boundary-schema-unreachable-failed-row");
        assert.equal(simulatedBoundary.evidence.calls, 1);
        assert.equal(simulatedBoundary.evidence.statements.length, 1);
        assert.match(simulatedBoundary.evidence.statements[0]!, /SELECT[\s\S]*FOR UPDATE/iu);
        assert.doesNotMatch(simulatedBoundary.evidence.statements[0]!,
          /^\s*(?:INSERT|UPDATE|DELETE)\b/iu);
      }
      assert.deepEqual(await captureIndependentFixtureEvidence(fixture), before, state);
    }
  }

  function emptyReceiptAccessEvidence(): C4ReceiptAccessEvidence {
    return { executeOrReplay: 0, existingOnly: 0, total: 0 };
  }

  function assertPreReceiptAccessCounts(
    actual: C4ReceiptAccessEvidence,
    expected: C4ReceiptAccessEvidence
  ): void {
    assert.deepEqual(actual, expected);
  }

  function assertExistingOnlyStateAccessCounts(
    actual: C4ReceiptAccessEvidence,
    expected: C4ReceiptAccessEvidence
  ): void {
    assert.deepEqual(actual, expected);
  }

  async function captureIndependentFixtureEvidence(
    fixture: Awaited<ReturnType<typeof insertRuntimeFixture>>
  ): Promise<Record<string, unknown>> {
    const rows = await dataSource.query(
      `SELECT
         (SELECT count(*)::integer FROM biz_property_task_assignment_audit
           WHERE tenant_id=$1 AND park_id=$2 AND assignment_id=$3) AS "assignmentAudits",
         (SELECT count(*)::integer FROM biz_property_task_projection_rebuild_audit
           WHERE tenant_id=$1 AND park_id=$2 AND source_type=$4 AND source_id=$5) AS "projectionAudits",
         (SELECT count(*)::integer FROM biz_property_mutation_receipt
           WHERE tenant_id=$1 AND park_id=$2
             AND target_id IN ($6::uuid,$5::uuid)) AS receipts,
         (SELECT COALESCE(jsonb_agg(jsonb_build_object(
              'id',id,'status',receipt_status,'clientKey',client_key,
              'requestHash',request_hash,'resultRef',result_ref,
              'resultHash',result_hash,'resultVersion',result_version)
              ORDER BY client_key),'[]'::jsonb)
            FROM biz_property_mutation_receipt
           WHERE tenant_id=$1 AND park_id=$2
             AND target_id IN ($6::uuid,$5::uuid)) AS "receiptRows",
         (SELECT count(*)::integer FROM biz_property_task_projection
           WHERE tenant_id=$1 AND park_id=$2 AND source_type=$4 AND source_id=$5) AS projections,
         assignment.assignment_status AS "assignmentStatus",
         assignment.version::integer AS "assignmentVersion",
         source.lifecycle,source.mutation_count::integer AS "sourceMutations",
         head.projection_version::integer AS "projectionVersion",
         head.content_hash::text AS "headHash"
        FROM biz_property_task_assignment assignment
        JOIN c4_property_task_source_fixture source
          ON source.tenant_id=assignment.tenant_id AND source.park_id=assignment.park_id
         AND source.source_id=assignment.source_id
        JOIN biz_property_task_projection_head head
          ON head.tenant_id=assignment.tenant_id AND head.park_id=assignment.park_id
         AND head.source_type=assignment.source_type AND head.source_id=assignment.source_id
       WHERE assignment.tenant_id=$1 AND assignment.park_id=$2 AND assignment.id=$3`,
      [tenantId, parkId, fixture.assignment.id, fixture.sourceType, fixture.sourceId,
        fixture.taskId]
    ) as Array<Record<string, unknown>>;
    assert.equal(rows.length, 1);
    return rows[0]!;
  }

  function terminalReceiptInput(
    request: PropertyTaskSourceTerminalRequestV1,
    acquireMode: "execute-or-replay" | "existing-only"
  ): PropertyMutationReceiptAcquireInput {
    return {
      scope: { tenantId: request.tenantId, parkId: request.parkId },
      contractVersion: PROPERTY_MUTATION_RECEIPT_CONTRACT_VERSION,
      actorId: request.terminalActorId,
      actionId: request.actionId,
      targetId: request.sourceId,
      clientKey: `${PROPERTY_TASK_TERMINAL_CLIENT_KEY_PREFIX}${sha256Hex(
        propertyTaskSourceTerminalClientKeyCanonicalBytes(request)
      )}`,
      requestHash: canonicalPropertyTaskRequestHash(request),
      identity: {
        tag: "property-task",
        businessOccurrenceKey: request.businessOccurrenceKey,
        taskKey: request.taskKey
      },
      acquireMode
    };
  }

  async function insertFixtureActor(id: string, username: string): Promise<void> {
    await dataSource.query(
      `INSERT INTO sys_user(
         id,tenant_id,park_id,username,display_name,password_hash,is_enabled)
       VALUES($1,$2,$3,$4,$5,$6,true)`,
      [id, tenantId, parkId, username, actorDisplay,
        "!C4_PROPERTY_TASK_REPLAY_NO_LOGIN!"]
    );
  }

  function failedReceiptSimulationBoundary(input: PropertyMutationReceiptAcquireInput) {
    const identity = input.identity;
    assert.equal(identity.tag, "property-task");
    if (identity.tag !== "property-task") throw new Error("failed simulation identity drift");
    const evidence = {
      mode: "test-only-simulated-port-boundary-schema-unreachable-failed-row" as const,
      calls: 0,
      statements: [] as string[]
    };
    const adapter = new DatabasePropertyMutationReceiptAdapter();
    const manager = {
      async query(statement: string) {
        evidence.calls += 1;
        evidence.statements.push(statement);
        return [{
          id: deterministicMatrixUuid(`${input.clientKey}:simulated-failed-receipt`),
          receipt_contract_version: input.contractVersion,
          tenant_id: input.scope.tenantId,
          park_id: input.scope.parkId,
          actor_id: input.actorId,
          action_id: input.actionId,
          target_id: input.targetId,
          client_key: input.clientKey,
          request_hash: input.requestHash,
          receipt_status: "failed",
          identity_kind: "property-task",
          business_occurrence_key: identity.businessOccurrenceKey,
          task_key: identity.taskKey,
          identity_source_type: null,
          result_ref: null,
          result_hash: null,
          result_version: null
        }];
      }
    } as unknown as EntityManager;
    const port: PropertyMutationReceiptPort = {
      acquire: (_manager, acquireInput) => adapter.acquire(manager, acquireInput),
      complete: (realManager, completeInput) => adapter.complete(
        realManager as EntityManager, completeInput
      )
    };
    return { evidence, port };
  }

  async function assertFailedReceiptSchemaUnreachable(
    fixture: Awaited<ReturnType<typeof insertRuntimeFixture>>,
    input: PropertyMutationReceiptAcquireInput
  ): Promise<void> {
    const identity = input.identity;
    assert.equal(identity.tag, "property-task");
    if (identity.tag !== "property-task") return;
    const before = await captureIndependentFixtureEvidence(fixture);
    const insertParameters = [input.scope.tenantId, input.scope.parkId, input.actorId,
      input.actionId, input.targetId, `${input.clientKey}:insert-failed`, input.requestHash,
      identity.businessOccurrenceKey, identity.taskKey];
    await assert.rejects(dataSource.transaction((manager) => manager.query(
      `INSERT INTO biz_property_mutation_receipt(
         receipt_contract_version,tenant_id,park_id,actor_id,action_id,target_id,
         client_key,request_hash,receipt_status,identity_kind,
         business_occurrence_key,task_key,identity_source_type)
       VALUES('port-v2',$1,$2,$3,$4,$5,$6,$7,'failed','property-task',$8,$9,NULL)`,
      insertParameters
    )), (error: unknown) => databaseCode(error) === "23514");

    const startedInput = { ...input, clientKey: `${input.clientKey}:started-to-failed` };
    await assert.rejects(dataSource.transaction(async (manager) => {
      const acquired = await receipts.acquire(manager, startedInput);
      assert.equal(acquired.kind, "execute");
      await manager.query(
        `UPDATE biz_property_mutation_receipt SET receipt_status='failed'
          WHERE tenant_id=$1 AND park_id=$2 AND actor_id=$3 AND action_id=$4
            AND target_id=$5 AND client_key=$6`,
        [startedInput.scope.tenantId, startedInput.scope.parkId, startedInput.actorId,
          startedInput.actionId, startedInput.targetId, startedInput.clientKey]
      );
    }), (error: unknown) => databaseCode(error) === "23514");
    const failedRows = await dataSource.query(
      `SELECT count(*)::integer AS count FROM biz_property_mutation_receipt
        WHERE tenant_id=$1 AND park_id=$2 AND receipt_status='failed'`,
      [input.scope.tenantId, input.scope.parkId]
    ) as Array<{ count: number }>;
    assert.deepEqual(failedRows, [{ count: 0 }]);
    assert.deepEqual(await captureIndependentFixtureEvidence(fixture), before,
      "schema-unreachable failed receipt attempts must not mutate business projection/audit state");
  }

  async function assertLateFailureRollback(
    stage: "projection" | "receipt-complete"
  ): Promise<void> {
    const fixture = await insertRuntimeFixture(dataSource.manager);
    const before = await captureIndependentFixtureEvidence(fixture);
    const lateFailureEvidence = {
      projectionReplaceCompleted: false,
      receiptCompleteCompleted: false
    };
    await assert.rejects(
      executeMatrixAction(
        commandMatrixCases[0]!, fixture, `independent-${stage}-rollback`, {
          lateFailure: stage,
          lateFailureEvidence
        }
      ),
      (error: unknown) => error instanceof Error
        && error.message === `c4-${stage}-late-failure`
    );
    assert.deepEqual(lateFailureEvidence, stage === "projection" ? {
      projectionReplaceCompleted: true,
      receiptCompleteCompleted: false
    } : {
      projectionReplaceCompleted: false,
      receiptCompleteCompleted: true
    });
    assert.deepEqual(await captureIndependentFixtureEvidence(fixture), before);
  }

  async function assertHeadAbsentConcurrentWinnerReattest(): Promise<void> {
    assert.equal(rawFileSha256("b2a-c2-final-gate-signoff-v12d.json"),
      "0be731ea41ffceddf050e3a4fac971ce4e03ef3c9cc8e6bbfe926cb565949274");
    assert.equal(rawFileSha256("b2a-c2-candidate-gate-artifact-v12d.json"),
      "b5169a6e2668d3a2491814f34dd6745e386056f721236160aa5fe331aae41e50");
    const fixture = await insertRuntimeFixture(dataSource.manager);
    await dataSource.transaction(async (manager) => {
      await manager.query(
        `DELETE FROM biz_property_task_projection
          WHERE tenant_id=$1 AND park_id=$2 AND source_type=$3 AND source_id=$4`,
        [tenantId, parkId, fixture.sourceType, fixture.sourceId]
      );
      await manager.query(
        `DELETE FROM biz_property_task_projection_head
          WHERE tenant_id=$1 AND park_id=$2 AND source_type=$3 AND source_id=$4`,
        [tenantId, parkId, fixture.sourceType, fixture.sourceId]
      );
    });
    const clientKeys = ["independent-head-absent-winner-a",
      "independent-head-absent-winner-b"] as const;
    const coordinator = createConcurrencyCoordinator();
    const observer = await openMatrixObserver("independent-head-absent");
    const pids = [0, 0];
    let arrivals = 0;
    let releaseStart: () => void = () => {};
    let markBothArrived: () => void = () => {};
    const start = new Promise<void>((resolveStart) => { releaseStart = resolveStart; });
    const bothArrived = new Promise<void>((resolveArrived) => {
      markBothArrived = resolveArrived;
    });
    let holderPid = 0;
    const hooks = (index: number): Pick<C4FixtureOperationContext,
    "beforeSourceLock" | "afterSourceLock"> => ({
      beforeSourceLock: async ({ pid }) => {
        pids[index] = pid;
        arrivals += 1;
        if (arrivals === 2) markBothArrived();
        await start;
      },
      afterSourceLock: async ({ pid }) => {
        if (holderPid !== 0) return;
        holderPid = pid;
        coordinator.signal("after-first-lock");
        await coordinator.wait("lock-before-ready");
      }
    });
    const contendersWork = [
      executeMatrixRebuild(fixture, 0, clientKeys[0], hooks(0)),
      executeMatrixRebuild(fixture, 0, clientKeys[1], hooks(1))
    ];
    let primaryError: unknown | null = null;
    let contenders: PromiseSettledResult<unknown>[] = [];
    try {
      await withAbsoluteDeadline(
        bothArrived, Date.now() + 10_000, "head-absent:both-before-source-lock"
      );
      assert.notEqual(pids[0], 0);
      assert.notEqual(pids[1], 0);
      assert.notEqual(pids[0], pids[1], "head-absent contenders require backend overlap");
      releaseStart();
      await coordinator.wait("after-first-lock");
      const waiterPid = pids.find((pid) => pid !== holderPid)!;
      await observeLockWait(
        observer.manager,
        waiterPid,
        holderPid,
        contendersWork.map((work, index) => watchActor(index === 0 ? "holder" : "waiter", work))
      );
      coordinator.signal("lock-before-ready");
      contenders = await Promise.allSettled(contendersWork);
    } catch (error) {
      primaryError = error;
      throw error;
    } finally {
      releaseStart();
      coordinator.signal("lock-before-ready");
      await settleMatrixWorkBeforeObserverCleanup(contendersWork, primaryError);
      await cleanupQueryRunners([observer], "head-absent observer", primaryError);
    }
    const winnerIndexes = contenders.flatMap((result, index) =>
      result.status === "fulfilled" ? [index] : []);
    const losers = contenders.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : []);
    assert.equal(winnerIndexes.length, 1);
    assert.equal(losers.length, 1);
    assert.equal(errorCode(losers[0]), "task-version-conflict");
    const replay = await executeMatrixRebuild(
      fixture, 0, clientKeys[winnerIndexes[0]!]!
    ) as {
      replayed: boolean;
      projectionVersion: number;
    };
    assert.deepEqual({ replayed: replay.replayed, projectionVersion: replay.projectionVersion }, {
      replayed: true,
      projectionVersion: 1
    });
    const rows = await dataSource.query(
      `SELECT
        (SELECT count(*)::integer FROM biz_property_task_projection_head
          WHERE tenant_id=$1 AND park_id=$2 AND source_type=$3 AND source_id=$4) AS heads,
        (SELECT count(*)::integer FROM biz_property_task_projection_rebuild_audit
          WHERE tenant_id=$1 AND park_id=$2 AND source_type=$3 AND source_id=$4) AS audits,
        (SELECT count(*)::integer FROM biz_property_mutation_receipt
          WHERE tenant_id=$1 AND park_id=$2 AND action_id='property.task.rebuild'
            AND target_id=$4) AS receipts`,
      [tenantId, parkId, fixture.sourceType, fixture.sourceId]
    ) as Array<{ heads: number; audits: number; receipts: number }>;
    assert.deepEqual(rows, [{ heads: 1, audits: 1, receipts: 1 }]);
  }

  async function assertDerivedOwningBoundary(): Promise<void> {
    const fixture = await insertRuntimeFixture(dataSource.manager);
    let derivedOwningHookTrap = 0;
    const derivedOwningHook = propertyTaskRuntime.resolver.invokeOwningCommand;
    if (derivedOwningHook) derivedOwningHookTrap += 1;
    assert.equal(derivedOwningHook, undefined);
    await executeMatrixAction(
      commandMatrixCases[0]!, fixture, "independent-derived-boundary"
    );
    const derivedRows = await dataSource.query(
      `SELECT projection.assignment_authority AS authority,
              projection.derived_assignment_id::text AS "derivedAssignmentId",
              source.mutation_count::integer AS "sourceMutations",
              assignment.version::integer AS "assignmentVersion",
              (SELECT count(*)::integer FROM biz_property_mutation_receipt receipt
                WHERE receipt.tenant_id=$1 AND receipt.park_id=$2
                  AND receipt.target_id=$3) AS receipts,
              (SELECT count(*)::integer FROM biz_property_task_projection_rebuild_audit audit
                WHERE audit.tenant_id=$1 AND audit.park_id=$2
                  AND audit.source_type=projection.source_type
                  AND audit.source_id=projection.source_id) AS replacements
         FROM biz_property_task_projection projection
         JOIN c4_property_task_source_fixture source
           ON source.tenant_id=projection.tenant_id AND source.park_id=projection.park_id
          AND source.source_id=projection.source_id
         JOIN biz_property_task_assignment assignment
           ON assignment.tenant_id=projection.tenant_id AND assignment.park_id=projection.park_id
          AND assignment.id=projection.derived_assignment_id
        WHERE projection.tenant_id=$1 AND projection.park_id=$2
          AND projection.task_id=$3`,
      [tenantId, parkId, fixture.taskId]
    ) as Array<{ authority: string; derivedAssignmentId: string;
      sourceMutations: number; assignmentVersion: number; receipts: number;
      replacements: number }>;
    assert.deepEqual(derivedRows, [{
      authority: "derived",
      derivedAssignmentId: fixture.assignment.id,
      sourceMutations: 0,
      assignmentVersion: 2,
      receipts: 1,
      replacements: 1
    }]);
    assert.equal(derivedOwningHookTrap, 0);
    const derivedDetail = await propertyTaskRuntime.service.detail(
      scope, actor, fixture.taskId
    );
    const derivedList = await propertyTaskRuntime.service.list(
      scope, actor, Object.assign(new PropertyTaskListQueryDto(), { page: 1, pageSize: 100 })
    );
    assert.equal(derivedDetail.assignmentStatus, "claimed");
    assert.equal(derivedList.total, 1);
    assert.deepEqual(derivedList.items.map((item) => item.taskId), [fixture.taskId]);
    await assert.rejects(dataSource.query(
      `UPDATE biz_property_task_projection SET assignment_authority='owning'
        WHERE tenant_id=$1 AND park_id=$2 AND task_id=$3`,
      [tenantId, parkId, fixture.taskId]
    ), (error: unknown) => databaseCode(error) === "23514");
    await assert.rejects(dataSource.query(
      `UPDATE biz_property_task_projection SET derived_assignment_id=NULL
        WHERE tenant_id=$1 AND park_id=$2 AND task_id=$3`,
      [tenantId, parkId, fixture.taskId]
    ), (error: unknown) => databaseCode(error) === "23514");
    assert.deepEqual(await dataSource.query(
      `SELECT assignment_authority AS authority,
              derived_assignment_id::text AS "derivedAssignmentId"
         FROM biz_property_task_projection
        WHERE tenant_id=$1 AND park_id=$2 AND task_id=$3`,
      [tenantId, parkId, fixture.taskId]
    ), [{ authority: "derived", derivedAssignmentId: fixture.assignment.id }]);

    await activateMatrixScope("independent:derived-owning-boundary:owning");
    const sourceId = randomUUID();
    const occurrence = `owning-${randomUUID()}`;
    const identity = derivePropertyTaskIdentity({
      sourceType: "test_fixture_source",
      sourceId,
      taskKind: "test_fixture_owning_task",
      businessOccurrenceKey: occurrence
    });
    await dataSource.query(
      `INSERT INTO c4_property_task_source_fixture(
         tenant_id,park_id,source_id,source_version,lifecycle,
         business_occurrence_key,title)
       VALUES($1,$2,$3,1,'eligible',$4,'Owning runtime task')`,
      [tenantId, parkId, sourceId, occurrence]
    );
    const createdAt = "2026-08-01T00:00:00.000Z";
    const owningRows = await projections.withDatabaseContentHashes(dataSource.manager, [{
      taskId: identity.taskId,
      taskKey: identity.taskKey,
      assignmentAuthority: "owning",
      derivedAssignmentId: null,
      sourceType: "test_fixture_source",
      sourceId,
      sourceVersion: 1,
      businessOccurrenceKey: occurrence,
      taskKind: "test_fixture_owning_task",
      queueCode: "test_fixture_queue",
      title: "Owning runtime task",
      kindLabel: "Fixture",
      sourceLabel: "Fixture source",
      priority: 10,
      dueAt: null,
      assignmentStatus: "open",
      assignmentVersion: 1,
      assigneeId: null,
      assigneeDisplay: null,
      claimedAt: null,
      startedAt: null,
      blockedReason: null,
      blockedUntil: null,
      outcomeCode: null,
      outcomeSourceVersion: null,
      outcomeAt: null,
      sourceDeepLink: `/test_fixture_source/${sourceId}`,
      createdAt,
      updatedAt: createdAt
    }]);
    const headId = randomUUID();
    const headHash = createHash("sha256")
      .update(`${identity.taskId}\t${owningRows[0]!.contentHash}\n`).digest("hex");
    await dataSource.query(
      `INSERT INTO biz_property_task_projection_head(
         id,tenant_id,park_id,source_type,source_id,projection_version,
         content_hash,last_rebuilt_by)
       VALUES($1,$2,$3,'test_fixture_source',$4,1,$5,$6)`,
      [headId, tenantId, parkId, sourceId, headHash, actorId]
    );
    await dataSource.query(
      `INSERT INTO biz_property_task_projection(
         tenant_id,park_id,head_id,task_id,task_key,assignment_authority,
         derived_assignment_id,source_type,source_id,source_version,
         business_occurrence_key,task_kind,queue_code,title,kind_label,
         source_label,priority,assignment_status,assignment_version,
         assignee_id,assignee_display,projection_version,content_hash,
         source_deep_link,created_at,updated_at)
       VALUES($1,$2,$3,$4,$5,'owning',NULL,'test_fixture_source',$6,1,$7,
         'test_fixture_owning_task','test_fixture_queue','Owning runtime task',
         'Fixture','Fixture source',10,'open',1,NULL,NULL,1,$8,$9,$10,$10)`,
      [tenantId, parkId, headId, identity.taskId, identity.taskKey, sourceId,
        occurrence, owningRows[0]!.contentHash, `/test_fixture_source/${sourceId}`,
        createdAt]
    );
    let owningInvocations = 0;
    let owningState = {
      status: "open" as PropertyTaskStatus,
      version: 1,
      assigneeId: null as string | null,
      assigneeDisplay: null as string | null,
      claimedAt: null as string | null
    };
    const owningResolver: PropertyTaskSourceResolver = {
      sourceType: "test_fixture_source",
      taskKind: "test_fixture_owning_task",
      assignmentAuthority: "owning",
      access: propertyTaskRuntime.resolver.access,
      async lockAndResolve(input) {
        const manager = input.manager.transactionContext as EntityManager;
        const rows = await manager.query(
          `SELECT source_version::integer AS version,lifecycle
             FROM c4_property_task_source_fixture
            WHERE tenant_id=$1 AND park_id=$2 AND source_id=$3
              AND business_occurrence_key=$4 FOR UPDATE`,
          [input.scope.tenantId, input.scope.parkId, input.sourceId,
            input.businessOccurrenceKey]
        ) as Array<{ version: number; lifecycle: "eligible" }>;
        if (rows.length !== 1 || input.taskKey !== identity.taskKey) return null;
        assert.equal(rows[0]!.version, input.expectedSourceVersion);
        return {
          sourceId,
          sourceVersion: rows[0]!.version,
          lifecycle: rows[0]!.lifecycle,
          businessOccurrenceKey: occurrence,
          title: "Owning runtime task",
          kindLabel: "Fixture",
          sourceLabel: "Fixture source",
          priority: 10,
          dueAt: null,
          sourceDeepLink: `/test_fixture_source/${sourceId}`,
          owningAssignment: {
            ...owningState,
            blockedReason: null,
            blockedUntil: null,
            startedAt: null,
            outcomeCode: null,
            outcomeSourceVersion: null,
            outcomeAt: null,
            createdAt,
            updatedAt: owningState.claimedAt ?? createdAt
          }
        };
      },
      async invokeOwningCommand(input) {
        assert.equal(input.action, "property.task.claim");
        assert.equal(input.expectedSourceVersion, 1);
        assert.equal(input.expectedAssignmentVersion, 1);
        owningInvocations += 1;
        const manager = input.manager.transactionContext as EntityManager;
        const updated = exactReturningRows<{ source_version: number }>(
          await manager.query(
            `UPDATE c4_property_task_source_fixture
              SET source_version=2,mutation_count=mutation_count+1
            WHERE tenant_id=$1 AND park_id=$2 AND source_id=$3
              AND source_version=1 RETURNING source_version`,
            [tenantId, parkId, sourceId]
          )
        );
        assert.equal(updated.length, 1);
        owningState = {
          status: "claimed",
          version: 2,
          assigneeId: actorId,
          assigneeDisplay: actorDisplay,
          claimedAt: "2026-08-01T04:00:00.000Z"
        };
      }
    };
    const owningRegistry = {
      resolve: (sourceType: string, taskKind: string) =>
        sourceType === owningResolver.sourceType && taskKind === owningResolver.taskKind
          ? owningResolver : null,
      projectorsForSourceType: () => [],
      resolveProjector: () => null
    } as unknown as PropertyTaskSourceRegistryProvider;
    const owningAccess = {
      authorizeCommand: async () => true,
      canReadSourceDetails: async () => true,
      authorizeTaskRead: async () => true
    } as unknown as PropertyTaskAccessEvaluatorService;
    const owningOrchestrator = new PropertyTaskOrchestrator(
      dataSource, assignments, projections, owningRegistry, owningAccess,
      new PropertyTaskMapper(), receipts
    );
    const owningService = new PropertyTaskService(
      dataSource, projections, owningRegistry, owningAccess,
      new PropertyTaskMapper(), owningOrchestrator
    );
    const owningResult = await owningService.claim(scope, actor, identity.taskId, {
      clientKey: "independent-owning-claim",
      expectedAssignmentVersion: 1,
      expectedSourceVersion: 1,
      businessOccurrenceKey: occurrence
    });
    assert.equal(owningResult.replayed, false);
    assert.equal(owningInvocations, 1);
    const owningEvidence = await dataSource.query(
      `SELECT projection.assignment_authority AS authority,
              projection.derived_assignment_id AS "derivedAssignmentId",
              projection.assignment_status AS status,
              projection.assignment_version::integer AS version,
              source.mutation_count::integer AS "sourceMutations",
              (SELECT count(*)::integer FROM biz_property_task_assignment assignment
                WHERE assignment.tenant_id=$1 AND assignment.park_id=$2
                  AND assignment.source_id=$3) AS assignments,
              (SELECT count(*)::integer FROM biz_property_mutation_receipt receipt
                WHERE receipt.tenant_id=$1 AND receipt.park_id=$2
                  AND receipt.target_id=$4) AS receipts,
              (SELECT count(*)::integer FROM biz_property_task_projection_rebuild_audit audit
                WHERE audit.tenant_id=$1 AND audit.park_id=$2
                  AND audit.source_type=projection.source_type
                  AND audit.source_id=projection.source_id) AS replacements
         FROM biz_property_task_projection projection
         JOIN c4_property_task_source_fixture source
           ON source.tenant_id=projection.tenant_id AND source.park_id=projection.park_id
          AND source.source_id=projection.source_id
        WHERE projection.tenant_id=$1 AND projection.park_id=$2
          AND projection.task_id=$4`,
      [tenantId, parkId, sourceId, identity.taskId]
    ) as Array<Record<string, unknown>>;
    assert.deepEqual(owningEvidence, [{
      authority: "owning",
      derivedAssignmentId: null,
      status: "claimed",
      version: 2,
      sourceMutations: 1,
      assignments: 0,
      receipts: 1,
      replacements: 1
    }]);
    const owningDetail = await owningService.detail(scope, actor, identity.taskId);
    const owningList = await owningService.list(
      scope, actor, Object.assign(new PropertyTaskListQueryDto(), { page: 1, pageSize: 100 })
    );
    assert.equal(owningDetail.assignmentStatus, "claimed");
    assert.equal(owningList.total, 1);
    assert.deepEqual(owningList.items.map((item) => item.taskId), [identity.taskId]);
  }

  async function activateMatrixScope(matrixKey: string): Promise<void> {
    tenantId = deterministicMatrixUuid(`${matrixKey}:tenant`);
    parkId = deterministicMatrixUuid(`${matrixKey}:park`);
    actorId = deterministicMatrixUuid(`${matrixKey}:actor`);
    scope = { tenantId, parkId };
    actor = {
      sub: actorId,
      username: `c4_${actorId.replaceAll("-", "")}`,
      realName: actorDisplay,
      tenantId,
      parkId,
      roles: [],
      permissions: []
    };
    await dataSource.query(
      `INSERT INTO sys_user(
         id,tenant_id,park_id,username,display_name,password_hash,is_enabled)
       VALUES($1,$2,$3,$4,$5,$6,true)`,
      [actorId, tenantId, parkId, actor.username, actorDisplay,
        "!C4_PROPERTY_TASK_MATRIX_NO_LOGIN!"]
    );
    propertyTaskRuntime = createPropertyTaskRuntime();
  }

  function deterministicMatrixUuid(label: string): ReturnType<typeof randomUUID> {
    const hex = createHash("sha256").update(`c4-matrix-scope-v1:${label}`).digest("hex");
    return (`${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}`
      + `-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`) as ReturnType<typeof randomUUID>;
  }

  function assertMatrixIsolationMetadata(matrixCase: C4MatrixCase): void {
    const expected = matrixCase.family === "shared-fence"
      ? {
          holderIsolation: "READ COMMITTED",
          waiterIsolation: "READ COMMITTED",
          coordination: "pg-lock-wait"
        }
      : matrixCase.order === "rebuild-first"
        ? {
            holderIsolation: "SERIALIZABLE",
            waiterIsolation: "READ COMMITTED",
            coordination: "pg-lock-wait"
          }
        : {
            holderIsolation: "READ COMMITTED",
            waiterIsolation: "SERIALIZABLE",
            coordination: "post-commit-latch"
          };
    assert.deepEqual({
      holderIsolation: matrixCase.holderIsolation,
      waiterIsolation: matrixCase.waiterIsolation,
      coordination: matrixCase.coordination
    }, expected);
  }

  function matrixActionCase(key: string): CommandMatrixCase | TerminalMatrixCase {
    const candidate = [...commandMatrixCases, ...terminalMatrixCases]
      .find((item) => item.key === key);
    assert.ok(candidate, `unknown matrix action key: ${key}`);
    return candidate;
  }

  async function runCommandTerminalFence(
    matrixCase: C4MatrixCase,
    commandCase: CommandMatrixCase
  ): Promise<void> {
    const fixture = await insertRuntimeFixture(dataSource.manager, commandCase.initialStatus);
    const terminal = matrixCase.terminalKey?.endsWith("-cancelled")
      ? "cancelled" as const : "closed" as const;
    assert.equal(
      matrixCase.terminalKey,
      `terminal-${commandCase.initialStatus.replaceAll("_", "-")}-${terminal}`
    );
    const coordinator = createConcurrencyCoordinator();
    const observer = await openMatrixObserver(matrixCase.key);
    let holderPid = 0;
    let waiterPid = 0;
    const holderIsCommand = matrixCase.order === "command-first";
    const holder = executeMatrixAction(
      holderIsCommand ? commandCase : terminalCase(commandCase.initialStatus, terminal),
      fixture,
      `${matrixCase.key}:holder`,
      {
        beforeSourceLock: ({ pid }) => { holderPid = pid; },
        afterSourceLock: async () => {
          coordinator.signal("after-first-lock");
          await coordinator.wait("lock-before-ready");
        }
      }
    );
    let waiter: Promise<unknown> | null = null;
    let primaryError: unknown | null = null;
    try {
      await coordinator.wait("after-first-lock");
      waiter = executeMatrixAction(
        holderIsCommand ? terminalCase(commandCase.initialStatus, terminal) : commandCase,
        fixture,
        `${matrixCase.key}:waiter`,
        { beforeSourceLock: ({ pid }) => {
          waiterPid = pid;
          coordinator.signal("waiter-started");
        } }
      );
      await coordinator.wait("waiter-started");
      await observeLockWait(
        observer.manager, waiterPid, holderPid,
        [watchActor("holder", holder), watchActor("waiter", waiter)]
      );
      coordinator.signal("lock-before-ready");
      const [holderResult, waiterResult] = await Promise.allSettled([holder, waiter]);
      assert.equal(holderResult.status, "fulfilled");
      assert.equal(waiterResult.status, "rejected");
      assert.equal(errorCode(waiterResult.status === "rejected"
        ? waiterResult.reason : null),
      holderIsCommand ? "property-version-conflict" : "task-source-ineligible");
      const winnerCase = holderIsCommand
        ? commandCase : terminalCase(commandCase.initialStatus, terminal);
      await assertMatrixOneWinnerZeroSideEffects(fixture, winnerCase, {
        terminal: holderIsCommand ? null : terminal,
        projectionVersion: 2,
        replacementOrder: ["action"],
        operationKeys: [`${matrixCase.key}:holder`]
      });
    } catch (error) {
      primaryError = error;
      throw error;
    } finally {
      coordinator.signal("lock-before-ready");
      await settleMatrixWorkBeforeObserverCleanup(
        [holder, ...(waiter === null ? [] : [waiter])], primaryError
      );
      await cleanupQueryRunners([observer], "matrix observer", primaryError);
    }
  }

  async function runRebuildFirstMatrix(
    matrixCase: C4MatrixCase,
    actionCase: CommandMatrixCase | TerminalMatrixCase
  ): Promise<void> {
    const fixture = await insertRuntimeFixture(dataSource.manager, actionCase.initialStatus);
    const coordinator = createConcurrencyCoordinator();
    const observer = await openMatrixObserver(matrixCase.key);
    let holderPid = 0;
    let waiterPid = 0;
    const holder = executeMatrixRebuild(fixture, 1, `${matrixCase.key}:rebuild`, {
      beforeSourceLock: ({ pid }) => { holderPid = pid; },
      afterSourceLock: async () => {
        coordinator.signal("after-first-lock");
        await coordinator.wait("lock-before-ready");
      }
    });
    let waiter: Promise<unknown> | null = null;
    let primaryError: unknown | null = null;
    try {
      await coordinator.wait("after-first-lock");
      waiter = executeMatrixAction(actionCase, fixture, `${matrixCase.key}:action`, {
        beforeSourceLock: ({ pid }) => {
          waiterPid = pid;
          coordinator.signal("waiter-started");
        }
      });
      await coordinator.wait("waiter-started");
      await observeLockWait(
        observer.manager, waiterPid, holderPid,
        [watchActor("holder", holder), watchActor("waiter", waiter)]
      );
      coordinator.signal("lock-before-ready");
      const results = await Promise.allSettled([holder, waiter]);
      assert.ok(results.every((result) => result.status === "fulfilled"));
      await assertMatrixTwoSuccessVersionsReceiptsAudits(fixture, actionCase, {
        terminal: actionCase.kind === "terminal" ? actionCase.terminal : null,
        projectionVersion: 3,
        replacementOrder: ["rebuild", "action"],
        operationKeys: [`${matrixCase.key}:rebuild`, `${matrixCase.key}:action`]
      });
    } catch (error) {
      primaryError = error;
      throw error;
    } finally {
      coordinator.signal("lock-before-ready");
      await settleMatrixWorkBeforeObserverCleanup(
        [holder, ...(waiter === null ? [] : [waiter])], primaryError
      );
      await cleanupQueryRunners([observer], "matrix observer", primaryError);
    }
  }

  async function runActionFirstRebuildMatrix(
    matrixCase: C4MatrixCase,
    actionCase: CommandMatrixCase | TerminalMatrixCase
  ): Promise<void> {
    const fixture = await insertRuntimeFixture(dataSource.manager, actionCase.initialStatus);
    const postCommit = createPostCommitEvidence(matrixCase.key);
    await executeMatrixAction(actionCase, fixture, `${matrixCase.key}:action`);
    postCommit.markActionCommitted();
    await postCommit.beforeRebuildStart();
    if (matrixCase.order === "action-first-stale-N") {
      await assert.rejects(
        executeMatrixRebuild(fixture, 1, `${matrixCase.key}:rebuild`),
        (error: unknown) => errorCode(error) === "task-version-conflict"
      );
      postCommit.assertComplete();
      await assertMatrixStaleConflictZeroSideEffects(fixture, actionCase, {
        terminal: actionCase.kind === "terminal" ? actionCase.terminal : null,
        projectionVersion: 2,
        replacementOrder: ["action"],
        operationKeys: [`${matrixCase.key}:action`]
      });
      return;
    }
    await executeMatrixRebuild(fixture, 2, `${matrixCase.key}:rebuild`);
    postCommit.assertComplete();
    await assertMatrixTwoSuccessVersionsReceiptsAudits(fixture, actionCase, {
      terminal: actionCase.kind === "terminal" ? actionCase.terminal : null,
      projectionVersion: 3,
      replacementOrder: ["action", "rebuild"],
      operationKeys: [`${matrixCase.key}:action`, `${matrixCase.key}:rebuild`]
    });
  }

  async function settleMatrixWorkBeforeObserverCleanup(
    work: readonly Promise<unknown>[],
    primaryError: unknown | null
  ): Promise<void> {
    const results = await Promise.allSettled(work);
    if (primaryError !== null) {
      recordSecondaryCleanupErrors(primaryError, results.flatMap((result) =>
        result.status === "rejected" ? [result.reason] : []));
    }
  }

  function createPostCommitEvidence(label: string) {
    let actionCommitted = false;
    let rebuildStarted = false;
    let releaseCommitLatch: () => void = () => {};
    const commitLatch = new Promise<void>((resolveCommit) => {
      releaseCommitLatch = resolveCommit;
    });
    return {
      markActionCommitted(): void {
        actionCommitted = true;
        releaseCommitLatch();
      },
      async beforeRebuildStart(): Promise<void> {
        await commitLatch;
        assert.equal(actionCommitted, true, `${label}: action commit not observed`);
        rebuildStarted = true;
      },
      assertComplete(): void {
        assert.deepEqual({ actionCommitted, rebuildStarted, lockWaitClaimed: false }, {
          actionCommitted: true,
          rebuildStarted: true,
          lockWaitClaimed: false
        });
      }
    };
  }

  function terminalCase(
    initialStatus: CommandMatrixCase["initialStatus"],
    terminal: "closed" | "cancelled"
  ): TerminalMatrixCase {
    return {
      key: `terminal-${initialStatus.replaceAll("_", "-")}-${terminal}`,
      kind: "terminal",
      terminal,
      initialStatus,
      finalStatus: terminal
    };
  }

  async function executeMatrixAction(
    actionCase: CommandMatrixCase | TerminalMatrixCase,
    fixture: Awaited<ReturnType<typeof insertRuntimeFixture>>,
    clientKey: string,
    hooks: Pick<C4FixtureOperationContext,
    "beforeSourceLock" | "afterSourceLock" | "lateFailure" | "lateFailureEvidence"> = {}
  ): Promise<unknown> {
    if (actionCase.kind === "terminal") {
      const outcomeAt = "2026-08-01T03:00:00.000Z";
      const request: PropertyTaskSourceTerminalRequestV1 = {
        schemaVersion: "property-task-source-terminal-v1",
        tenantId,
        parkId,
        terminalActorId: actorId,
        actionId: `property.task.source-terminal.${actionCase.terminal}`,
        targetId: fixture.sourceId,
        sourceType: fixture.sourceType,
        sourceId: fixture.sourceId,
        businessOccurrenceKey: fixture.occurrence,
        taskKey: fixture.assignment.taskKey,
        terminal: actionCase.terminal,
        sourceVersion: 1,
        expectedAssignmentVersion: 1,
        outcomeCode: `fixture-${actionCase.terminal}`,
        outcomeAt
      };
      return propertyTaskRuntime.runOperation({
        operation: "terminal",
        terminal: actionCase.terminal,
        sourceMutation: "apply-terminal",
        sourceVersion: 1,
        outcomeCode: request.outcomeCode,
        outcomeAt,
        ...hooks
      }, () => propertyTaskRuntime.orchestrator.sourceTerminal(request));
    }
    const request = matrixCommandExecutionRequest(
      actionCase, clientKey, fixture.occurrence
    );
    return propertyTaskRuntime.runOperation({ operation: "command", ...hooks }, () => {
      if (actionCase.action === "property.task.claim") {
        return propertyTaskRuntime.service.claim(scope, actor, fixture.taskId, request);
      }
      if (actionCase.action === "property.task.start") {
        return propertyTaskRuntime.service.start(scope, actor, fixture.taskId, request);
      }
      if (actionCase.action === "property.task.block") {
        return propertyTaskRuntime.service.block(scope, actor, fixture.taskId,
          request as Parameters<PropertyTaskService["block"]>[3]);
      }
      if (actionCase.action === "property.task.unblock") {
        return propertyTaskRuntime.service.unblock(scope, actor, fixture.taskId, request);
      }
      return propertyTaskRuntime.service.release(scope, actor, fixture.taskId,
        request as Parameters<PropertyTaskService["release"]>[3]);
    });
  }

  function matrixCommandExecutionRequest(
    actionCase: CommandMatrixCase,
    clientKey: string,
    businessOccurrenceKey: string
  ) {
    const request = {
      clientKey,
      expectedAssignmentVersion: 1,
      expectedSourceVersion: 1,
      businessOccurrenceKey
    };
    if (actionCase.action === "property.task.block") {
      return { ...request, reason: "fixture block", blockedUntil: null };
    }
    if (actionCase.action === "property.task.release") {
      return { ...request, reason: "fixture release" };
    }
    return request;
  }

  function executeMatrixRebuild(
    fixture: Awaited<ReturnType<typeof insertRuntimeFixture>>,
    expectedProjectionVersion: number,
    clientKey: string,
    hooks: Pick<C4FixtureOperationContext,
    "beforeSourceLock" | "afterSourceLock" | "beforeProjectionLock"
    | "afterProjectionLock"> = {}
  ): Promise<unknown> {
    return propertyTaskRuntime.runOperation({ operation: "rebuild", ...hooks }, () =>
      propertyTaskRuntime.service.rebuild(scope, actor, {
        clientKey,
        sourceType: fixture.sourceType,
        sourceId: fixture.sourceId,
        expectedProjectionVersion,
        reason: "fixture matrix rebuild"
      }));
  }

  async function openMatrixObserver(label: string): Promise<QueryRunner> {
    const observer = dataSource.createQueryRunner();
    await observer.connect();
    await observer.startTransaction("READ COMMITTED");
    await observer.query(OBSERVER_STATEMENT_TIMEOUT_SQL);
    await observer.query("SELECT set_config('application_name',$1,true)", [
      `c4-matrix-${label}-observer`
    ]);
    return observer;
  }

  type MatrixPersistenceExpected = {
    terminal: "closed" | "cancelled" | null;
    projectionVersion: 2 | 3;
    replacementOrder: readonly ("action" | "rebuild")[];
    operationKeys: readonly string[];
  };

  async function assertMatrixOneWinnerZeroSideEffects(
    fixture: Awaited<ReturnType<typeof insertRuntimeFixture>>,
    actionCase: CommandMatrixCase | TerminalMatrixCase,
    expected: MatrixPersistenceExpected
  ): Promise<void> {
    assert.equal(expected.replacementOrder.length, 1);
    await assertMatrixPersistence(fixture, actionCase, expected);
  }

  async function assertMatrixStaleConflictZeroSideEffects(
    fixture: Awaited<ReturnType<typeof insertRuntimeFixture>>,
    actionCase: CommandMatrixCase | TerminalMatrixCase,
    expected: MatrixPersistenceExpected
  ): Promise<void> {
    assert.deepEqual(expected.replacementOrder, ["action"]);
    await assertMatrixPersistence(fixture, actionCase, expected);
  }

  async function assertMatrixTwoSuccessVersionsReceiptsAudits(
    fixture: Awaited<ReturnType<typeof insertRuntimeFixture>>,
    actionCase: CommandMatrixCase | TerminalMatrixCase,
    expected: MatrixPersistenceExpected
  ): Promise<void> {
    assert.equal(expected.replacementOrder.length, 2);
    await assertMatrixPersistence(fixture, actionCase, expected);
  }

  async function assertRawAuthorityAndConsecutiveVersions(
    fixture: Awaited<ReturnType<typeof insertRuntimeFixture>>,
    actionCase: CommandMatrixCase | TerminalMatrixCase,
    expected: MatrixPersistenceExpected
  ): Promise<void> {
    const rows = await dataSource.query(
      `SELECT assignment.assignment_status AS status,
              assignment.version::integer AS "assignmentVersion",
              source.source_version::integer AS "sourceVersion",
              source.lifecycle,source.mutation_count::integer AS "mutationCount",
              head.projection_version::integer AS "projectionVersion"
         FROM biz_property_task_assignment assignment
         JOIN c4_property_task_source_fixture source
           ON source.tenant_id=assignment.tenant_id AND source.park_id=assignment.park_id
          AND source.source_id=assignment.source_id
         JOIN biz_property_task_projection_head head
           ON head.tenant_id=assignment.tenant_id AND head.park_id=assignment.park_id
          AND head.source_type=assignment.source_type AND head.source_id=assignment.source_id
        WHERE assignment.tenant_id=$1 AND assignment.park_id=$2 AND assignment.id=$3`,
      [tenantId, parkId, fixture.assignment.id]
    ) as Array<{ status: string; assignmentVersion: number; sourceVersion: number;
      lifecycle: string; mutationCount: number; projectionVersion: number }>;
    assert.deepEqual(rows, [{
      status: actionCase.finalStatus,
      assignmentVersion: 2,
      sourceVersion: 1,
      lifecycle: expected.terminal === null ? "eligible"
        : expected.terminal === "closed" ? "succeeded" : "cancelled",
      mutationCount: expected.terminal === null ? 0 : 1,
      projectionVersion: expected.projectionVersion
    }]);
  }

  async function assertCompleteProjectionRowsAndHashes(
    fixture: Awaited<ReturnType<typeof insertRuntimeFixture>>,
    actionCase: CommandMatrixCase | TerminalMatrixCase,
    expected: MatrixPersistenceExpected
  ): Promise<void> {
    const rows = await dataSource.query(
      `SELECT projection.task_id::text AS "taskId",
              projection.content_hash AS "rowHash",head.content_hash AS "headHash",
              projection.assignment_status AS status,
              projection.assignment_version::integer AS version,
              projection.projection_version::integer AS "rowProjectionVersion",
              head.projection_version::integer AS "headProjectionVersion"
         FROM biz_property_task_projection_head head
         JOIN biz_property_task_projection projection
           ON projection.tenant_id=head.tenant_id AND projection.park_id=head.park_id
          AND projection.head_id=head.id
        WHERE head.tenant_id=$1 AND head.park_id=$2
          AND head.source_type=$3 AND head.source_id=$4
        ORDER BY projection.task_id`,
      [tenantId, parkId, fixture.sourceType, fixture.sourceId]
    ) as Array<{ taskId: string; rowHash: string; headHash: string; status: string;
      version: number; rowProjectionVersion: number; headProjectionVersion: number }>;
    assert.equal(rows.length, 1);
    assert.deepEqual({
      taskId: rows[0]!.taskId,
      status: rows[0]!.status,
      version: rows[0]!.version,
      rowProjectionVersion: rows[0]!.rowProjectionVersion,
      headProjectionVersion: rows[0]!.headProjectionVersion
    }, {
      taskId: fixture.taskId,
      status: actionCase.finalStatus,
      version: 2,
      rowProjectionVersion: expected.projectionVersion,
      headProjectionVersion: expected.projectionVersion
    });
    assert.match(rows[0]!.rowHash, /^[0-9a-f]{64}$/u);
    const projection = await projections.findByTaskId(
      dataSource.manager, scope, fixture.taskId
    );
    assert.ok(projection);
    const databaseHashes = await dataSource.query(
      `SELECT public.fn_property_task_projection_row_hash_v1($1::jsonb)::text AS hash`,
      [JSON.stringify({
        taskId: projection.taskId,
        taskKey: projection.taskKey,
        assignmentAuthority: projection.assignmentAuthority,
        derivedAssignmentId: projection.derivedAssignmentId,
        sourceType: projection.sourceType,
        sourceId: projection.sourceId,
        sourceVersion: projection.sourceVersion,
        businessOccurrenceKey: projection.businessOccurrenceKey,
        taskKind: projection.taskKind,
        queueCode: projection.queueCode,
        title: projection.title,
        kindLabel: projection.kindLabel,
        sourceLabel: projection.sourceLabel,
        priority: projection.priority,
        dueAt: fixtureIso(projection.dueAt),
        assignmentStatus: projection.assignmentStatus,
        assignmentVersion: projection.assignmentVersion,
        assigneeId: projection.assigneeId,
        assigneeDisplay: projection.assigneeDisplay,
        claimedAt: fixtureIso(projection.claimedAt),
        startedAt: fixtureIso(projection.startedAt),
        blockedReason: projection.blockedReason,
        blockedUntil: fixtureIso(projection.blockedUntil),
        outcomeCode: projection.outcomeCode,
        outcomeSourceVersion: projection.outcomeSourceVersion,
        outcomeAt: fixtureIso(projection.outcomeAt),
        sourceDeepLink: projection.sourceDeepLink,
        contentHash: "0".repeat(64),
        createdAt: fixtureIso(projection.createdAt),
        updatedAt: fixtureIso(projection.updatedAt)
      })]
    ) as Array<{ hash: string }>;
    assert.equal(rows[0]!.rowHash, databaseHashes[0]!.hash);
    assert.equal(rows[0]!.headHash, createHash("sha256")
      .update(`${fixture.taskId}\t${rows[0]!.rowHash}\n`).digest("hex"));
  }

  async function assertExactReceiptsAndAudits(
    fixture: Awaited<ReturnType<typeof insertRuntimeFixture>>,
    actionCase: CommandMatrixCase | TerminalMatrixCase,
    expected: MatrixPersistenceExpected
  ): Promise<void> {
    assert.equal(expected.operationKeys.length, expected.replacementOrder.length);
    const actionId = actionCase.kind === "command"
      ? actionCase.action : `property.task.source-terminal.${actionCase.terminal}`;
    const actionResultVersion = actionCase.kind === "command" ? 2 : 1;
    const expectedRows = expected.replacementOrder.map((kind, index) => ({
      action: kind === "rebuild" ? "property.task.rebuild" : actionId,
      mode: kind === "rebuild" ? "manual-rebuild" : "authority-sync",
      fromVersion: index + 1,
      toVersion: index + 2,
      businessResultVersion: kind === "rebuild" ? index + 2 : actionResultVersion,
      operationKey: expected.operationKeys[index]!
    }));
    const receiptsRows = await dataSource.query(
      `SELECT actor_id::text AS "actorId",action_id AS action,
              target_id::text AS "targetId",client_key AS "clientKey",
              request_hash::text AS "requestHash",receipt_status AS status,
              identity_kind AS "identityKind",
              business_occurrence_key AS "businessOccurrenceKey",
              task_key::text AS "taskKey",identity_source_type AS "identitySourceType",
              result_ref AS "resultRef",result_hash::text AS "resultHash",
              result_version::integer AS "resultVersion"
         FROM biz_property_mutation_receipt
        WHERE tenant_id=$1 AND park_id=$2
          AND target_id IN ($3::uuid,$4::uuid)
        ORDER BY created_at,action_id`,
      [tenantId, parkId, fixture.taskId, fixture.sourceId]
    ) as Array<{ actorId: string; action: string; targetId: string; clientKey: string;
      requestHash: string; status: string; identityKind: string;
      businessOccurrenceKey: string | null; taskKey: string | null;
      identitySourceType: string | null; resultRef: string; resultHash: string;
      resultVersion: number }>;
    assert.equal(receiptsRows.length, expectedRows.length);
    for (const [index, receipt] of receiptsRows.entries()) {
      const row = expectedRows[index]!;
      const isRebuild = row.mode === "manual-rebuild";
      const isTerminal = !isRebuild && actionCase.kind === "terminal";
      const terminalRequest = isTerminal
        ? matrixTerminalRequest(fixture, actionCase.terminal) : null;
      const clientKey = terminalRequest
        ? `${PROPERTY_TASK_TERMINAL_CLIENT_KEY_PREFIX}${sha256Hex(
          propertyTaskSourceTerminalClientKeyCanonicalBytes(terminalRequest)
        )}`
        : row.operationKey;
      const request = isRebuild ? {
        clientKey,
        sourceType: fixture.sourceType,
        sourceId: fixture.sourceId,
        expectedProjectionVersion: row.fromVersion,
        reason: "fixture matrix rebuild"
      } : terminalRequest ?? matrixCommandRequest(
        actionCase as CommandMatrixCase, clientKey, fixture
      );
      const identity = isRebuild ? {
        tag: "property-task-source-rebuild" as const,
        sourceType: fixture.sourceType,
        sourceId: fixture.sourceId
      } : {
        tag: "property-task" as const,
        businessOccurrenceKey: fixture.occurrence,
        taskKey: fixture.assignment.taskKey
      };
      const targetId = isRebuild || isTerminal ? fixture.sourceId : fixture.taskId;
      const resultRef = isRebuild
        ? `property-task-rebuild/${fixture.sourceType}/${fixture.sourceId}/v${row.businessResultVersion}`
        : isTerminal
          ? `property-task-source-terminal/${fixture.sourceType}/${fixture.sourceId}/${actionCase.terminal}/v1`
          : `property-task/${fixture.taskId}/v2`;
      const resultHash = await propertyTaskMutationResultHash({
        actionId: row.action as Parameters<typeof propertyTaskMutationResultHash>[0]["actionId"],
        targetId,
        identity,
        resultRef,
        resultVersion: row.businessResultVersion
      });
      const expectedRequestHash = independentRequestHash(request);
      if (!isRebuild && actionCase.kind === "command") {
        const incompleteEnvelopeHash = independentRequestHash(
          matrixCommandExecutionRequest(actionCase, clientKey, fixture.occurrence)
        );
        assert.equal(receipt.requestHash, expectedRequestHash,
          `${actionCase.action}: complete command envelope hash positive proof`);
        assert.notEqual(receipt.requestHash, incompleteEnvelopeHash,
          `${actionCase.action}: incomplete command envelope hash negative proof`);
      }
      assert.deepEqual(receipt, {
        actorId,
        action: row.action,
        targetId,
        clientKey,
        requestHash: expectedRequestHash,
        status: "completed",
        identityKind: identity.tag,
        businessOccurrenceKey: isRebuild ? null : fixture.occurrence,
        taskKey: isRebuild ? null : fixture.assignment.taskKey,
        identitySourceType: isRebuild ? fixture.sourceType : null,
        resultRef,
        resultHash,
        resultVersion: row.businessResultVersion
      });
    }
    const assignmentAudits = await dataSource.query(
      `SELECT action_id AS action,from_version::integer AS "fromVersion",
              to_version::integer AS "toVersion"
         FROM biz_property_task_assignment_audit
        WHERE tenant_id=$1 AND park_id=$2 AND assignment_id=$3`,
      [tenantId, parkId, fixture.assignment.id]
    ) as Array<{ action: string; fromVersion: number; toVersion: number }>;
    assert.deepEqual(assignmentAudits, [{ action: actionId, fromVersion: 1, toVersion: 2 }]);
    const replacementAudits = await dataSource.query(
      `SELECT command_action AS action,replace_mode AS mode,
              from_projection_version::integer AS "fromVersion",
              to_projection_version::integer AS "toVersion",
              business_result_version::integer AS "businessResultVersion"
         FROM biz_property_task_projection_rebuild_audit
        WHERE tenant_id=$1 AND park_id=$2 AND source_type=$3 AND source_id=$4
        ORDER BY to_projection_version`,
      [tenantId, parkId, fixture.sourceType, fixture.sourceId]
    ) as Array<{ action: string; mode: string; fromVersion: number;
      toVersion: number; businessResultVersion: number }>;
    assert.deepEqual(replacementAudits, expectedRows.map(({
      action, mode, fromVersion, toVersion, businessResultVersion
    }) => ({ action, mode, fromVersion, toVersion, businessResultVersion })));
  }

  function matrixTerminalRequest(
    fixture: Awaited<ReturnType<typeof insertRuntimeFixture>>,
    terminal: "closed" | "cancelled"
  ): PropertyTaskSourceTerminalRequestV1 {
    return {
      schemaVersion: "property-task-source-terminal-v1",
      tenantId,
      parkId,
      terminalActorId: actorId,
      actionId: `property.task.source-terminal.${terminal}`,
      targetId: fixture.sourceId,
      sourceType: fixture.sourceType,
      sourceId: fixture.sourceId,
      businessOccurrenceKey: fixture.occurrence,
      taskKey: fixture.assignment.taskKey,
      terminal,
      sourceVersion: 1,
      expectedAssignmentVersion: 1,
      outcomeCode: `fixture-${terminal}`,
      outcomeAt: "2026-08-01T03:00:00.000Z"
    };
  }

  function matrixCommandRequest(
    actionCase: CommandMatrixCase,
    clientKey: string,
    fixture: Awaited<ReturnType<typeof insertRuntimeFixture>>
  ): Record<string, unknown> {
    return {
      actionId: actionCase.action,
      actorId,
      taskId: fixture.taskId,
      ...matrixCommandExecutionRequest(actionCase, clientKey, fixture.occurrence)
    };
  }

  async function assertMatrixPersistence(
    fixture: Awaited<ReturnType<typeof insertRuntimeFixture>>,
    actionCase: CommandMatrixCase | TerminalMatrixCase,
    expected: MatrixPersistenceExpected
  ): Promise<void> {
    await assertRawAuthorityAndConsecutiveVersions(fixture, actionCase, expected);
    await assertCompleteProjectionRowsAndHashes(fixture, actionCase, expected);
    await assertExactReceiptsAndAudits(fixture, actionCase, expected);
    const assignmentRows = await dataSource.query(
      `SELECT assignment_status AS status,version::integer
         FROM biz_property_task_assignment
        WHERE tenant_id=$1 AND park_id=$2 AND id=$3`,
      [tenantId, parkId, fixture.assignment.id]
    ) as Array<{ status: string; version: number }>;
    assert.deepEqual(assignmentRows, [{ status: actionCase.finalStatus, version: 2 }]);
    const sourceRows = await dataSource.query(
      `SELECT source_version::integer AS "sourceVersion",lifecycle,
              outcome_code AS "outcomeCode",mutation_count::integer AS "mutationCount"
         FROM c4_property_task_source_fixture
        WHERE tenant_id=$1 AND park_id=$2 AND source_id=$3`,
      [tenantId, parkId, fixture.sourceId]
    ) as Array<{ sourceVersion: number; lifecycle: string; outcomeCode: string | null;
      mutationCount: number }>;
    assert.deepEqual(sourceRows, [{
      sourceVersion: 1,
      lifecycle: expected.terminal === null ? "eligible"
        : expected.terminal === "closed" ? "succeeded" : "cancelled",
      outcomeCode: expected.terminal === null ? null : `fixture-${expected.terminal}`,
      mutationCount: expected.terminal === null ? 0 : 1
    }]);
    const projectionRows = await dataSource.query(
      `SELECT head.projection_version::integer AS "projectionVersion",
              head.content_hash AS "headHash",projection.content_hash AS "rowHash",
              projection.assignment_status AS status,
              projection.assignment_version::integer AS version
         FROM biz_property_task_projection_head head
         JOIN biz_property_task_projection projection
           ON projection.tenant_id=head.tenant_id AND projection.park_id=head.park_id
          AND projection.head_id=head.id
        WHERE head.tenant_id=$1 AND head.park_id=$2
          AND head.source_type=$3 AND head.source_id=$4`,
      [tenantId, parkId, fixture.sourceType, fixture.sourceId]
    ) as Array<{ projectionVersion: number; headHash: string; rowHash: string;
      status: string; version: number }>;
    assert.equal(projectionRows.length, 1);
    assert.equal(projectionRows[0]!.projectionVersion, expected.projectionVersion);
    assert.equal(projectionRows[0]!.status, actionCase.finalStatus);
    assert.equal(projectionRows[0]!.version, 2);
    assert.match(projectionRows[0]!.headHash, /^[0-9a-f]{64}$/u);
    assert.match(projectionRows[0]!.rowHash, /^[0-9a-f]{64}$/u);
    const actionId = actionCase.kind === "command"
      ? actionCase.action : `property.task.source-terminal.${actionCase.terminal}`;
    const expectedActions = expected.replacementOrder.map((kind) =>
      kind === "rebuild" ? "property.task.rebuild" : actionId);
    const receiptsRows = await dataSource.query(
      `SELECT action_id AS action,receipt_status AS status
         FROM biz_property_mutation_receipt
        WHERE tenant_id=$1 AND park_id=$2
          AND target_id IN ($3::uuid,$4::uuid)
        ORDER BY created_at,action_id`,
      [tenantId, parkId, fixture.taskId, fixture.sourceId]
    ) as Array<{ action: string; status: string }>;
    assert.deepEqual(receiptsRows.map((row) => row.action), expectedActions);
    assert.ok(receiptsRows.every((row) => row.status === "completed"));
    const assignmentAudits = await dataSource.query(
      `SELECT action_id AS action
         FROM biz_property_task_assignment_audit
        WHERE tenant_id=$1 AND park_id=$2 AND assignment_id=$3`,
      [tenantId, parkId, fixture.assignment.id]
    ) as Array<{ action: string }>;
    assert.deepEqual(assignmentAudits.map((row) => row.action), [actionId]);
    const replacementAudits = await dataSource.query(
      `SELECT command_action AS action,
              from_projection_version::integer AS "fromVersion",
              to_projection_version::integer AS "toVersion"
         FROM biz_property_task_projection_rebuild_audit
        WHERE tenant_id=$1 AND park_id=$2 AND source_type=$3 AND source_id=$4
        ORDER BY to_projection_version`,
      [tenantId, parkId, fixture.sourceType, fixture.sourceId]
    ) as Array<{ action: string; fromVersion: number; toVersion: number }>;
    assert.deepEqual(replacementAudits.map((row) => row.action), expectedActions);
    assert.ok(replacementAudits.every((row) => row.toVersion === row.fromVersion + 1));
    const detail = await propertyTaskRuntime.runOperation(
      { operation: "read" },
      () => propertyTaskRuntime.service.detail(scope, actor, fixture.taskId)
    );
    const list = await propertyTaskRuntime.runOperation(
      { operation: "read" },
      () => propertyTaskRuntime.service.list(scope, actor,
        Object.assign(new PropertyTaskListQueryDto(), { page: 1, pageSize: 100 }))
    );
    const visibleCountRows = await dataSource.query(
      `SELECT count(*)::integer AS total
         FROM biz_property_task_projection
        WHERE tenant_id=$1 AND park_id=$2
          AND source_type='test_fixture_source' AND task_kind='test_fixture_task'`,
      [tenantId, parkId]
    ) as Array<{ total: number }>;
    assert.equal(detail.assignmentStatus, actionCase.finalStatus);
    assert.equal(visibleCountRows[0]!.total, 1);
    assert.equal(list.total, 1);
    assert.deepEqual(list.items.map((item) => ({
      taskId: item.taskId,
      assignmentStatus: item.assignmentStatus
    })), [{
      taskId: fixture.taskId,
      assignmentStatus: actionCase.finalStatus
    }]);
  }

  async function openConcurrentActors(
    label: string,
    isolation?: {
      holder: "READ COMMITTED" | "SERIALIZABLE";
      waiter: "READ COMMITTED" | "SERIALIZABLE";
    }
  ): Promise<{
    holder: QueryRunner;
    waiter: QueryRunner;
    observer: QueryRunner;
    holderPid: number;
    waiterPid: number;
  }> {
    const holder = dataSource.createQueryRunner();
    const waiter = dataSource.createQueryRunner();
    const observer = dataSource.createQueryRunner();
    try {
      await holder.connect();
      await waiter.connect();
      await observer.connect();
      await holder.startTransaction(isolation?.holder ?? "SERIALIZABLE");
      await waiter.startTransaction(isolation?.waiter ?? "SERIALIZABLE");
      await observer.startTransaction("READ COMMITTED");
      for (const [role, runner] of [
        ["holder", holder], ["waiter", waiter], ["observer", observer]
      ] as const) {
        await runner.query(WAITER_LOCK_TIMEOUT_SQL);
        await runner.query(ACTOR_STATEMENT_TIMEOUT_SQL);
        await runner.query("SET LOCAL deadlock_timeout='1s'");
        await runner.query("SELECT set_config('application_name',$1,true)", [
          `c4-${label}-${role}`
        ]);
      }
      await observer.query(OBSERVER_STATEMENT_TIMEOUT_SQL);
      const holderPidRows = await holder.query(
        "SELECT pg_backend_pid()::integer AS pid"
      ) as Array<{ pid: number }>;
      const waiterPidRows = await waiter.query(
        "SELECT pg_backend_pid()::integer AS pid"
      ) as Array<{ pid: number }>;
      return {
        holder,
        waiter,
        observer,
        holderPid: holderPidRows[0]!.pid,
        waiterPid: waiterPidRows[0]!.pid
      };
    } catch (error) {
      await releaseConcurrentActors({ holder, waiter, observer }, error);
      throw error;
    }
  }

  async function observeLockWait(
    manager: EntityManager,
    waiterPid: number,
    holderPid: number,
    actorWatches: readonly ActorWatch[]
  ): Promise<void> {
    // Finish observation well before the waiter's 5s server-side lock timeout.
    // Do not race a JS watchdog against manager.query: rejecting that wrapper
    // cannot cancel the PostgreSQL query and can leave work using the runner.
    const absoluteDeadline = Date.now() + OBSERVER_DEADLINE_MS;
    while (Date.now() < absoluteDeadline) {
      const actorFailure = prematureActorFailure(actorWatches);
      if (actorFailure !== null) throw actorFailure;
      let rows: Array<{ waitEventType: string | null; waitingOnHolder: boolean }>;
      try {
        rows = await manager.query(
          `SELECT activity.wait_event_type AS "waitEventType",
                  EXISTS(
                    SELECT 1
                      FROM pg_locks waiter_lock
                      JOIN pg_locks holder_lock
                        ON holder_lock.pid=$2 AND holder_lock.granted=true
                       AND holder_lock.locktype IS NOT DISTINCT FROM waiter_lock.locktype
                       AND holder_lock.database IS NOT DISTINCT FROM waiter_lock.database
                       AND holder_lock.relation IS NOT DISTINCT FROM waiter_lock.relation
                       AND holder_lock.page IS NOT DISTINCT FROM waiter_lock.page
                       AND holder_lock.tuple IS NOT DISTINCT FROM waiter_lock.tuple
                       AND holder_lock.virtualxid IS NOT DISTINCT FROM waiter_lock.virtualxid
                       AND holder_lock.transactionid IS NOT DISTINCT FROM waiter_lock.transactionid
                       AND holder_lock.classid IS NOT DISTINCT FROM waiter_lock.classid
                       AND holder_lock.objid IS NOT DISTINCT FROM waiter_lock.objid
                       AND holder_lock.objsubid IS NOT DISTINCT FROM waiter_lock.objsubid
                     WHERE waiter_lock.pid=$1 AND waiter_lock.granted=false
                  ) AS "waitingOnHolder"
             FROM pg_stat_activity activity
            WHERE activity.pid=$1 AND activity.wait_event_type='Lock'`,
          [waiterPid, holderPid]
        ) as Array<{ waitEventType: string | null; waitingOnHolder: boolean }>;
      } catch (error) {
        const actorFailureAfterQuery = prematureActorFailure(actorWatches);
        if (actorFailureAfterQuery !== null) throw actorFailureAfterQuery;
        throw error;
      }
      if (rows[0]?.waitEventType === "Lock" && rows[0].waitingOnHolder) return;
    }
    const actorFailureBeforeSnapshot = prematureActorFailure(actorWatches);
    if (actorFailureBeforeSnapshot !== null) throw actorFailureBeforeSnapshot;
    const diagnostic = await captureLockDiagnostic(manager, waiterPid, holderPid);
    const actorFailureAfterSnapshot = prematureActorFailure(actorWatches);
    if (actorFailureAfterSnapshot !== null) throw actorFailureAfterSnapshot;
    const error = new Error(
      `observer deadline exceeded: waiter ${waiterPid} did not wait on holder ${holderPid}; `
      + `lockDiagnostic=${JSON.stringify(diagnostic)}`
    );
    Object.defineProperty(error, "lockDiagnostic", {
      configurable: false,
      enumerable: false,
      value: diagnostic
    });
    throw error;
  }

  async function captureLockDiagnostic(
    manager: EntityManager,
    waiterPid: number,
    holderPid: number
  ): Promise<Record<string, unknown>> {
    try {
      await manager.query(OBSERVER_SNAPSHOT_TIMEOUT_SQL);
      const rows = await manager.query(
        `WITH target(pid,role) AS (
           VALUES ($1::integer,'waiter'::text),($2::integer,'holder'::text)
         ), activity AS (
           SELECT target.role,activity.state,
                  activity.wait_event_type AS "waitEventType",
                  activity.wait_event AS "waitEvent",
                  pg_blocking_pids(target.pid) AS "blockingPids"
             FROM target
             LEFT JOIN pg_stat_activity activity ON activity.pid=target.pid
         ), lock_summary AS (
           SELECT target.role,locks.locktype,locks.mode,locks.granted,
                  count(*)::integer AS count
             FROM target
             JOIN pg_locks locks ON locks.pid=target.pid
            GROUP BY target.role,locks.locktype,locks.mode,locks.granted
            ORDER BY target.role,locks.locktype,locks.mode,locks.granted DESC
            LIMIT $3
         )
         SELECT COALESCE((SELECT jsonb_agg(jsonb_build_object(
                  'role',role,'state',state,'waitEventType',"waitEventType",
                  'waitEvent',"waitEvent") ORDER BY role)
                FROM activity),'[]'::jsonb) AS "pgStatActivity",
                COALESCE((SELECT jsonb_agg(jsonb_build_object(
                  'role',role,'pids',"blockingPids") ORDER BY role)
                FROM activity),'[]'::jsonb) AS "pgBlockingPids",
                COALESCE((SELECT jsonb_agg(to_jsonb(lock_summary)
                  ORDER BY role,locktype,mode,granted DESC)
                FROM lock_summary),'[]'::jsonb) AS "pgLocks"`,
        [waiterPid, holderPid, OBSERVER_LOCK_SUMMARY_LIMIT]
      ) as Array<{
        pgStatActivity: unknown;
        pgBlockingPids: unknown;
        pgLocks: unknown;
      }>;
      return {
        pg_stat_activity: rows[0]?.pgStatActivity ?? [],
        pg_blocking_pids: rows[0]?.pgBlockingPids ?? [],
        pg_locks: rows[0]?.pgLocks ?? [],
        lock_summary_limit: OBSERVER_LOCK_SUMMARY_LIMIT
      };
    } catch (error) {
      return {
        pg_stat_activity: [],
        pg_blocking_pids: [],
        pg_locks: [],
        lock_summary_limit: OBSERVER_LOCK_SUMMARY_LIMIT,
        snapshot_error_code: databaseCode(error) ?? "snapshot-unavailable"
      };
    }
  }

  async function rollbackIfActive(runner: QueryRunner): Promise<void> {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
  }

  async function settleCreatedWork(
    holderWork: Promise<unknown> | null,
    waiterWork: Promise<unknown> | null,
    primaryError: unknown | null
  ): Promise<void> {
    const created = [holderWork, waiterWork].filter(
      (work): work is Promise<unknown> => work !== null
    );
    await assertSettledOperations("concurrent actor work", created, primaryError);
  }

  async function finishConcurrentActors(
    actors: { holder: QueryRunner; waiter: QueryRunner; observer: QueryRunner },
    holderWork: Promise<unknown> | null,
    waiterWork: Promise<unknown> | null,
    primaryError: unknown | null
  ): Promise<void> {
    let workError: unknown | null = null;
    try {
      await settleCreatedWork(holderWork, waiterWork, primaryError);
    } catch (error) {
      workError = error;
    }
    await releaseConcurrentActors(actors, primaryError ?? workError);
    if (workError !== null) throw workError;
  }

  async function releaseConcurrentActors(actors: {
    holder: QueryRunner;
    waiter: QueryRunner;
    observer: QueryRunner;
  }, primaryError: unknown | null = null): Promise<void> {
    await cleanupQueryRunners(
      [actors.holder, actors.waiter, actors.observer],
      "concurrent actors",
      primaryError
    );
  }

  async function cleanupQueryRunners(
    runners: readonly QueryRunner[],
    label: string,
    primaryError: unknown | null = null
  ): Promise<void> {
    const rollbackResults = await Promise.allSettled(
      runners.map((runner) => rollbackIfActive(runner))
    );
    const releaseResults = await Promise.allSettled(
      runners.map((runner) => runner.release())
    );
    const errors = [...rollbackResults, ...releaseResults].flatMap((result) =>
      result.status === "rejected" ? [result.reason] : []
    );
    if (errors.length === 0) return;
    if (primaryError !== null) {
      recordSecondaryCleanupErrors(primaryError, errors);
      return;
    }
    throw new AggregateError(errors, `${label} cleanup failed`);
  }

  async function insertRuntimeFixture(
    manager: EntityManager,
    initialStatus: PropertyTaskStatus = "open"
  ) {
    const occurrence = `runtime-${randomUUID()}`;
    const sourceType = "test_fixture_source";
    const sourceId = randomUUID();
    const identity = derivePropertyTaskIdentity({
      sourceType, sourceId, taskKind: "test_fixture_task",
      businessOccurrenceKey: occurrence
    });
    const assignment = await insertAssignment(manager, initialStatus, {
      taskKey: identity.taskKey, sourceId
    });
    const headId = randomUUID();
    const taskId = identity.taskId;
    const createdAt = "2026-08-01T00:00:00.000Z";
    const rowHash = hash("1");
    const headHash = createHash("sha256")
      .update(`${taskId}\t${rowHash}\n`).digest("hex");
    await manager.query(
      `INSERT INTO c4_property_task_source_fixture(
         tenant_id,park_id,source_id,source_version,lifecycle,
         business_occurrence_key,title)
       VALUES($1,$2,$3,1,'eligible',$4,'Runtime task')`,
      [tenantId, parkId, sourceId, occurrence]
    );
    await manager.query(
      `INSERT INTO biz_property_task_projection_head(
         id,tenant_id,park_id,source_type,source_id,projection_version,
         content_hash,last_rebuilt_by)
       VALUES($1,$2,$3,$4,$5,1,$6,$7)`,
      [headId, tenantId, parkId, sourceType, assignment.sourceId, headHash, actorId]
    );
    await manager.query(
      `INSERT INTO biz_property_task_projection(
         tenant_id,park_id,head_id,task_id,task_key,assignment_authority,
         derived_assignment_id,source_type,source_id,source_version,
         business_occurrence_key,task_kind,queue_code,title,kind_label,
         source_label,priority,assignment_status,assignment_version,
         assignee_id,assignee_display,claimed_at,started_at,blocked_reason,
         blocked_until,outcome_code,outcome_source_version,outcome_at,
         projection_version,content_hash,created_at,updated_at)
       VALUES($1,$2,$3,$4,$5,'derived',$6,$7,$8,1,$9,'test_fixture_task',
         'test_fixture_queue','Runtime task','Fixture','Fixture source',10,
         $10,1,$11,$12,$13,$14,$15,$16,$17,$18,$19,1,$20,$21,$21)`,
      [tenantId, parkId, headId, taskId, assignment.taskKey, assignment.id,
        sourceType, assignment.sourceId, occurrence, assignment.assignmentStatus,
        assignment.assigneeId, assignment.assigneeDisplay,
        assignment.claimedAt, assignment.startedAt, assignment.blockedReason,
        assignment.blockedUntil, assignment.outcomeCode,
        assignment.outcomeSourceVersion, assignment.outcomeAt, rowHash, createdAt]
    );
    const initialRows = await projections.findBySource(
      manager, scope, sourceType, assignment.sourceId
    );
    assert.equal(initialRows.length, 1);
    return {
      assignment, headId, taskId, occurrence, sourceType,
      sourceId: assignment.sourceId, createdAt,
      initialProjection: { projectionVersion: 1, rows: initialRows }
    };
  }

  async function executeFixtureCommand(
    manager: EntityManager,
    fixture: Awaited<ReturnType<typeof insertRuntimeFixture>>,
    assignment: PropertyTaskAssignmentRow,
    lockedProjection: {
      projectionVersion: number;
      rows: readonly PropertyTaskProjectionRow[];
    }
  ): Promise<void> {
    const currentProjection = onlyFixtureProjection(fixture, lockedProjection.rows);
    const input = receiptInputForFixture(
      fixture, "property.task.claim", fixture.taskId, "command"
    );
    const acquired = await receipts.acquire(manager, input);
    assert.equal(acquired.kind, "execute");
    if (acquired.kind !== "execute") return;
    const updated = await assignments.transition(manager, {
      scope, assignment, actorId, action: "property.task.claim",
      requestHash: input.requestHash
    });
    const rows = await fixtureProjectionRows(
      manager, currentProjection, updated, currentProjection.sourceVersion
    );
    await replaceAndComplete(manager, fixture, input, acquired.receiptId, rows, {
      mode: "authority-sync",
      action: "property.task.claim",
      resultVersion: updated.version,
      expectedProjectionVersion: lockedProjection.projectionVersion,
      resultRef: `property-task/${fixture.taskId}/v${updated.version}`
    });
  }

  async function executeFixtureTerminal(
    manager: EntityManager,
    fixture: Awaited<ReturnType<typeof insertRuntimeFixture>>,
    assignment: PropertyTaskAssignmentRow,
    lockedProjection: {
      projectionVersion: number;
      rows: readonly PropertyTaskProjectionRow[];
    }
  ): Promise<void> {
    const currentProjection = onlyFixtureProjection(fixture, lockedProjection.rows);
    const action = "property.task.source-terminal.closed" as const;
    const input = receiptInputForFixture(fixture, action, fixture.sourceId, "terminal");
    const acquired = await receipts.acquire(manager, input);
    assert.equal(acquired.kind, "execute");
    if (acquired.kind !== "execute") return;
    const updated = await assignments.terminal(manager, {
      scope, assignment, actorId, terminal: "closed", outcomeCode: "fixture-closed",
      outcomeSourceVersion: 2, outcomeAt: "2026-08-01T03:00:00.000Z",
      requestHash: input.requestHash, actionId: action
    });
    const rows = await fixtureProjectionRows(manager, currentProjection, updated, 2);
    await replaceAndComplete(manager, fixture, input, acquired.receiptId, rows, {
      mode: "authority-sync",
      action,
      resultVersion: 2,
      expectedProjectionVersion: lockedProjection.projectionVersion,
      resultRef: `property-task-source-terminal/${fixture.sourceType}/${fixture.sourceId}/closed/v2`
    });
  }

  async function executeFixtureRebuild(
    manager: EntityManager,
    fixture: Awaited<ReturnType<typeof insertRuntimeFixture>>,
    assignment: PropertyTaskAssignmentRow,
    lockedProjection: {
      projectionVersion: number;
      rows: readonly PropertyTaskProjectionRow[];
    }
  ): Promise<void> {
    const currentProjection = onlyFixtureProjection(fixture, lockedProjection.rows);
    const input = receiptInputForFixture(
      fixture, "property.task.rebuild", fixture.sourceId, "rebuild"
    );
    const acquired = await receipts.acquire(manager, input);
    assert.equal(acquired.kind, "execute");
    if (acquired.kind !== "execute") return;
    const rows = await fixtureProjectionRows(
      manager, currentProjection, assignment, currentProjection.sourceVersion
    );
    const resultVersion = lockedProjection.projectionVersion + 1;
    await replaceAndComplete(manager, fixture, input, acquired.receiptId, rows, {
      mode: "manual-rebuild",
      action: "property.task.rebuild",
      resultVersion,
      expectedProjectionVersion: lockedProjection.projectionVersion,
      resultRef: `property-task-rebuild/${fixture.sourceType}/${fixture.sourceId}/v${resultVersion}`
    });
  }

  function receiptInputForFixture(
    fixture: Awaited<ReturnType<typeof insertRuntimeFixture>>,
    actionId: "property.task.claim" | "property.task.source-terminal.closed"
      | "property.task.rebuild",
    targetId: string,
    key: string
  ): PropertyMutationReceiptAcquireInput {
    return {
      scope,
      contractVersion: PROPERTY_MUTATION_RECEIPT_CONTRACT_VERSION,
      actorId,
      actionId,
      targetId,
      clientKey: `${key}-${randomUUID()}`,
      requestHash: hash(actionId === "property.task.claim" ? "2"
        : actionId === "property.task.rebuild" ? "4" : "3"),
      identity: actionId === "property.task.rebuild"
        ? {
            tag: "property-task-source-rebuild",
            sourceType: fixture.sourceType,
            sourceId: fixture.sourceId
          }
        : {
            tag: "property-task",
            businessOccurrenceKey: fixture.occurrence,
            taskKey: fixture.assignment.taskKey
          },
      acquireMode: "execute-or-replay"
    } as PropertyMutationReceiptAcquireInput;
  }

  async function fixtureProjectionRows(
    manager: EntityManager,
    current: PropertyTaskProjectionRow,
    assignment: PropertyTaskAssignmentRow,
    sourceVersion: number
  ): Promise<PropertyTaskProjectionWriteRow[]> {
    return projections.withDatabaseContentHashes(manager, [{
      taskId: current.taskId,
      taskKey: current.taskKey,
      assignmentAuthority: current.assignmentAuthority,
      derivedAssignmentId: current.derivedAssignmentId,
      sourceType: current.sourceType,
      sourceId: current.sourceId,
      sourceVersion,
      businessOccurrenceKey: current.businessOccurrenceKey,
      taskKind: current.taskKind,
      queueCode: current.queueCode,
      title: current.title,
      kindLabel: current.kindLabel,
      sourceLabel: current.sourceLabel,
      priority: current.priority,
      dueAt: fixtureIso(current.dueAt),
      assignmentStatus: assignment.assignmentStatus,
      assignmentVersion: assignment.version,
      assigneeId: assignment.assigneeId,
      assigneeDisplay: assignment.assigneeDisplay,
      claimedAt: fixtureIso(assignment.claimedAt),
      startedAt: fixtureIso(assignment.startedAt),
      blockedReason: assignment.blockedReason,
      blockedUntil: fixtureIso(assignment.blockedUntil),
      outcomeCode: assignment.outcomeCode,
      outcomeSourceVersion: assignment.outcomeSourceVersion,
      outcomeAt: fixtureIso(assignment.outcomeAt),
      sourceDeepLink: current.sourceDeepLink,
      createdAt: fixtureIso(current.createdAt)!,
      updatedAt: fixtureIso(assignment.updatedAt)!
    }]);
  }

  function onlyFixtureProjection(
    fixture: Awaited<ReturnType<typeof insertRuntimeFixture>>,
    rows: readonly PropertyTaskProjectionRow[]
  ): PropertyTaskProjectionRow {
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.taskId, fixture.taskId);
    assert.equal(rows[0]!.derivedAssignmentId, fixture.assignment.id);
    return rows[0]!;
  }

  function fixtureIso(value: Date | string | null): string | null {
    if (value === null) return null;
    const parsed = value instanceof Date ? value : new Date(value);
    assert.ok(Number.isFinite(parsed.valueOf()));
    return parsed.toISOString();
  }

  async function replaceAndComplete(
    manager: EntityManager,
    fixture: Awaited<ReturnType<typeof insertRuntimeFixture>>,
    receiptInputValue: PropertyMutationReceiptAcquireInput,
    receiptId: string,
    rows: readonly PropertyTaskProjectionWriteRow[],
    replacement: {
      mode: "manual-rebuild" | "authority-sync";
      action: string;
      resultVersion: number;
      expectedProjectionVersion: number;
      resultRef: string;
    }
  ): Promise<void> {
    const resultHash = await propertyTaskMutationResultHash({
      actionId: replacement.action as Parameters<typeof propertyTaskMutationResultHash>[0]["actionId"],
      targetId: receiptInputValue.targetId,
      identity: receiptInputValue.identity,
      resultRef: replacement.resultRef,
      resultVersion: replacement.resultVersion
    });
    await projections.replace(manager, {
      scope,
      sourceType: fixture.sourceType,
      sourceId: fixture.sourceId,
      actorId,
      receiptId,
      replaceMode: replacement.mode,
      commandAction: replacement.action,
      resultVersion: replacement.resultVersion,
      expectedProjectionVersion: replacement.expectedProjectionVersion,
      requestHash: receiptInputValue.requestHash,
      resultRef: replacement.resultRef,
      resultHash,
      reason: replacement.mode === "manual-rebuild"
        ? "fixture manual rebuild"
        : `authority-sync:${replacement.action}`,
      rows
    });
    await receipts.complete(manager, {
      ...receiptInputValue,
      receiptId,
      resultRef: replacement.resultRef,
      resultHash,
      resultVersion: replacement.resultVersion
    } as PropertyMutationReceiptCompleteInput);
  }

  async function assertFixtureOutcome(
    fixture: Awaited<ReturnType<typeof insertRuntimeFixture>>,
    expected: {
      assignmentStatus: PropertyTaskStatus;
      assignmentVersion: number;
      assignmentAction: string | null;
      projectionVersion: number;
      projectionAction: string;
      receiptAction: string;
    }
  ): Promise<void> {
    const assignmentRows = await dataSource.query(
      `SELECT assignment_status AS status,version::integer
         FROM biz_property_task_assignment
        WHERE tenant_id=$1 AND park_id=$2 AND id=$3`,
      [tenantId, parkId, fixture.assignment.id]
    ) as Array<{ status: PropertyTaskStatus; version: number }>;
    assert.deepEqual(assignmentRows, [{
      status: expected.assignmentStatus, version: expected.assignmentVersion
    }]);
    const assignmentAudits = await dataSource.query(
      `SELECT action_id AS action
         FROM biz_property_task_assignment_audit
        WHERE tenant_id=$1 AND park_id=$2 AND assignment_id=$3
        ORDER BY to_version`,
      [tenantId, parkId, fixture.assignment.id]
    ) as Array<{ action: string }>;
    assert.deepEqual(assignmentAudits.map((row) => row.action),
      expected.assignmentAction === null ? [] : [expected.assignmentAction]);
    const projectionRows = await dataSource.query(
      `SELECT head.projection_version::integer AS "projectionVersion",
              projection.assignment_status AS "assignmentStatus",
              projection.assignment_version::integer AS "assignmentVersion"
         FROM biz_property_task_projection_head head
         JOIN biz_property_task_projection projection
           ON projection.tenant_id=head.tenant_id AND projection.park_id=head.park_id
          AND projection.head_id=head.id
        WHERE head.tenant_id=$1 AND head.park_id=$2
          AND head.source_type=$3 AND head.source_id=$4`,
      [tenantId, parkId, fixture.sourceType, fixture.sourceId]
    ) as Array<{ projectionVersion: number; assignmentStatus: PropertyTaskStatus;
      assignmentVersion: number }>;
    assert.deepEqual(projectionRows, [{
      projectionVersion: expected.projectionVersion,
      assignmentStatus: expected.assignmentStatus,
      assignmentVersion: expected.assignmentVersion
    }]);
    const projectionAudits = await dataSource.query(
      `SELECT command_action AS action,from_projection_version::integer AS "fromVersion",
              to_projection_version::integer AS "toVersion"
         FROM biz_property_task_projection_rebuild_audit
        WHERE tenant_id=$1 AND park_id=$2 AND source_type=$3 AND source_id=$4
        ORDER BY to_projection_version`,
      [tenantId, parkId, fixture.sourceType, fixture.sourceId]
    ) as Array<{ action: string; fromVersion: number; toVersion: number }>;
    assert.deepEqual(projectionAudits, [{
      action: expected.projectionAction,
      fromVersion: 1,
      toVersion: expected.projectionVersion
    }]);
    const receiptRows = await dataSource.query(
      `SELECT action_id AS action,receipt_status AS status
         FROM biz_property_mutation_receipt
        WHERE tenant_id=$1 AND park_id=$2
          AND target_id IN ($3::uuid,$4::uuid)
        ORDER BY action_id`,
      [tenantId, parkId, fixture.taskId, fixture.sourceId]
    ) as Array<{ action: string; status: string }>;
    assert.deepEqual(receiptRows, [{ action: expected.receiptAction, status: "completed" }]);
  }

  async function assertTwoSuccessFixtureOutcome(
    fixture: Awaited<ReturnType<typeof insertRuntimeFixture>>,
    waiterKind: "command" | "terminal"
  ): Promise<void> {
    const waiterAction = waiterKind === "command"
      ? "property.task.claim"
      : "property.task.source-terminal.closed";
    const finalStatus: PropertyTaskStatus = waiterKind === "command"
      ? "claimed"
      : "closed";
    const assignmentRows = await dataSource.query(
      `SELECT assignment_status AS status,version::integer
         FROM biz_property_task_assignment
        WHERE tenant_id=$1 AND park_id=$2 AND id=$3`,
      [tenantId, parkId, fixture.assignment.id]
    ) as Array<{ status: PropertyTaskStatus; version: number }>;
    assert.deepEqual(assignmentRows, [{ status: finalStatus, version: 2 }]);

    const assignmentAudits = await dataSource.query(
      `SELECT action_id AS action,from_version::integer AS "fromVersion",
              to_version::integer AS "toVersion"
         FROM biz_property_task_assignment_audit
        WHERE tenant_id=$1 AND park_id=$2 AND assignment_id=$3
        ORDER BY to_version`,
      [tenantId, parkId, fixture.assignment.id]
    ) as Array<{ action: string; fromVersion: number; toVersion: number }>;
    assert.deepEqual(assignmentAudits, [{
      action: waiterAction, fromVersion: 1, toVersion: 2
    }]);

    const projectionRows = await dataSource.query(
      `SELECT head.projection_version::integer AS "projectionVersion",
              projection.assignment_status AS "assignmentStatus",
              projection.assignment_version::integer AS "assignmentVersion"
         FROM biz_property_task_projection_head head
         JOIN biz_property_task_projection projection
           ON projection.tenant_id=head.tenant_id AND projection.park_id=head.park_id
          AND projection.head_id=head.id
        WHERE head.tenant_id=$1 AND head.park_id=$2
          AND head.source_type=$3 AND head.source_id=$4`,
      [tenantId, parkId, fixture.sourceType, fixture.sourceId]
    ) as Array<{ projectionVersion: number; assignmentStatus: PropertyTaskStatus;
      assignmentVersion: number }>;
    assert.deepEqual(projectionRows, [{
      projectionVersion: 3,
      assignmentStatus: finalStatus,
      assignmentVersion: 2
    }]);

    const projectionAudits = await dataSource.query(
      `SELECT replace_mode AS mode,command_action AS action,
              from_projection_version::integer AS "fromVersion",
              to_projection_version::integer AS "toVersion",
              business_result_version::integer AS "businessResultVersion"
         FROM biz_property_task_projection_rebuild_audit
        WHERE tenant_id=$1 AND park_id=$2 AND source_type=$3 AND source_id=$4
        ORDER BY to_projection_version`,
      [tenantId, parkId, fixture.sourceType, fixture.sourceId]
    ) as Array<{ mode: string; action: string; fromVersion: number;
      toVersion: number; businessResultVersion: number }>;
    assert.deepEqual(projectionAudits, [
      {
        mode: "manual-rebuild", action: "property.task.rebuild",
        fromVersion: 1, toVersion: 2, businessResultVersion: 2
      },
      {
        mode: "authority-sync", action: waiterAction,
        fromVersion: 2, toVersion: 3, businessResultVersion: 2
      }
    ]);

    const receiptsRows = await dataSource.query(
      `SELECT action_id AS action,target_id::text AS "targetId",
              receipt_status AS status,result_version::integer AS "resultVersion"
         FROM biz_property_mutation_receipt
        WHERE tenant_id=$1 AND park_id=$2
          AND target_id IN ($3::uuid,$4::uuid)
        ORDER BY action_id`,
      [tenantId, parkId, fixture.taskId, fixture.sourceId]
    ) as Array<{ action: string; targetId: string; status: string;
      resultVersion: number }>;
    const waiterTarget = waiterKind === "command" ? fixture.taskId : fixture.sourceId;
    assert.deepEqual(receiptsRows, [
      {
        action: waiterAction,
        targetId: waiterTarget,
        status: "completed",
        resultVersion: 2
      },
      {
        action: "property.task.rebuild",
        targetId: fixture.sourceId,
        status: "completed",
        resultVersion: 2
      }
    ].sort((left, right) => left.action.localeCompare(right.action)));
  }

  async function insertAssignment(
    manager: EntityManager,
    status: PropertyTaskStatus,
    identity?: { taskKey: string; sourceId: string }
  ): Promise<PropertyTaskAssignmentRow> {
    const active = ["claimed", "in_progress", "blocked"].includes(status);
    const rows = await manager.query(
      `INSERT INTO biz_property_task_assignment(
         tenant_id,park_id,task_key,task_key_version,task_kind,source_type,
         source_id,source_version_at_generation,assignment_status,assignee_id,
         claim_epoch,claim_token,version,claimed_at,started_at,blocked_reason,
         outcome_code,outcome_source_version,outcome_at)
       VALUES($1,$2,$3,1,'test_fixture_task','test_fixture_source',$4,1,$5,$6,
         $7,$8,1,$9,$10,$11,$12,$13,$14)
       RETURNING id::text AS "id",task_key AS "taskKey",task_kind AS "taskKind",
         source_type AS "sourceType",source_id::text AS "sourceId",
         source_version_at_generation AS "sourceVersionAtGeneration",
         assignment_status AS "assignmentStatus",assignee_id::text AS "assigneeId",
         NULL::text AS "assigneeDisplay",claim_epoch AS "claimEpoch",
         claim_token::text AS "claimToken",version,claimed_at AS "claimedAt",
         started_at AS "startedAt",blocked_reason AS "blockedReason",
         blocked_until AS "blockedUntil",outcome_code AS "outcomeCode",
         outcome_source_version AS "outcomeSourceVersion",outcome_at AS "outcomeAt",
         created_at AS "createdAt",updated_at AS "updatedAt"`,
      [tenantId, parkId, identity?.taskKey ?? fixtureTaskKey(),
        identity?.sourceId ?? randomUUID(), status,
        active ? actorId : null, active ? 1 : 0, active ? randomUUID() : null,
        active ? new Date() : null,
        ["in_progress", "blocked"].includes(status) ? new Date() : null,
        status === "blocked" ? "fixture block" : null,
        ["closed", "cancelled"].includes(status) ? `fixture-${status}` : null,
        ["closed", "cancelled"].includes(status) ? 1 : null,
        ["closed", "cancelled"].includes(status) ? new Date() : null]
    ) as PropertyTaskAssignmentRow[];
    return {
      ...rows[0]!,
      assigneeDisplay: active ? actorDisplay : null
    };
  }

  function receiptInput(
    actionId: "property.task.claim",
    targetId: string,
    key: string
  ): PropertyMutationReceiptAcquireInput {
    return {
      scope,
      contractVersion: PROPERTY_MUTATION_RECEIPT_CONTRACT_VERSION,
      actorId,
      actionId,
      targetId,
      clientKey: `${key}-${randomUUID()}`,
      requestHash: hash("c"),
      identity: {
        tag: "property-task",
        businessOccurrenceKey: `occurrence-${randomUUID()}`,
        taskKey: fixtureTaskKey()
      },
      acquireMode: "execute-or-replay"
    };
  }
});
