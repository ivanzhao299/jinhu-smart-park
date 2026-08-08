import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createPropertyTaskProductionSourceRegistry,
  evaluatePropertyTaskEndpointAuthorization,
  evaluatePropertyTaskTerminalReceiptFence,
  PROPERTY_TASK_ACTIONS,
  PROPERTY_TASK_ERROR_GOLDEN,
  PROPERTY_TASK_STATUSES,
  PROPERTY_TRACK_B_ENDPOINT_PERMISSION_MANIFEST,
  validatePropertyTaskDetailWire,
  validatePropertyTaskListItemWire,
  type PropertyTaskProjectorSource,
  type PropertyTaskSourceResolver,
  type PropertyTaskStatus
} from "@jinhu/shared";
import {
  signedTransitionAllowed,
  SIGNED_PROPERTY_TASK_TRANSITIONS,
  SOURCE_TERMINAL_TRANSITIONS
} from "./testing/property-task-contract.fixture";
import { PropertyTaskSourceRegistryProvider } from "./property-task.registry";

function productionResolver(
  overrides: Partial<PropertyTaskSourceResolver & PropertyTaskProjectorSource> = {}
): PropertyTaskSourceResolver & PropertyTaskProjectorSource {
  return {
    sourceType: "homestay_booking",
    taskKind: "arrival",
    assignmentAuthority: "derived",
    access: {
      tag: "workspace",
      sourceType: "homestay_booking",
      requiredModules: ["homestay"],
      surfaceId: "homestay:operations",
      pagePermission: "homestay:booking:read",
      queueCode: "homestay_arrival",
      domainRoute: "/homestay/tasks/[taskId]",
      sourceDetailPermission: "homestay:booking:read"
    },
    async lockAndResolve() { return null; },
    async scanCandidates() { return { items: [], next: null }; },
    ...overrides
  };
}

const taskId = "11111111-1111-4111-8111-111111111111";
const baseItem = {
  taskId, assignmentAuthority: "derived", taskKind: "inspection",
  kindLabel: "Inspection", sourceType: "test_fixture_source", sourceLabel: "Fixture",
  title: "Inspect", priority: 10, dueAt: null, assignmentStatus: "open",
  assignmentVersion: 1, assigneeDisplay: null,
  createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z",
  allowedActions: ["property.task.claim"]
};

