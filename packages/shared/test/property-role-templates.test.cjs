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

test("maker, checker, finance and audit templates do not silently cross privilege boundaries", () => {
  const templates = new Map(
    shared.PROPERTY_ROLE_TEMPLATE_DEFINITIONS.map((definition) => [definition.code, definition])
  );
  const manager = templates.get("PROPERTY_OPERATIONS_MANAGER");
  const approver = templates.get("PROPERTY_OPERATIONS_APPROVER");
  const homestayFinance = templates.get("HOMESTAY_FINANCE");
  const housingFinance = templates.get("HOUSING_FINANCE");
  const auditor = templates.get("PROPERTY_AUDITOR");
  const finalPermissions = (definition) => {
    const bundlePermissions = definition.bundleCodes.flatMap((code) =>
      Object.values(shared.TRACK_B_PERMISSION_BUNDLES).find((bundle) => bundle.code === code)?.permissions ?? []
    );
    return new Set([...bundlePermissions, ...definition.additionalPermissions]
      .filter((permission) => !definition.excludedPermissions.includes(permission)));
  };
  const managerPermissions = finalPermissions(manager);
  const approverPermissions = finalPermissions(approver);
  const homestayFinancePermissions = finalPermissions(homestayFinance);
  const housingFinancePermissions = finalPermissions(housingFinance);
  const auditorPermissions = finalPermissions(auditor);

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
  assert.ok(!approverPermissions.has("property_approval:create"));
  assert.ok(!approverPermissions.has("property_operation:update"));
  assert.ok(homestayFinancePermissions.has("homestay:finance:register"));
  assert.ok(!homestayFinancePermissions.has("housing:finance:register"));
  assert.ok(housingFinancePermissions.has("housing:finance:waive"));
  assert.ok(!housingFinancePermissions.has("homestay:finance:waive"));
  assert.ok(!auditorPermissions.has("party:sensitive_read"));
  assert.ok([...auditorPermissions].every((permission) =>
    permission.endsWith(":page") || permission.endsWith(":read") || permission === "audit:read"
  ));
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
