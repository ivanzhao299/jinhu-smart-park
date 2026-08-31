const assert = require("node:assert/strict");
const test = require("node:test");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  APPROVAL_DECISION_STATUSES,
  APPROVAL_EXECUTION_STATUSES,
  IDENTITY_SUBMISSION_STATUSES,
  PROPERTY_ERROR_CODES,
  PROPERTY_EVENT_DELIVERY_INCIDENT_STATUSES,
  PROPERTY_NOTIFICATION_DELIVERY_STATUSES,
  PROPERTY_NOTIFICATION_DEEP_LINK_TEMPLATES,
  PROPERTY_TASK_STATUSES,
  PROPERTY_TRACK_B_ENDPOINT_PERMISSION_MANIFEST,
  PROPERTY_TRACK_B_ENDPOINT_PERMISSION_MANIFEST_SHA256,
  PROPERTY_TRACK_B_API_ROUTES,
  normalizeIdentityClientKey,
  resolveIdentityClientKey,
  PROPERTY_TRACK_B_SURFACES,
  TRACK_B_ACTION_PERMISSION_CODES,
  TRACK_B_ACTION_PERMISSION_DEFINITIONS,
  TRACK_B_ALLOWED_ACTIONS,
  TRACK_B_APPROVAL_EFFECT_MANIFEST,
  TRACK_B_CONTRACT_SHA256,
  TRACK_B_EFFECT_KIND_PATTERN,
  TRACK_B_PAGE_PERMISSION_CODES,
  TRACK_B_PRODUCT_ACCESS_FREEZE_SHA256,
  TRACK_B_IDENTITY_CONTROL_FREEZE_SHA256,
  TRACK_B_RUNTIME_CONTRACT_FREEZE_SHA256,
  TRACK_B_SCHEMA_PHYSICAL_ADDENDUM_SHA256,
  validatePropertyTrackBEndpointPermissionManifest
} = require("../dist/index.js");