describe("C4 property task signed contracts", () => {
  it("freezes all six states and rejects every unsigned command adjacency", () => {
    assert.deepEqual(PROPERTY_TASK_STATUSES,
      ["open", "claimed", "in_progress", "blocked", "closed", "cancelled"]);
    for (const action of PROPERTY_TASK_ACTIONS) {
      const edges = SIGNED_PROPERTY_TASK_TRANSITIONS[action] as
        readonly (readonly [PropertyTaskStatus, PropertyTaskStatus])[];
      for (const from of PROPERTY_TASK_STATUSES as readonly PropertyTaskStatus[]) {
        for (const to of PROPERTY_TASK_STATUSES as readonly PropertyTaskStatus[]) {
          const signed: boolean = edges.some(
            (edge): boolean => edge[0] === from && edge[1] === to
          );
          assert.equal(signedTransitionAllowed(action, from, to), signed,
            `${action}:${from}->${to}`);
        }
      }
    }
    for (const [from, to] of SOURCE_TERMINAL_TRANSITIONS) {
      assert.ok(!["closed", "cancelled"].includes(from));
      assert.ok(["closed", "cancelled"].includes(to));
    }
  });

  it("requires source eligibility and treats terminal states as command-ineligible", () => {
    const eligible: PropertyTaskStatus[] = ["open", "claimed", "in_progress", "blocked"];
    for (const status of PROPERTY_TASK_STATUSES) {
      assert.equal(eligible.includes(status), status !== "closed" && status !== "cancelled");
    }
  });

  it("enforces release/unblock OR authorization without weakening common predicates", () => {
    for (const actionId of ["property.task.release", "property.task.unblock"] as const) {
      const endpoint = PROPERTY_TRACK_B_ENDPOINT_PERMISSION_MANIFEST.find(
        (row) => row.actionId === actionId
      )!;
      const common = {
        activeModules: true, currentUserPark: true, taskRead: true, sourceScope: true,
        queueScope: true, currentAssignee: true, queueSupervisor: false,
        grantedPermissions: new Set(endpoint.authorizationAlternatives[0]!.requiredPermissions)
      };
      assert.equal(evaluatePropertyTaskEndpointAuthorization(endpoint, common), true);
      assert.equal(evaluatePropertyTaskEndpointAuthorization(endpoint,
        { ...common, currentAssignee: false }), false);
      const supervisor = endpoint.authorizationAlternatives[1]!;
      assert.equal(evaluatePropertyTaskEndpointAuthorization(endpoint, {
        ...common, currentAssignee: false, queueSupervisor: true,
        grantedPermissions: new Set(supervisor.requiredPermissions)
      }), true);
      for (const field of ["activeModules", "currentUserPark", "taskRead",
        "sourceScope", "queueScope"] as const) {
        assert.equal(evaluatePropertyTaskEndpointAuthorization(endpoint,
          { ...common, [field]: false }), false, `${actionId}:${field}`);
      }
    }
  });

  it("keeps owning/derived wire shape exact and prevents blocked/source detail leakage", () => {
    for (const authority of ["owning", "derived"] as const) {
      assert.deepEqual(validatePropertyTaskListItemWire(
        { ...baseItem, assignmentAuthority: authority }, false), []);
    }
    assert.notDeepEqual(validatePropertyTaskListItemWire(
      { ...baseItem, blockedReason: "secret" }, false), []);
    const blocked = { ...baseItem, assignmentStatus: "blocked", blockedReason: "waiting" };
    assert.deepEqual(validatePropertyTaskListItemWire(blocked, true), []);
    assert.notDeepEqual(validatePropertyTaskListItemWire(blocked, false), []);
    const detail = { ...baseItem, sourceVersion: 1,
      businessOccurrenceKey: `fixture:${taskId}`,
      claimedAt: null, startedAt: null, blockedUntil: null };
    assert.deepEqual(validatePropertyTaskDetailWire(detail, false), []);
    assert.notDeepEqual(validatePropertyTaskDetailWire(
      { ...detail, sourceId: taskId, sourceDeepLink: "/secret" }, false), []);
  });

  it("keeps production source registry exact-empty and unresolved sources fail closed", () => {
    const registry = createPropertyTaskProductionSourceRegistry();
    assert.equal(registry.size, 0);
    assert.equal(registry.resolve("homestay", "booking"), null);
    const provider = new PropertyTaskSourceRegistryProvider();
    assert.equal(provider.size, 0);
    assert.equal(provider.resolve("homestay", "booking"), null);
    assert.equal(provider.resolveProjector("housing", "lease"), null);
  });

  it("composes an immutable B-2c registry without a second provider", () => {
    const projector = {
      ...productionResolver()
    };
    const registrations: PropertyTaskSourceResolver[] = [projector];
    const provider = new PropertyTaskSourceRegistryProvider(registrations);
    registrations.length = 0;

    assert.equal(provider.size, 1);
    assert.notEqual(provider.resolve("homestay_booking", "arrival"), projector);
    assert.equal(provider.resolve("homestay_booking", "arrival")?.sourceType,
      "homestay_booking");
    assert.equal(typeof provider.resolveProjector(
      "homestay_booking", "arrival"
    )?.scanCandidates, "function");
    assert.equal(provider.projectorsForSourceType("homestay_booking").length, 1);
    assert.deepEqual(provider.projectorsForSourceType("housing_lease"), []);
    assert.throws(() => new PropertyTaskSourceRegistryProvider([
      productionResolver(), productionResolver()
    ]));
  });

  it("freezes terminal receipt access before runtime mutation", () => {
    assert.deepEqual(evaluatePropertyTaskTerminalReceiptFence({
      authorityState: "active", lockedAssignmentVersion: 4,
      incomingExpectedAssignmentVersion: 4
    }), { allowed: true, acquireMode: "execute-or-replay", receiptAccessCount: 1 });
    assert.deepEqual(evaluatePropertyTaskTerminalReceiptFence({
      authorityState: "same-terminal", lockedAssignmentVersion: 5,
      incomingExpectedAssignmentVersion: 4
    }), { allowed: true, acquireMode: "existing-only", receiptAccessCount: 1 });
    for (const incomingExpectedAssignmentVersion of [5, 3, 0, 1.5, 2147483648]) {
      assert.deepEqual(evaluatePropertyTaskTerminalReceiptFence({
        authorityState: "same-terminal", lockedAssignmentVersion: 5,
        incomingExpectedAssignmentVersion
      }), { allowed: false, errorCode: "property-version-conflict", receiptAccessCount: 0 });
    }
  });

  it("keeps task error recovery and leak details on the closed allowlist", () => {
    assert.deepEqual(Object.keys(PROPERTY_TASK_ERROR_GOLDEN).sort(), [
      "property-action-forbidden", "property-resource-not-found",
      "property-runtime-unavailable", "property-version-conflict",
      "task-already-claimed", "task-source-ineligible", "task-version-conflict"
    ]);
    assert.deepEqual(PROPERTY_TASK_ERROR_GOLDEN["property-action-forbidden"].details, []);
    assert.deepEqual(PROPERTY_TASK_ERROR_GOLDEN["property-resource-not-found"].details, []);
    assert.deepEqual(PROPERTY_TASK_ERROR_GOLDEN["task-already-claimed"].details,
      ["assigneeDisplay"]);
    assert.deepEqual(PROPERTY_TASK_ERROR_GOLDEN["task-source-ineligible"].details,
      ["deepLink"]);
  });
});
