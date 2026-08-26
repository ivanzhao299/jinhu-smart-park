const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const test = require("node:test");

const shared = require("../dist");

test("property role templates are frozen, park scoped and least privilege", () => {
  shared.validatePropertyRoleTemplates();
  assert.equal(shared.PROPERTY_ROLE_TEMPLATE_DEFINITIONS.length, 7);

  for (const definition of shared.PROPERTY_ROLE_TEMPLATE_DEFINITIONS) {
    const { definitionHash, ...unsigned } = definition;
    const actualHash = createHash("sha256")
      .update(shared.canonicalizePropertyRoleTemplate(unsigned), "utf8")
      .digest("hex");
    assert.equal(actualHash, definitionHash, definition.code);
    assert.equal(definition.roleScope, "park");
    assert.equal(definition.dataScopeRuleCode, "current_park");
    assert.equal(definition.isSensitiveComplianceRole, false);
  }
});

test("property role template bundle signatures are derived from production seed revisions", () => {
  const signatures = new Map(
    shared.PROPERTY_ROLE_TEMPLATE_DEFINITIONS.map((definition) => [
      definition.code,
      createHash("sha256")
        .update(shared.canonicalizePropertyRoleTemplateBundleSignature(definition), "utf8")
        .digest("hex")
    ])
  );

  assert.equal(signatures.get("PROPERTY_OPERATIONS_MANAGER"), "5f195e6283ebe78e869a51ac75a793b86bb57d02c78b9b698f4cb2ee1e1c1cfd");
  assert.equal(signatures.get("PROPERTY_OPERATIONS_APPROVER"), "1474c9b46fbab59394d3e7d43d181c6cc3f2b32dd0fcbd527e8d9b43a060376e");
  assert.equal(signatures.get("HOMESTAY_OPERATOR"), "feb2badfa65e82c0e45170bafd0defb07549f49e161e39d836a3cb0bc8d983f3");
  assert.equal(signatures.get("HOUSING_OPERATOR"), "573d8cce9080e97d80f196a634cd342efd8acd5f812d8de56f0abb87e0b0d4c8");
  assert.equal(signatures.get("HOMESTAY_FINANCE"), "91e7c40677d9a26926e8d5e951631c3a5149786b6d361fa7f2f82408804a93a5");
  assert.equal(signatures.get("HOUSING_FINANCE"), "4001bbd2fe4dc2b552ff493eedc141556ac107e56998e4e2c35e258c4675b593");
  assert.equal(signatures.get("PROPERTY_AUDITOR"), "abb2423994d193a4aff04b91cf7808bbd38dab15769733c5cbd6b6f3afd5a9d0");
});

test("property role template bundle revisions are bound to shared bundle contents", () => {
  for (const revision of Object.values(shared.TRACK_B_PERMISSION_BUNDLE_REVISIONS)) {
    const actualHash = createHash("sha256")
      .update(shared.canonicalizeTrackBPermissionBundleRevision(revision.code), "utf8")
      .digest("hex");
    assert.equal(actualHash, revision.definitionHash, revision.code);
  }
});