test("housing approval notifications retain the housing task deep-link contract", () => {
  assert.equal(
    PROPERTY_NOTIFICATION_DEEP_LINK_TEMPLATES["housing-approval-stage-assigned"],
    "/housing/tasks?requestId=[requestId]"
  );
});

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map(
    (key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`
  ).join(",")}}`;
}

test("Track B contract exposes the signed exact permission and surface sets", () => {
  assert.equal(
    TRACK_B_CONTRACT_SHA256,
    "e27d523469491916efbda41b0570e146362a0d6037a54454330650dc8b397944"
  );
  assert.equal(
    TRACK_B_RUNTIME_CONTRACT_FREEZE_SHA256,
    "47643a485e6fd4898c1b6f5cc61c580ac29121d87365b10da4d538dce8d8e2cf"
  );
  assert.equal(
    TRACK_B_PRODUCT_ACCESS_FREEZE_SHA256,
    "d7ced7b7e08543876bc117165fe5b47ce0379a69f78368a4ba7fb68d32d96040"
  );
  assert.equal(
    TRACK_B_IDENTITY_CONTROL_FREEZE_SHA256,
    "062ba02b310e00a7fb43e3288e1cd78c55f23d30518e8aeac006eae8b7ea9496"
  );
  assert.equal(
    TRACK_B_SCHEMA_PHYSICAL_ADDENDUM_SHA256,
    "3830b12d665bbfb39c6e2747637ebd1592f7abfbe4d44af53c64aa123dd844d5"
  );
  const contractBytes = [
    "b-contract-v2",
    `freeze\tb0-runtime-contract-freeze.md\t${TRACK_B_RUNTIME_CONTRACT_FREEZE_SHA256}`,
    `freeze\tb0-product-access-freeze.md\t${TRACK_B_PRODUCT_ACCESS_FREEZE_SHA256}`,
    `freeze\tb0-identity-control-freeze.md\t${TRACK_B_IDENTITY_CONTROL_FREEZE_SHA256}`,
    `freeze\tb0-schema-physical-addendum.md\t${TRACK_B_SCHEMA_PHYSICAL_ADDENDUM_SHA256}`,
    ""
  ].join("\n");
  assert.equal(
    crypto.createHash("sha256").update(contractBytes).digest("hex"),
    TRACK_B_CONTRACT_SHA256
  );
  assert.equal(TRACK_B_ACTION_PERMISSION_CODES.length, 22);
  assert.equal(TRACK_B_ACTION_PERMISSION_DEFINITIONS.length, 22);
  assert.deepEqual(
    TRACK_B_ACTION_PERMISSION_DEFINITIONS.map((definition) => definition.code).sort(),
    [...TRACK_B_ACTION_PERMISSION_CODES].sort()
  );
  assert.equal(new Set(TRACK_B_ACTION_PERMISSION_CODES).size, 22);
  assert.equal(TRACK_B_PAGE_PERMISSION_CODES.length, 7);
  assert.equal(new Set(TRACK_B_PAGE_PERMISSION_CODES).size, 7);
  assert.deepEqual(
    [...TRACK_B_PAGE_PERMISSION_CODES].sort(),
    [
      "asset:identity-submissions:page",
      "asset:property-mode-transitions:page",
      "asset:property-occupancies:page",
      "asset:property-operations:page",
      "property:approval-incidents:page",
      "property:event-delivery-incidents:page",
      "property:notifications:page"
    ]
  );
  assert.equal(PROPERTY_TRACK_B_SURFACES.length, 7);
  assert.deepEqual(
    PROPERTY_TRACK_B_SURFACES.map((surface) => surface.pagePermission).sort(),
    [...TRACK_B_PAGE_PERMISSION_CODES].sort()
  );
});

test("Track B state machines and wire error catalog have no aliases", () => {
  assert.deepEqual(IDENTITY_SUBMISSION_STATUSES, [
    "draft", "pending_verification", "verified", "rejected", "withdrawn", "superseded"
  ]);
  assert.deepEqual(APPROVAL_DECISION_STATUSES, [
    "draft", "submitted", "pending_approval", "approved", "rejected", "withdrawn", "expired"
  ]);
  assert.deepEqual(APPROVAL_EXECUTION_STATUSES, [
    "not_started", "executing", "retry_wait", "executed", "execution_failed",
    "infra_exhausted", "not_required"
  ]);
  assert.deepEqual(PROPERTY_TASK_STATUSES, [
    "open", "claimed", "in_progress", "blocked", "closed", "cancelled"
  ]);
  assert.deepEqual(PROPERTY_NOTIFICATION_DELIVERY_STATUSES, [
    "pending", "delivering", "delivered", "delivery_failed", "delivery_exhausted"
  ]);
  assert.deepEqual(PROPERTY_EVENT_DELIVERY_INCIDENT_STATUSES, [
    "active", "replaying", "resolved", "quarantined"
  ]);
  assert.deepEqual(PROPERTY_ERROR_CODES, [
    "property-validation-failed",
    "property-action-forbidden",
    "property-resource-not-found",
    "property-version-conflict",
    "idempotency-key-conflict",
    "identity-active-submission-exists",
    "identity-snapshot-stale",
    "identity-actor-separation-required",
    "identity-file-not-ready",
    "approval-required",
    "approval-policy-not-found",
    "approval-no-eligible-approver",
    "approval-actor-separation-required",
    "approval-source-changed",
    "approval-already-decided",
    "approval-withdraw-forbidden",
    "approval-execution-failed",
    "approval-infra-exhausted",
    "approval-reconcile-partial",
    "event-checksum-mismatch",
    "event-replay-forbidden",
    "task-already-claimed",
    "task-source-ineligible",
    "task-version-conflict",
    "property-mode-blocked",
    "module-dependency-conflict",
    "property-operation-in-progress",
    "property-runtime-unavailable"
  ]);
  assert.equal(PROPERTY_ERROR_CODES.length, 28);
  assert.ok(PROPERTY_ERROR_CODES.every((code) => /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(code)));
});

test("Track B action to effect mapping is explicit and lower-dot only", () => {
  assert.equal(Object.keys(TRACK_B_APPROVAL_EFFECT_MANIFEST).length, 11);
  for (const [actionId, effects] of Object.entries(TRACK_B_APPROVAL_EFFECT_MANIFEST)) {
    assert.ok(actionId.endsWith(".request"));
    assert.ok(effects.length > 0);
    assert.ok(effects.every((effect) => TRACK_B_EFFECT_KIND_PATTERN.test(effect)));
    assert.ok(effects.every((effect) => effect !== actionId));
  }
  assert.ok(TRACK_B_ALLOWED_ACTIONS.includes("party.identity.claim"));
  assert.ok(TRACK_B_ALLOWED_ACTIONS.includes("party.identity.reassign"));
  assert.ok(!TRACK_B_ALLOWED_ACTIONS.includes("party.identity.retry"));
  assert.ok(!TRACK_B_ALLOWED_ACTIONS.includes("property.task.supervise"));
});

test("identity clientKey preserves the exact shared header/body value", () => {
  assert.equal(normalizeIdentityClientKey("key-001"), "key-001");
  assert.equal(resolveIdentityClientKey("key-001", "key-001"), "key-001");
  assert.equal(resolveIdentityClientKey("key-001", "key-002"), null);
  assert.equal(resolveIdentityClientKey(null, "key-001"), null);
  assert.equal(resolveIdentityClientKey("key-001", undefined), null);

  assert.equal(normalizeIdentityClientKey(" key "), " key ");
  assert.equal(resolveIdentityClientKey(" key ", " key "), " key ");
  assert.equal(resolveIdentityClientKey(" key ", "key"), null);
  assert.equal(resolveIdentityClientKey("key", " key "), null);
  assert.equal(normalizeIdentityClientKey("   "), null);
  assert.equal(normalizeIdentityClientKey("a".repeat(129)), null);
  assert.equal(normalizeIdentityClientKey("line\nbreak"), null);
  assert.equal(normalizeIdentityClientKey("中文"), null);

  const maxLength = "a".repeat(128);
  assert.equal(normalizeIdentityClientKey(maxLength), maxLength);
  assert.equal(resolveIdentityClientKey(maxLength, maxLength), maxLength);
});

test("Track B endpoint authority is unique, canonical and signed", () => {
  assert.equal(PROPERTY_TRACK_B_ENDPOINT_PERMISSION_MANIFEST.length, 66);
  assert.deepEqual(validatePropertyTrackBEndpointPermissionManifest(), []);
  const sorted = [...PROPERTY_TRACK_B_ENDPOINT_PERMISSION_MANIFEST].sort((left, right) => {
    const leftKey = Buffer.from(`${left.method}\t${left.path}`, "utf8");
    const rightKey = Buffer.from(`${right.method}\t${right.path}`, "utf8");
    return Buffer.compare(leftKey, rightKey);
  });
  const manifestBytes = `b-endpoint-manifest-v2\n${sorted.map((entry) => {
    const rowDigest = crypto.createHash("sha256")
      .update(canonicalJson(entry))
      .digest("hex");
    return `row\t${entry.method}\t${entry.path}\t${rowDigest}\n`;
  }).join("")}`;
  const digest = crypto.createHash("sha256").update(manifestBytes).digest("hex");
  assert.equal(digest, PROPERTY_TRACK_B_ENDPOINT_PERMISSION_MANIFEST_SHA256);
  assert.equal(
    PROPERTY_TRACK_B_API_ROUTES.occupancyAvailability,
    "/api/v1/property/occupancies/availability"
  );
  assert.deepEqual(
    [
      PROPERTY_TRACK_B_API_ROUTES.task,
      PROPERTY_TRACK_B_API_ROUTES.taskClaim,
      PROPERTY_TRACK_B_API_ROUTES.taskStart,
      PROPERTY_TRACK_B_API_ROUTES.taskBlock,
      PROPERTY_TRACK_B_API_ROUTES.taskUnblock,
      PROPERTY_TRACK_B_API_ROUTES.taskRelease
    ],
    [
      "/api/v1/property/tasks/:taskId",
      "/api/v1/property/tasks/:taskId/claim",
      "/api/v1/property/tasks/:taskId/start",
      "/api/v1/property/tasks/:taskId/block",
      "/api/v1/property/tasks/:taskId/unblock",
      "/api/v1/property/tasks/:taskId/release"
    ]
  );
  assert.deepEqual(
    [
      PROPERTY_TRACK_B_API_ROUTES.occupancy,
      PROPERTY_TRACK_B_API_ROUTES.occupancyRelease
    ],
    [
      "/api/v1/property/occupancies/:occupancyId",
      "/api/v1/property/occupancies/:occupancyId/release"
    ]
  );
  assert.equal(
    PROPERTY_TRACK_B_ENDPOINT_PERMISSION_MANIFEST.some(
      (entry) =>
        entry.path.includes("/property/tasks/:id")
        || entry.path.includes("/property/occupancies/:id")
    ),
    false
  );
  const identityRows = PROPERTY_TRACK_B_ENDPOINT_PERMISSION_MANIFEST.filter(
    (entry) => entry.path.includes("/property/identity-submissions")
  );
  assert.equal(identityRows.length, 11);
  assert.ok(identityRows.every(
    (entry) =>
      entry.requiredModule === "asset"
      && entry.surfaceId === "asset.identity-submissions"
      && entry.requiredPermissions.includes("asset:identity-submissions:page")
  ));
  assert.equal(
    identityRows.some((entry) => entry.path.includes("/:id")),
    false
  );
  assert.deepEqual(
    identityRows.find((entry) => entry.actionId === "party.identity.audit.read")
      .requiredPermissions,
    ["asset:identity-submissions:page", "audit:read", "party:sensitive_read"]
  );
  const identityPermissionGolden = {
    "party.identity.list": ["asset:identity-submissions:page", "party:read"],
    "party.identity.read": ["asset:identity-submissions:page", "party:read"],
    "party.identity.terminal-cas.read": [
      "asset:identity-submissions:page", "party:identity_update", "party:read"
    ],
    "party.identity.create-draft": [
      "asset:identity-submissions:page", "party:identity_update"
    ],
    "party.identity.update-draft": [
      "asset:identity-submissions:page", "party:identity_update"
    ],
    "party.identity.submit": [
      "asset:identity-submissions:page", "party:identity_update"
    ],
    "party.identity.claim": [
      "asset:identity-submissions:page", "party:identity_verify"
    ],
    "party.identity.reassign": [
      "asset:identity-submissions:page", "party:identity_verify"
    ],
    "party.identity.withdraw": [
      "asset:identity-submissions:page", "party:identity_update"
    ],
    "party.identity.verify": [
      "asset:identity-submissions:page", "party:identity_verify"
    ],
    "party.identity.audit.read": [
      "asset:identity-submissions:page", "audit:read", "party:sensitive_read"
    ]
  };
  assert.deepEqual(
    Object.fromEntries(identityRows.map(
      (entry) => [entry.actionId, entry.requiredPermissions]
    )),
    identityPermissionGolden
  );
  assert.equal(
    PROPERTY_TRACK_B_ENDPOINT_PERMISSION_MANIFEST.some(
      (entry) => entry.path === "/api/v1/property/approvals" && entry.method === "POST"
    ),
    false
  );
  assert.deepEqual(
    PROPERTY_TRACK_B_ENDPOINT_PERMISSION_MANIFEST.find(
      (entry) =>
        entry.method === "GET"
        && entry.path === "/api/v1/property/units/:unitId/mode-transitions"
    ),
    {
      method: "GET",
      path: "/api/v1/property/units/:unitId/mode-transitions",
      actionId: "property.mode-transition.list",
      requiredPermissions: [
        "asset:property-mode-transitions:page",
        "property_approval:read"
      ],
      authorizationAlternatives: [],
      requiredModule: "asset",
      surfaceId: "asset.property-mode-transitions"
    }
  );
  assert.deepEqual(
    PROPERTY_TRACK_B_ENDPOINT_PERMISSION_MANIFEST.find(
      (entry) =>
        entry.method === "POST"
        && entry.path === "/api/v1/property/occupancies/availability"
    ),
    {
      method: "POST",
      path: "/api/v1/property/occupancies/availability",
      actionId: "property.occupancy.availability.check",
      requiredPermissions: [
        "asset:property-occupancies:page",
        "property_occupancy:read"
      ],
      authorizationAlternatives: [],
      requiredModule: "asset",
      surfaceId: "asset.property-occupancies"
    }
  );
  assert.equal(
    PROPERTY_TRACK_B_ENDPOINT_PERMISSION_MANIFEST.some(
      (entry) => entry.path.includes("/property/incidents")
        || entry.path.includes("identity-submissions/:submissionId/retry")
        || entry.path.includes("/supervise")
    ),
    false
  );
});

test("Track B source contracts keep business payloads camelCase", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../src/property-business/track-b-contracts.ts"),
    "utf8"
  );
  assert.doesNotMatch(source, /\bpage_size\b|\bsort_by\b|\bsort_order\b|\ballowed_actions\b/);
  assert.match(source, /\bpageSize\b/);
  assert.match(source, /\ballowedActions\b/);
  for (const dto of [
    "CreateIdentityDraftDto",
    "UpdateIdentityDraftDto",
    "SubmitIdentityDto",
    "ClaimIdentityDto",
    "ReassignIdentityDto",
    "DecideIdentityDto",
    "WithdrawIdentityDto",
    "IdentitySubmissionListQuery",
    "IdentitySubmissionProjection",
    "IdentityAuditListQuery",
    "IdentityAuditItem",
    "PartyIdentitySummary",
    "VerifiedIdentityEvidence"
  ]) {
    assert.match(source, new RegExp(`(?:interface|type) ${dto}\\b`));
  }
  assert.doesNotMatch(
    source,
    /\bIdentityVersionCommand\b|\bIdentityRetry\w*\b|\bRevokeIdentity\w*\b/
  );
  const permissionSource = fs.readFileSync(
    path.join(__dirname, "../src/property-business/permissions.ts"),
    "utf8"
  );
  assert.doesNotMatch(permissionSource, /identity-submissions\/:id(?:\/|")/);
});
