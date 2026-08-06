const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const {
  PROPERTY_APPROVAL_COMMAND_PORT,
  PROPERTY_APPROVAL_PORT_CONTRACT_VERSION,
  PROPERTY_APPROVAL_PROJECTION_PORT
} = require("../dist/index.js");

test("approval port runtime ABI exports the frozen version and singleton symbols", () => {
  assert.equal(PROPERTY_APPROVAL_PORT_CONTRACT_VERSION, "property-approval-port-v2");
  assert.equal(PROPERTY_APPROVAL_COMMAND_PORT.description, "PROPERTY_APPROVAL_COMMAND_PORT");
  assert.equal(PROPERTY_APPROVAL_PROJECTION_PORT.description, "PROPERTY_APPROVAL_PROJECTION_PORT");
  assert.notEqual(PROPERTY_APPROVAL_COMMAND_PORT, PROPERTY_APPROVAL_PROJECTION_PORT);
});

test("approval port declaration ABI preserves exact methods and nullable fields", () => {
  const declarations = fs.readFileSync(
    path.join(__dirname, "../dist/property-business/track-b-contracts.d.ts"),
    "utf8"
  );
  for (const signature of [
    "createPendingRequest(",
    "findById(",
    "findActiveBySource(",
    "listBySource("
  ]) assert.match(declarations, new RegExp(signature.replace("(", "\\("), "u"));
  for (const nullable of [
    "amount: string | null;",
    "currency: string | null;",
    "submittedAt: string | null;",
    "decidedAt: string | null;",
    "executedAt: string | null;"
  ]) assert.ok(declarations.includes(nullable));
  assert.ok(declarations.includes("canonicalPayload: Readonly<Record<string, PropertyApprovalJsonValue>>;"));
  assert.ok(declarations.includes("Promise<readonly PropertyApprovalRequestProjection[]>;"));

  const interfaceKeys = (name) => {
    const match = declarations.match(new RegExp(`export interface ${name} \\{([\\s\\S]*?)\\n\\}`, "u"));
    assert.ok(match, `${name} declaration missing`);
    return [...match[1].matchAll(/^\s{4}([A-Za-z][A-Za-z0-9]*)(?:\?|):/gmu)]
      .map((item) => item[1]);
  };
  assert.deepEqual(interfaceKeys("CreatePendingPropertyApprovalCommand"), [
    "contractVersion", "scope", "actionId", "sourceType", "sourceId",
    "sourceExpectedVersion", "requesterId", "submitterId", "actorId", "clientKey",
    "businessIntentKey", "canonicalPayload", "payloadSchemaVersion", "amount", "currency"
  ]);
  assert.deepEqual(interfaceKeys("PropertyApprovalRequestProjection"), [
    "requestId", "tenantId", "parkId", "actionId", "sourceType", "sourceId",
    "sourceExpectedVersion", "requesterId", "submitterId", "businessIntentKey",
    "payloadSchemaVersion", "payloadHash", "amount", "currency", "policyId",
    "policyVersion", "policyHash", "decisionStatus", "executionStatus", "decisionVersion",
    "executionVersion", "submittedAt", "decidedAt", "executedAt", "createdAt", "updatedAt"
  ]);
  assert.deepEqual(interfaceKeys("CreatePendingPropertyApprovalResult"), [
    "disposition", "request"
  ]);
});
