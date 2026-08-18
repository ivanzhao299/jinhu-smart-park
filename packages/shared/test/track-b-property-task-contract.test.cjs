const assert = require("node:assert/strict");
const test = require("node:test");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const shared = require("../dist/index.js");

function fixtureResolver(overrides = {}) {
  return {
    sourceType: "test_fixture_source",
    taskKind: "test_fixture_kind",
    assignmentAuthority: "derived",
    access: {
      tag: "workspace",
      sourceType: "test_fixture_source",
      requiredModules: ["test_fixture_module"],
      surfaceId: "test_fixture_surface",
      pagePermission: "test_fixture_page",
      queueCode: "test_fixture_queue",
      domainRoute: "/test_fixture_workspace/[taskId]",
      sourceDetailPermission: "test_fixture_source_detail"
    },
    async lockAndResolve() { return null; },
    async scanCandidates() { return { items: [], next: null }; },
    ...overrides
  };
}

function productionResolver(overrides = {}) {
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

test("Track B task endpoint v2 keeps 53 rows and exact OR authorization", () => {
  const manifest = shared.PROPERTY_TRACK_B_ENDPOINT_PERMISSION_MANIFEST;
  assert.equal(manifest.length, 53);
  assert.deepEqual(shared.validatePropertyTrackBEndpointPermissionManifest(), []);

  const release = manifest.find((row) => row.actionId === "property.task.release");
  const unblock = manifest.find((row) => row.actionId === "property.task.unblock");
  assert.deepEqual(release.requiredPermissions, []);
  assert.deepEqual(release.authorizationAlternatives, [
    { actorPredicate: "current-assignee", requiredPermissions: ["property_task:release"] },
    { actorPredicate: "queue-supervisor", requiredPermissions: ["property_task:supervise"] }
  ]);
  assert.deepEqual(unblock.requiredPermissions, []);
  assert.deepEqual(unblock.authorizationAlternatives, [
    { actorPredicate: "current-assignee", requiredPermissions: ["property_task:process"] },
    { actorPredicate: "queue-supervisor", requiredPermissions: ["property_task:supervise"] }
  ]);
  assert.ok(manifest.filter((row) => ![release, unblock].includes(row)
    && row.actionId !== "property.occupancy.release-or-force-release")
    .every((row) => row.authorizationAlternatives.length === 0));
  const identityRows = manifest.filter((row) =>
    row.path.startsWith("/api/v1/property/identity-submissions"));
  const domainRows = manifest.filter((row) =>
    row.path.startsWith("/api/v1/homestay/") || row.path.startsWith("/api/v1/housing/"));
  const controlActions = new Set([
    "property.operation.list", "property.operation.read", "property.operation.update",
    "property.mode-transition.request", "property.mode-transition.list",
    "property.mode-transition.aggregate-list",
    "property.occupancy.list", "property.occupancy.read",
    "property.occupancy.availability.check", "property.occupancy.create",
    "property.occupancy.activate", "property.occupancy.release-or-force-release"
  ]);
  const controlRows = manifest.filter((row) => controlActions.has(row.actionId));
  const occupancyRelease = manifest.find((row) =>
    row.actionId === "property.occupancy.release-or-force-release");
  assert.deepEqual(occupancyRelease.requiredPermissions, []);
  assert.deepEqual(occupancyRelease.anyOfPermissions, [
    "property_occupancy:force_release",
    "property_occupancy:release"
  ]);
  assert.deepEqual(occupancyRelease.requestVariants, [
    {
      requestVariant: "force",
      requiredPermissions: ["property_approval:create", "property_occupancy:force_release"]
    },
    {
      requestVariant: "normal",
      requiredPermissions: ["property_occupancy:release"]
    }
  ]);
  assert.deepEqual(
    [identityRows.length, controlRows.length,
      manifest.length - identityRows.length - controlRows.length - domainRows.length,
      domainRows.length],
    [11, 12, 21, 9]
  );
  const endpointKeys = manifest.map((row) => `${row.method}\t${row.path}`);
  assert.equal(new Set(endpointKeys).size, 53);
  for (const route of Object.values(shared.PROPERTY_TRACK_B_API_ROUTES)) {
    assert.ok(manifest.some((row) => row.path === route), `missing route ${route}`);
  }

  const bad = manifest.map((row) => ({ ...row }));
  bad[0] = {
    ...bad[0],
    authorizationAlternatives: [
      { actorPredicate: "unknown", requiredPermissions: ["property_task:read"] }
    ]
  };
  assert.ok(shared.validatePropertyTrackBEndpointPermissionManifest(bad)
    .some((issue) => issue.includes("unknown actor predicate")));
  const duplicate = manifest.map((row) => ({ ...row }));
  duplicate[0] = {
    ...duplicate[0],
    authorizationAlternatives: [
      { actorPredicate: "current-assignee", requiredPermissions: ["property_task:read"] },
      { actorPredicate: "current-assignee", requiredPermissions: ["property_task:read"] }
    ]
  };
  assert.ok(shared.validatePropertyTrackBEndpointPermissionManifest(duplicate)
    .some((issue) => issue.includes("duplicate permission alternative")));
  const duplicateVariant = manifest.map((row) => ({ ...row }));
  const occupancyReleaseIndex = duplicateVariant.findIndex((row) =>
    row.actionId === "property.occupancy.release-or-force-release");
  duplicateVariant[occupancyReleaseIndex] = {
    ...duplicateVariant[occupancyReleaseIndex],
    requestVariants: [
      { requestVariant: "normal", requiredPermissions: ["property_occupancy:release"] },
      { requestVariant: "normal", requiredPermissions: ["property_occupancy:release"] }
    ]
  };
  assert.ok(shared.validatePropertyTrackBEndpointPermissionManifest(duplicateVariant)
    .some((issue) => issue.includes("request variants are not unique/sorted")));
});

test("task endpoint authorization preserves every common gate and either OR branch", () => {
  const release = shared.PROPERTY_TRACK_B_ENDPOINT_PERMISSION_MANIFEST.find(
    (row) => row.actionId === "property.task.release");
  const facts = {
    activeModules: true,
    currentUserPark: true,
    taskRead: true,
    sourceScope: true,
    queueScope: true,
    currentAssignee: true,
    queueSupervisor: false,
    grantedPermissions: new Set(["property_task:release"])
  };
  assert.equal(shared.evaluatePropertyTaskEndpointAuthorization(release, facts), true);
  assert.equal(shared.evaluatePropertyTaskEndpointAuthorization(release, {
    ...facts,
    currentAssignee: false,
    queueSupervisor: true,
    grantedPermissions: new Set(["property_task:supervise"])
  }), true);
  assert.equal(shared.evaluatePropertyTaskEndpointAuthorization(release, {
    ...facts,
    currentAssignee: false
  }), false);
  assert.equal(shared.evaluatePropertyTaskEndpointAuthorization(release, {
    ...facts,
    grantedPermissions: new Set(["property_task:supervise"])
  }), false);
  for (const gate of [
    "activeModules", "currentUserPark", "taskRead", "sourceScope", "queueScope"
  ]) {
    assert.equal(shared.evaluatePropertyTaskEndpointAuthorization(release, {
      ...facts,
      [gate]: false
    }), false, `${gate} must fail closed`);
  }

  const unblock = shared.PROPERTY_TRACK_B_ENDPOINT_PERMISSION_MANIFEST.find(
    (row) => row.actionId === "property.task.unblock");
  assert.equal(shared.evaluatePropertyTaskEndpointAuthorization(unblock, {
    ...facts,
    grantedPermissions: new Set(["property_task:process"])
  }), true);
  assert.equal(shared.evaluatePropertyTaskEndpointAuthorization(unblock, {
    ...facts,
    currentAssignee: false,
    queueSupervisor: true,
    grantedPermissions: new Set(["property_task:supervise"])
  }), true);
  assert.equal(shared.evaluatePropertyTaskEndpointAuthorization(unblock, {
    ...facts,
    currentAssignee: false,
    queueSupervisor: false,
    grantedPermissions: new Set(["property_task:process", "property_task:supervise"])
  }), false);
});

test("occupancy release authorization binds permissions to the request variant", () => {
  const release = shared.PROPERTY_TRACK_B_ENDPOINT_PERMISSION_MANIFEST.find(
    (row) => row.actionId === "property.occupancy.release-or-force-release");
  const facts = {
    activeModules: true,
    currentUserPark: true,
    taskRead: true,
    sourceScope: true,
    queueScope: true,
    currentAssignee: false,
    queueSupervisor: false,
    requestVariant: "normal",
    grantedPermissions: new Set(["property_occupancy:release"])
  };
  assert.equal(shared.evaluatePropertyTaskEndpointAuthorization(release, facts), true);
  assert.equal(shared.evaluatePropertyTaskEndpointAuthorization(release, {
    ...facts,
    grantedPermissions: new Set(["property_occupancy:force_release"])
  }), false);
  assert.equal(shared.evaluatePropertyTaskEndpointAuthorization(release, {
    ...facts,
    requestVariant: "force",
    grantedPermissions: new Set([
      "property_approval:create",
      "property_occupancy:force_release"
    ])
  }), true);
  assert.equal(shared.evaluatePropertyTaskEndpointAuthorization(release, {
    ...facts,
    requestVariant: "force",
    grantedPermissions: new Set(["property_occupancy:force_release"])
  }), false);
  assert.equal(shared.evaluatePropertyTaskEndpointAuthorization(release, {
    ...facts,
    requestVariant: undefined,
    grantedPermissions: new Set([
      "property_approval:create",
      "property_occupancy:force_release",
      "property_occupancy:release"
    ])
  }), false);
});

test("task key and task id canonical bytes are exact and reject aliases", () => {
  assert.equal(shared.PROPERTY_TASK_KEY_VERSION, 1);
  assert.equal(shared.PROPERTY_TASK_ID_NAMESPACE, "7b2df21d-6bb8-5e2f-a04f-a3ebf43f04a7");
  assert.equal(
    Buffer.from(shared.propertyTaskKeyCanonicalBytes({
      sourceType: "homestay_booking",
      sourceId: "123e4567-e89b-12d3-a456-426614174000",
      taskKind: "arrival",
      businessOccurrenceKey: "2026-08-01"
    })).toString("utf8"),
    "task-key-v1\nhomestay_booking\t123e4567-e89b-12d3-a456-426614174000\tarrival\t2026-08-01\n"
  );
  assert.equal(
    Buffer.from(shared.propertyTaskIdCanonicalBytes("a".repeat(64))).toString("utf8"),
    `task-id-v1\n${"a".repeat(64)}\n`
  );
  assert.throws(() => shared.propertyTaskIdCanonicalBytes("A".repeat(64)));
  assert.throws(() => shared.propertyTaskKeyCanonicalBytes({
    sourceType: "source", sourceId: "123e4567-e89b-12d3-a456-426614174000",
    taskKind: "bad\tkind", businessOccurrenceKey: "occurrence"
  }));
  for (const businessOccurrenceKey of [
    "", " ", "   ", "bad\tkey", "bad\nkey", "bad\rkey", "bad\0key", "bad\ufffdkey",
    "\ud800", "\udc00", "😀".repeat(65)
  ]) {
    assert.throws(() => shared.propertyTaskKeyCanonicalBytes({
      sourceType: "source", sourceId: "123e4567-e89b-12d3-a456-426614174000",
      taskKind: "kind", businessOccurrenceKey
    }), `invalid occurrence ${JSON.stringify(businessOccurrenceKey)}`);
  }
  for (const businessOccurrenceKey of [
    " x ", "a".repeat(256), "😀".repeat(64), "e\u0301", "é"
  ]) {
    assert.doesNotThrow(() => shared.propertyTaskKeyCanonicalBytes({
      sourceType: "source", sourceId: "123e4567-e89b-12d3-a456-426614174000",
      taskKind: "kind", businessOccurrenceKey
    }));
  }
});

test("production registry is exact-empty and fixtures cannot escape namespace", () => {
  const production = shared.createPropertyTaskProductionSourceRegistry();
  assert.equal(shared.PROPERTY_TASK_PRODUCTION_SOURCE_REGISTRATIONS.length, 0);
  assert.equal(production.size, 0);
  assert.equal(production.resolve("homestay", "arrival"), null);
  assert.throws(() => new shared.PropertyTaskSourceRegistry([fixtureResolver()], "production"));

  const fixture = new shared.PropertyTaskSourceRegistry([fixtureResolver()], "test-fixture");
  assert.equal(fixture.size, 1);
  assert.equal(fixture.resolve("test_fixture_source", "test_fixture_kind").sourceType,
    "test_fixture_source");
  assert.throws(() => new shared.PropertyTaskSourceRegistry([
    fixtureResolver({ sourceType: "homestay" })
  ], "test-fixture"));
  assert.throws(() => new shared.PropertyTaskSourceRegistry([
    fixtureResolver(), fixtureResolver()
  ], "test-fixture"));
});

test("B-2c production registry composes one immutable fail-closed source set", () => {
  const resolver = productionResolver();
  const registrations = [resolver];
  const composed = shared.createPropertyTaskComposedSourceRegistry(registrations);
  registrations.push(productionResolver({
    sourceType: "housing_lease",
    taskKind: "handover",
    access: {
      ...productionResolver().access,
      sourceType: "housing_lease"
    }
  }));

  assert.equal(composed.size, 1);
  assert.equal(composed.resolve("homestay_booking", "arrival").sourceType,
    "homestay_booking");
  resolver.sourceType = "housing_lease";
  resolver.access.requiredModules.push("housing_rental");
  assert.equal(composed.resolve("homestay_booking", "arrival").sourceType,
    "homestay_booking");
  assert.deepEqual(composed.resolve("homestay_booking", "arrival").access.requiredModules,
    ["homestay"]);
  assert.equal(Object.isFrozen(composed.values()), true);
  assert.equal(Object.isFrozen(composed.values()[0]), true);
  assert.equal(Object.isFrozen(composed.values()[0].access), true);
  assert.equal(composed.resolve("housing_lease", "handover"), null);
  assert.throws(() => shared.createPropertyTaskComposedSourceRegistry([]));
  assert.throws(() => shared.createPropertyTaskComposedSourceRegistry([
    productionResolver(), productionResolver()
  ]));
  assert.throws(() => shared.createPropertyTaskComposedSourceRegistry([
    fixtureResolver()
  ]));
});

test("B-2c production registry rejects every malformed resolver ABI combination", () => {
  const access = () => productionResolver().access;
  const malformed = [
    ["empty source type", productionResolver({ sourceType: "" })],
    ["malformed task kind", productionResolver({ taskKind: "Arrival" })],
    ["owning without hook", productionResolver({ assignmentAuthority: "owning" })],
    ["owning non-callable hook", productionResolver({
      assignmentAuthority: "owning", invokeOwningCommand: null
    })],
    ["derived with hook", productionResolver({ async invokeOwningCommand() {} })],
    ["derived with undefined hook", productionResolver({ invokeOwningCommand: undefined })],
    ["missing projector", productionResolver({ scanCandidates: undefined })],
    ["non-callable projector", productionResolver({ scanCandidates: "scan" })],
    ["unknown authority", productionResolver({ assignmentAuthority: "shared" })],
    ["missing resolver", productionResolver({ lockAndResolve: undefined })],
    ["non-callable resolver", productionResolver({ lockAndResolve: "resolve" })],
    ["missing descriptor", productionResolver({ access: undefined })],
    ["empty descriptor", productionResolver({ access: {} })],
    ["internal descriptor", productionResolver({ access: {
      tag: "internal-rebuild", sourceType: "internal", requiredModules: ["asset"],
      maintenanceScope: "current-park", requiredPermission: "property_task:rebuild"
    } })],
    ["descriptor source mismatch", productionResolver({ access: {
      ...access(), sourceType: "housing_lease"
    } })],
    ["descriptor extra key", productionResolver({ access: {
      ...access(), extra: true
    } })],
    ["descriptor missing key", productionResolver({ access: (() => {
      const { surfaceId: _surfaceId, ...missing } = access();
      return missing;
    })() })],
    ["empty modules", productionResolver({ access: {
      ...access(), requiredModules: []
    } })],
    ["non-array modules", productionResolver({ access: {
      ...access(), requiredModules: "homestay"
    } })],
    ["malformed module", productionResolver({ access: {
      ...access(), requiredModules: ["Homestay"]
    } })],
    ["duplicate modules", productionResolver({ access: {
      ...access(), requiredModules: ["asset", "asset"]
    } })],
    ["unsorted modules", productionResolver({ access: {
      ...access(), requiredModules: ["homestay", "asset"]
    } })],
    ["empty surface", productionResolver({ access: { ...access(), surfaceId: "" } })],
    ["malformed surface", productionResolver({ access: {
      ...access(), surfaceId: "homestay operations"
    } })],
    ["empty page permission", productionResolver({ access: {
      ...access(), pagePermission: ""
    } })],
    ["malformed page permission", productionResolver({ access: {
      ...access(), pagePermission: "Homestay:read"
    } })],
    ["empty detail permission", productionResolver({ access: {
      ...access(), sourceDetailPermission: ""
    } })],
    ["malformed detail permission", productionResolver({ access: {
      ...access(), sourceDetailPermission: "homestay read"
    } })],
    ["empty queue", productionResolver({ access: { ...access(), queueCode: "" } })],
    ["malformed queue", productionResolver({ access: {
      ...access(), queueCode: "homestay-arrival"
    } })],
    ["empty route", productionResolver({ access: { ...access(), domainRoute: "" } })],
    ["route without task placeholder", productionResolver({ access: {
      ...access(), domainRoute: "/homestay/tasks"
    } })],
    ["route with query", productionResolver({ access: {
      ...access(), domainRoute: "/homestay/tasks/[taskId]?source=queue"
    } })],
    ["route with traversal", productionResolver({ access: {
      ...access(), domainRoute: "/homestay/../tasks/[taskId]"
    } })]
  ];

  for (const [label, resolver] of malformed) {
    assert.throws(
      () => shared.createPropertyTaskComposedSourceRegistry([resolver]),
      undefined,
      label
    );
  }

  assert.doesNotThrow(() => shared.createPropertyTaskComposedSourceRegistry([
    productionResolver({
      assignmentAuthority: "owning",
      async invokeOwningCommand() {}
    })
  ]));
  assert.doesNotThrow(() => shared.createPropertyTaskComposedSourceRegistry([
    productionResolver({ access: {
      ...access(), requiredModules: ["asset", "homestay"]
    } })
  ]));
});

test("typed task wire, recovery, receipt and replacement closed sets are exact", () => {
  assert.deepEqual(shared.PROPERTY_TASK_ACTIONS, [
    "property.task.claim", "property.task.start", "property.task.block",
    "property.task.unblock", "property.task.release"
  ]);
  assert.deepEqual(shared.PROPERTY_TASK_WIRE_FIELD_SETS.listResponse,
    ["items", "page", "pageSize", "total"]);
  assert.deepEqual(shared.PROPERTY_TASK_WIRE_FIELD_SETS.mutationResponse,
    ["task", "replayed", "replayedResultRef", "originalResultVersion"]);
  assert.deepEqual(shared.PROPERTY_TASK_RECOVERY_ACTIONS, [
    "property.task.refresh", "property.task.return-to-workspace", "property.task.reload"
  ]);
  assert.equal(shared.PROPERTY_TASK_ERROR_GOLDEN["task-version-conflict"].latestVersion,
    "required");
  assert.deepEqual(shared.PROPERTY_MUTATION_RECEIPT_ACQUIRE_MODES,
    ["execute-or-replay", "existing-only"]);
  assert.equal(typeof shared.PROPERTY_MUTATION_RECEIPT_PORT, "symbol");
  assert.equal(shared.PROPERTY_MUTATION_RECEIPT_PORT.description,
    "PROPERTY_MUTATION_RECEIPT_PORT");
  assert.equal(shared.PROPERTY_MUTATION_RECEIPT_CONTRACT_VERSION, "port-v2");
  assert.deepEqual(shared.PROPERTY_TASK_REPLACE_MODES,
    ["manual-rebuild", "authority-sync"]);
  assert.deepEqual(shared.PROPERTY_TASK_REPLACEMENT_COMMAND_ACTIONS, [
    "property.task.rebuild", "property.task.claim", "property.task.start",
    "property.task.block", "property.task.unblock", "property.task.release",
    "property.task.source-terminal.closed", "property.task.source-terminal.cancelled"
  ]);
  assert.deepEqual(shared.PROPERTY_TASK_SOURCE_TERMINAL_REQUEST_FIELDS, [
    "schemaVersion", "tenantId", "parkId", "terminalActorId", "actionId", "targetId",
    "sourceType", "sourceId", "businessOccurrenceKey", "taskKey", "terminal",
    "sourceVersion", "expectedAssignmentVersion", "outcomeCode", "outcomeAt"
  ]);

  const declaration = fs.readFileSync(path.join(
    __dirname, "../dist/property-business/property-task-contracts.d.ts"
  ), "utf8");
  assert.match(declaration,
    /export type EntityManager = object;/);
  assert.match(declaration,
    /export type PropertyTaskMutationIdentity =/);
  assert.doesNotMatch(declaration, /tag: "general"/);
  assert.match(declaration, /contractVersion: typeof PROPERTY_MUTATION_RECEIPT_CONTRACT_VERSION;/);
  assert.match(declaration,
    /acquire\(manager: EntityManager, input: PropertyMutationReceiptAcquireInput\)/);
  assert.match(declaration,
    /complete\(manager: EntityManager, input: PropertyMutationReceiptCompleteInput\)/);
  assert.doesNotMatch(declaration,
    /acquire\(manager: EntityManagerPort|complete\(manager: EntityManagerPort/);
  assert.match(declaration, /kind: "execute";\s+receiptId: string;/);
  assert.match(declaration,
    /kind: "replay";\s+resultHash: string;\s+resultRef: string;\s+resultVersion: number;/);
  assert.doesNotMatch(declaration,
    /interface PropertyMutationReceiptReplay \{\s+kind: "replay";\s+receiptId:/);
});

test("receipt action manifests reproduce the signed UTF-8 bytes and hashes", () => {
  const legacyBytes = Buffer.from(
    shared.legacyMutationReceiptActionAuthorityManifestCanonicalBytes()
  );
  const portBytes = Buffer.from(
    shared.propertyTaskPortV2ActionIdentityModeManifestCanonicalBytes()
  );
  assert.equal(legacyBytes.toString("utf8"),
    "legacy-action-authority-v1\n"
      + "row\tproperty.approval.submit\tapproval-runtime-owner\tlegacy-v1\n"
      + "row\tproperty.approval.withdraw\tapproval-runtime-owner\tlegacy-v1\n"
      + "row\tproperty.approval.decide\tapproval-runtime-owner\tlegacy-v1\n"
      + "row\tproperty.approval.incident-retry\tapproval-runtime-owner\tlegacy-v1\n"
      + "row\tproperty.event.replay\tapproval-runtime-owner\tlegacy-v1\n"
      + "row\tproperty.notification.mark-read\tapproval-runtime-owner\tlegacy-v1\n"
      + "row\tparty.identity.create-draft\tproperty-foundation-identity-owner\tlegacy-v1\n"
      + "row\tparty.identity.update-draft\tproperty-foundation-identity-owner\tlegacy-v1\n"
      + "row\tparty.identity.submit\tproperty-foundation-identity-owner\tlegacy-v1\n"
      + "row\tparty.identity.claim\tproperty-foundation-identity-owner\tlegacy-v1\n"
      + "row\tparty.identity.reassign\tproperty-foundation-identity-owner\tlegacy-v1\n"
      + "row\tparty.identity.verify\tproperty-foundation-identity-owner\tlegacy-v1\n"
      + "row\tparty.identity.withdraw\tproperty-foundation-identity-owner\tlegacy-v1\n");
  assert.equal(portBytes.toString("utf8"),
    "port-v2-action-identity-mode-v1\n"
      + "row\tproperty.task.rebuild\tproperty-task-source-rebuild\texecute-or-replay\n"
      + "row\tproperty.task.claim\tproperty-task\texecute-or-replay\n"
      + "row\tproperty.task.start\tproperty-task\texecute-or-replay\n"
      + "row\tproperty.task.block\tproperty-task\texecute-or-replay\n"
      + "row\tproperty.task.unblock\tproperty-task\texecute-or-replay\n"
      + "row\tproperty.task.release\tproperty-task\texecute-or-replay\n"
      + "row\tproperty.task.source-terminal.closed\tproperty-task\t"
        + "execute-or-replay,existing-only\n"
      + "row\tproperty.task.source-terminal.cancelled\tproperty-task\t"
        + "execute-or-replay,existing-only\n");
  assert.equal(crypto.createHash("sha256").update(legacyBytes).digest("hex"),
    "4e48a5d5085e09668b4690a582e1d3703feef0b4fadfcf37ddec99177e97f4d9");
  assert.equal(crypto.createHash("sha256").update(portBytes).digest("hex"),
    "34b48dd58ada4c82a15f6b1b3b997f66873700eb43ac571f253efa039c25a975");
  assert.equal(shared.LEGACY_MUTATION_RECEIPT_ACTION_AUTHORITY_MANIFEST.length, 13);
  assert.equal(shared.PROPERTY_TASK_PORT_V2_ACTION_IDENTITY_MODE_MANIFEST.length, 8);
});

test("port-v2 action identity mode and mutation result grammar are closed exact", async () => {
  const targetId = "123e4567-e89b-12d3-a456-426614174000";
  const itemIdentity = {
    tag: "property-task",
    businessOccurrenceKey: "arrival-😀",
    taskKey: "a".repeat(64)
  };
  const item = {
    actionId: "property.task.claim",
    targetId,
    identity: itemIdentity,
    resultRef: `property-task/${targetId}/v7`,
    resultVersion: 7
  };
  const itemBytes = Buffer.from(shared.propertyTaskMutationResultCanonicalBytes(item));
  assert.equal(itemBytes.toString("utf8"),
    "property-mutation-result-v1\n"
      + `property.task.claim\t${targetId}\tproperty-task:${"a".repeat(64)}:12:arrival-😀\t`
      + `property-task/${targetId}/v7\t7\n`);
  assert.equal(await shared.propertyTaskMutationResultHash(item),
    crypto.createHash("sha256").update(itemBytes).digest("hex"));

  const rebuildIdentity = {
    tag: "property-task-source-rebuild",
    sourceType: "homestay_booking",
    sourceId: targetId
  };
  const rebuild = {
    actionId: "property.task.rebuild",
    targetId,
    identity: rebuildIdentity,
    resultRef: `property-task-rebuild/homestay_booking/${targetId}/v2`,
    resultVersion: 2
  };
  const rebuildBytes = Buffer.from(shared.propertyTaskMutationResultCanonicalBytes(rebuild));
  assert.equal(rebuildBytes.toString("utf8"),
    "property-mutation-result-v1\n"
      + `property.task.rebuild\t${targetId}\t`
      + `property-task-source-rebuild:16:homestay_booking:${targetId}\t`
      + `property-task-rebuild/homestay_booking/${targetId}/v2\t2\n`);
  assert.equal(await shared.propertyTaskMutationResultHash(rebuild),
    crypto.createHash("sha256").update(rebuildBytes).digest("hex"));

  assert.doesNotThrow(() => shared.assertPropertyTaskMutationActionIdentityMode({
    contractVersion: "port-v2", actionId: "property.task.source-terminal.closed",
    targetId, identity: itemIdentity, acquireMode: "existing-only"
  }));
  for (const bad of [
    { contractVersion: "legacy-v1", actionId: "property.task.claim",
      targetId, identity: itemIdentity, acquireMode: "execute-or-replay" },
    { contractVersion: "port-v2", actionId: "property.task.claim",
      targetId, identity: rebuildIdentity, acquireMode: "execute-or-replay" },
    { contractVersion: "port-v2", actionId: "property.task.rebuild",
      targetId, identity: rebuildIdentity, acquireMode: "existing-only" },
    { contractVersion: "port-v2", actionId: "property.task.rebuild",
      targetId: "123e4567-e89b-12d3-a456-426614174001",
      identity: rebuildIdentity, acquireMode: "execute-or-replay" }
  ]) assert.throws(() => shared.assertPropertyTaskMutationActionIdentityMode(bad));

  for (const bad of [
    { ...item, resultVersion: 0 },
    { ...item, resultVersion: 2147483648 },
    { ...item, resultVersion: 1.5 },
    { ...item, resultRef: `property-task/${targetId}/v8` },
    { ...item, targetId: targetId.toUpperCase() },
    { ...item, actionId: "property.task.rebuild" }
  ]) assert.throws(() => shared.propertyTaskMutationResultCanonicalBytes(bad));
});

test("task wire golden enforces nulls, conditional omission, unknown keys and action order", () => {
  const listItem = {
    taskId: "123e4567-e89b-12d3-a456-426614174000",
    assignmentAuthority: "derived",
    taskKind: "arrival",
    kindLabel: "Arrival",
    sourceType: "test_fixture_source",
    sourceLabel: "Booking",
    title: "Prepare arrival",
    priority: 50,
    dueAt: null,
    assignmentStatus: "open",
    assignmentVersion: 1,
    assigneeDisplay: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    allowedActions: ["property.task.claim"]
  };
  assert.deepEqual(shared.validatePropertyTaskListItemWire(listItem, false), []);
  assert.ok(shared.validatePropertyTaskListItemWire({ ...listItem, unknown: true }, false)
    .some((issue) => issue.includes("keys are not exact")));
  const { dueAt: _dueAt, ...missingNull } = listItem;
  assert.ok(shared.validatePropertyTaskListItemWire(missingNull, false).length > 0);
  assert.ok(shared.validatePropertyTaskListItemWire({
    ...listItem,
    allowedActions: ["property.task.release", "property.task.claim"]
  }, false).some((issue) => issue.includes("ordered action subsequence")));

  const detail = {
    ...listItem,
    sourceVersion: 1,
    businessOccurrenceKey: "arrival-1",
    claimedAt: null,
    startedAt: null,
    blockedUntil: null
  };
  assert.deepEqual(shared.validatePropertyTaskDetailWire(detail, false), []);
  assert.ok(shared.validatePropertyTaskDetailWire({
    ...detail,
    sourceId: "123e4567-e89b-12d3-a456-426614174001"
  }, false).some((issue) => issue.includes("keys are not exact")));

  const terminalDetail = {
    ...detail,
    assignmentStatus: "closed",
    sourceId: "123e4567-e89b-12d3-a456-426614174001",
    sourceDeepLink: null,
    outcome: {
      code: "completed",
      sourceVersion: 2,
      at: "2026-08-01T00:01:00.000Z"
    },
    allowedActions: []
  };
  assert.deepEqual(shared.validatePropertyTaskDetailWire(terminalDetail, true), []);
  assert.ok(shared.validatePropertyTaskDetailWire({
    ...terminalDetail,
    outcome: { ...terminalDetail.outcome, internal: true }
  }, true).some((issue) => issue.includes("outcome keys are not exact")));

  const blocked = {
    ...detail,
    assignmentStatus: "blocked",
    blockedReason: "waiting",
    sourceId: "123e4567-e89b-12d3-a456-426614174001",
    sourceDeepLink: null
  };
  assert.deepEqual(shared.validatePropertyTaskDetailWire(blocked, true), []);
  const { blockedReason: _blockedReason, ...missingBlockedReason } = blocked;
  assert.ok(shared.validatePropertyTaskDetailWire(missingBlockedReason, true).length > 0);

  for (const [wireName, keys] of Object.entries(shared.PROPERTY_TASK_WIRE_FIELD_SETS)) {
    assert.equal(new Set(keys).size, keys.length, `${wireName} has duplicate keys`);
  }

  const exactWireFixtures = {
    listResponse: { items: [listItem], page: 1, pageSize: 20, total: 1 },
    outcome: terminalDetail.outcome,
    mutationBase: {
      clientKey: "client-1", expectedAssignmentVersion: 1,
      expectedSourceVersion: 1, businessOccurrenceKey: "arrival-1"
    },
    mutationResponse: {
      task: detail, replayed: false, replayedResultRef: null, originalResultVersion: 1
    },
    rebuildRequest: {
      clientKey: "client-1", sourceType: "test_fixture_source",
      sourceId: "123e4567-e89b-12d3-a456-426614174001",
      expectedProjectionVersion: 1, reason: "repair"
    },
    rebuildResponse: {
      sourceType: "test_fixture_source",
      sourceId: "123e4567-e89b-12d3-a456-426614174001",
      previousProjectionVersion: 1, projectionVersion: 2, projectedTaskCount: 1,
      assignmentMutationCount: 0, replayed: false, replayedResultRef: null,
      originalResultVersion: 2
    }
  };
  for (const [fieldSet, fixture] of Object.entries(exactWireFixtures)) {
    assert.equal(shared.validatePropertyTaskExactWireKeys(fixture, fieldSet), true);
    assert.equal(shared.validatePropertyTaskExactWireKeys({ ...fixture, unknown: true }, fieldSet),
      false);
    const [firstKey] = Object.keys(fixture);
    const missing = { ...fixture };
    delete missing[firstKey];
    assert.equal(shared.validatePropertyTaskExactWireKeys(missing, fieldSet), false);
  }
});

test("terminal receipt fence allows only active=current and same-terminal=current-1", () => {
  assert.deepEqual(shared.evaluatePropertyTaskTerminalReceiptFence({
    authorityState: "active", lockedAssignmentVersion: 5,
    incomingExpectedAssignmentVersion: 5
  }), { allowed: true, acquireMode: "execute-or-replay", receiptAccessCount: 1 });
  assert.deepEqual(shared.evaluatePropertyTaskTerminalReceiptFence({
    authorityState: "same-terminal", lockedAssignmentVersion: 6,
    incomingExpectedAssignmentVersion: 5
  }), { allowed: true, acquireMode: "existing-only", receiptAccessCount: 1 });

  for (const incomingExpectedAssignmentVersion of [
    6, 4, 0, -1, 4.5, Number.MAX_SAFE_INTEGER + 1
  ]) {
    assert.deepEqual(shared.evaluatePropertyTaskTerminalReceiptFence({
      authorityState: "same-terminal",
      lockedAssignmentVersion: 6,
      incomingExpectedAssignmentVersion
    }), {
      allowed: false,
      errorCode: "property-version-conflict",
      receiptAccessCount: 0
    });
  }
  for (const fixture of [
    { lockedAssignmentVersion: Number.MAX_SAFE_INTEGER,
      incomingExpectedAssignmentVersion: Number.MAX_SAFE_INTEGER },
    { lockedAssignmentVersion: Number.MAX_SAFE_INTEGER + 1,
      incomingExpectedAssignmentVersion: Number.MAX_SAFE_INTEGER }
  ]) {
    assert.equal(shared.evaluatePropertyTaskTerminalReceiptFence({
      authorityState: "active", ...fixture
    }).receiptAccessCount, 0);
  }
  for (const incomingExpectedAssignmentVersion of [
    4, 6, 0, -1, 4.5, Number.MAX_SAFE_INTEGER + 1
  ]) {
    assert.equal(shared.evaluatePropertyTaskTerminalReceiptFence({
      authorityState: "active",
      lockedAssignmentVersion: 5,
      incomingExpectedAssignmentVersion
    }).receiptAccessCount, 0);
  }
});

test("source terminal canonical bytes and alert/runbook goldens are exact", () => {
  const input = {
    schemaVersion: "property-task-source-terminal-v1",
    tenantId: "tenant-1",
    parkId: "park-1",
    terminalActorId: "123e4567-e89b-12d3-a456-426614174000",
    actionId: "property.task.source-terminal.closed",
    sourceType: "homestay_booking",
    sourceId: "123e4567-e89b-12d3-a456-426614174001",
    targetId: "123e4567-e89b-12d3-a456-426614174001",
    businessOccurrenceKey: "arrival-1",
    taskKey: "b".repeat(64),
    terminal: "closed",
    sourceVersion: 7,
    expectedAssignmentVersion: 3,
    outcomeCode: "completed",
    outcomeAt: "2026-08-01T00:00:00.000Z"
  };
  assert.equal(
    Buffer.from(shared.propertyTaskSourceTerminalClientKeyCanonicalBytes(input)).toString("utf8"),
    "property-task-source-terminal-client-key-v1\n"
      + `tenant-1\tpark-1\t123e4567-e89b-12d3-a456-426614174000\thomestay_booking\t`
      + `123e4567-e89b-12d3-a456-426614174001\tarrival-1\t${"b".repeat(64)}\tclosed\t`
      + "7\tcompleted\t2026-08-01T00:00:00.000Z\n"
  );
  assert.throws(() => shared.propertyTaskSourceTerminalClientKeyCanonicalBytes({
    ...input, outcomeAt: "2026-08-01T00:00:00Z"
  }));
  for (const outcomeAt of [
    "2026-13-01T00:00:00.000Z",
    "2026-02-30T00:00:00.000Z",
    "2026-02-31T00:00:00.000Z",
    "2025-02-29T00:00:00.000Z",
    "2026-01-01T24:00:00.000Z",
    "2026-01-01T25:00:00.000Z",
    "2026-01-01T00:60:00.000Z",
    "2026-01-01T00:00:60.000Z"
  ]) {
    assert.equal(shared.isCanonicalUtcMillisecondIso(outcomeAt), false);
    assert.throws(() => shared.propertyTaskSourceTerminalClientKeyCanonicalBytes({
      ...input, outcomeAt
    }));
  }
  for (const outcomeAt of [
    "2024-02-29T23:59:59.999Z",
    "2026-01-31T23:59:59.999Z",
    "2026-04-30T23:59:59.999Z"
  ]) {
    assert.equal(shared.isCanonicalUtcMillisecondIso(outcomeAt), true);
    assert.doesNotThrow(() => shared.propertyTaskSourceTerminalClientKeyCanonicalBytes({
      ...input, outcomeAt
    }));
  }
  assert.throws(() => shared.propertyTaskSourceTerminalClientKeyCanonicalBytes({
    ...input, actionId: "property.task.source-terminal.cancelled"
  }));
  assert.throws(() => shared.propertyTaskSourceTerminalClientKeyCanonicalBytes({
    ...input, terminal: "unknown"
  }));
  assert.throws(() => shared.propertyTaskSourceTerminalClientKeyCanonicalBytes({
    ...input, sourceVersion: Number.MAX_SAFE_INTEGER + 1
  }));
  assert.throws(() => shared.propertyTaskSourceTerminalClientKeyCanonicalBytes({
    ...input, expectedAssignmentVersion: 0
  }));
  for (const field of Object.keys(input).filter((key) => typeof input[key] === "string")) {
    for (const invalid of ["\ud800", "\udc00", "\ufffd"]) {
      assert.throws(() => shared.propertyTaskSourceTerminalClientKeyCanonicalBytes({
        ...input, [field]: invalid
      }), `${field} must reject ${JSON.stringify(invalid)}`);
    }
  }
  assert.doesNotThrow(() => shared.propertyTaskSourceTerminalClientKeyCanonicalBytes({
    ...input, tenantId: "tenant-😀"
  }));
  const clientKey = shared.PROPERTY_TASK_TERMINAL_CLIENT_KEY_PREFIX
    + require("node:crypto").createHash("sha256")
      .update(shared.propertyTaskSourceTerminalClientKeyCanonicalBytes(input))
      .digest("hex");
  assert.equal(clientKey.length, 72);
  assert.match(clientKey, shared.PROPERTY_TASK_TERMINAL_CLIENT_KEY_PATTERN);
  assert.equal(Object.keys(shared.PROPERTY_TASK_RUNTIME_RUNBOOK_KEYS).length, 4);
  for (const code of shared.PROPERTY_TASK_RUNTIME_ALERT_CODES) {
    assert.equal(shared.PROPERTY_TASK_RUNTIME_RUNBOOK_KEYS[code], `${code}-runbook`);
  }
});