test("maker, checker, finance and audit templates do not silently cross privilege boundaries", () => {
  const templates = new Map(
    shared.PROPERTY_ROLE_TEMPLATE_DEFINITIONS.map((definition) => [definition.code, definition])
  );
  const manager = templates.get("PROPERTY_OPERATIONS_MANAGER");
  const approver = templates.get("PROPERTY_OPERATIONS_APPROVER");
  const homestayFinance = templates.get("HOMESTAY_FINANCE");
  const housingFinance = templates.get("HOUSING_FINANCE");
  const auditor = templates.get("PROPERTY_AUDITOR");
  const managerPermissions = new Set(shared.resolvePropertyRoleTemplatePermissionCodes(manager));
  const approverPermissions = new Set(shared.resolvePropertyRoleTemplatePermissionCodes(approver));
  const homestayFinancePermissions = new Set(shared.resolvePropertyRoleTemplatePermissionCodes(homestayFinance));
  const housingFinancePermissions = new Set(shared.resolvePropertyRoleTemplatePermissionCodes(housingFinance));
  const auditorPermissions = new Set(shared.resolvePropertyRoleTemplatePermissionCodes(auditor));

  assert.ok(manager.excludedPermissions.includes("property_approval:decide"));
  assert.ok(approver.excludedPermissions.includes("property_approval:create"));
  assert.ok(approver.excludedPermissions.includes("property_operation:transition_mode"));
  assert.deepEqual(homestayFinance.bundleCodes, [
    shared.TRACK_B_PERMISSION_BUNDLES.HOMESTAY_FINANCE_OPERATOR.code
  ]);
  assert.deepEqual(housingFinance.bundleCodes, [
    shared.TRACK_B_PERMISSION_BUNDLES.HOUSING_FINANCE_OPERATOR.code
  ]);
  assert.ok(auditor.excludedPermissions.includes("party:sensitive_read"));
  assert.ok(managerPermissions.has("property_operation:update"));
  assert.ok(!managerPermissions.has("property_approval:decide"));
  assert.ok(approverPermissions.has("property_approval:decide"));
  assert.ok(approverPermissions.has("housing:task:read"));
  assert.ok(!approverPermissions.has("property_approval:create"));
  assert.ok(!approverPermissions.has("property_operation:update"));
  assert.ok(!approverPermissions.has("housing:lease:create"));
  assert.ok(homestayFinancePermissions.has("homestay:finance:register"));
  assert.ok(!homestayFinancePermissions.has("housing:finance:register"));
  assert.ok(housingFinancePermissions.has("housing:finance:waive"));
  assert.ok(!housingFinancePermissions.has("homestay:finance:waive"));
  assert.ok(!auditorPermissions.has("party:sensitive_read"));
  assert.ok([...auditorPermissions].every((permission) =>
    permission.endsWith(":page") || permission.endsWith(":read") || permission === "audit:read"
  ));
});

test("property role template lookup and permission resolver are the instantiation authority", () => {
  const homestayOperator = shared.findPropertyRoleTemplateDefinition("HOMESTAY_OPERATOR");
  assert.ok(homestayOperator);
  assert.equal(homestayOperator.name, "民宿经办");
  assert.deepEqual(shared.resolvePropertyRoleTemplateBundleReferences("HOMESTAY_OPERATOR"), [
    {
      code: shared.TRACK_B_PERMISSION_BUNDLES.HOMESTAY_TASK_OPERATOR.code,
      definitionVersion: 2,
      definitionHash: "7f37a1f402fa331a805e1bb601822ddddfc1a719a1ed723f72c65acdd98f723d"
    }
  ]);
  assert.deepEqual(
    shared.resolvePropertyRoleTemplatePermissionCodes("HOMESTAY_OPERATOR"),
    [
      "homestay:task:read",
      "homestay:tasks:page",
      "property:notifications:page",
      "property_approval:create",
      "property_approval:read",
      "property_approval:withdraw",
      "property_notification:mark_read",
      "property_notification:read",
      "property_task:claim",
      "property_task:process",
      "property_task:read",
      "property_task:release"
    ]
  );
  assert.equal(shared.findPropertyRoleTemplateDefinition("UNKNOWN_TEMPLATE"), null);
  assert.throws(
    () => shared.resolvePropertyRoleTemplatePermissionCodes("UNKNOWN_TEMPLATE"),
    /unknown-property-role-template:UNKNOWN_TEMPLATE/
  );
});

test("property role field and action policy records the currently enforced boundary", () => {
  const contract = shared.PROPERTY_ROLE_FIELD_ACTION_CONTRACT;
  assert.equal(contract.defaultStandardTemplatesGrantSensitiveRead, false);
  assert.equal(contract.approvalProjection, "minimal_summary");
  assert.deepEqual(contract.fieldPolicyReadProjectionEnforced, ["hidden", "masked"]);
  assert.equal(contract.fieldPolicyWriteEnforcementAvailable, false);
  assert.equal(contract.financialActionsRequireExplicitPermissions, true);
  assert.equal(contract.auditorReadOnlyByDefault, true);
});
