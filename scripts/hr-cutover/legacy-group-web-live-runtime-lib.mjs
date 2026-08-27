export class LegacyGroupWebRuntimeError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyGroupWebRuntimeError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new LegacyGroupWebRuntimeError(code, detail); };
const object = value => value && typeof value === "object" && !Array.isArray(value);
const exact = (value, keys, label) => {
  if (!object(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail("GROUP_WEB_SHAPE_INVALID", label);
};
const strings = (value, label) => {
  if (!Array.isArray(value) || !value.length || value.some(item => typeof item !== "string" || !item.trim()) || new Set(value).size !== value.length) fail("GROUP_WEB_LIST_INVALID", label);
  return value;
};

const REQUIRED_DOMAINS = [
  "organization", "recruitment", "employee", "attendance", "compensation", "performance",
  "training", "enterprise_service", "data_configuration", "decision_center", "system_management", "personal_office"
];
const REQUIRED_ACTIONS = ["browse", "query", "add", "edit", "delete", "state", "print"];

export function verifyLegacyGroupWebRuntime(manifest) {
  exact(manifest, ["formatVersion", "contractKind", "status", "evidenceLevel", "operationMode", "deploymentEvidence", "atomicAuthorization", "topLevelDomains", "roleProjection", "security", "remainingCompatibilityGates", "productionImport"], "root");
  if (manifest.formatVersion !== 1 || manifest.contractKind !== "yuzhou_hr_legacy_group_web_live_runtime" || manifest.status !== "verified_read_only" || manifest.evidenceLevel !== "L4_RUNTIME_SOURCE_AND_DATABASE" || manifest.operationMode !== "read_only") fail("GROUP_WEB_IDENTITY_INVALID", "root");
  const serialized = JSON.stringify(manifest);
  if (/(?:\/Users\/|Downloads\/|file:\/\/|(?:pass(?:word)?|token|secret)\s*[=:]|(?:^|[^0-9])(?:10\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[01])\.))/i.test(serialized)) fail("GROUP_WEB_SENSITIVE_CONTENT", "root");

  exact(manifest.deploymentEvidence, ["technology", "databaseKind", "sourceFiles", "classicAspFiles", "databaseTables", "modules"], "deploymentEvidence");
  if (manifest.deploymentEvidence.technology !== "classic_asp_dedicated_iis_site" || manifest.deploymentEvidence.databaseKind !== "separate_enterprise_hr_database" || manifest.deploymentEvidence.sourceFiles !== 6304 || manifest.deploymentEvidence.classicAspFiles !== 4026 || manifest.deploymentEvidence.databaseTables !== 438) fail("GROUP_WEB_DEPLOYMENT_BOUNDARY_INVALID", "deploymentEvidence");
  const modules = manifest.deploymentEvidence.modules;
  exact(modules, ["total", "level1", "level2", "level3", "navigable", "routeFilesResolved", "moduleInventoryHash"], "deploymentEvidence.modules");
  if (modules.total !== 231 || modules.level1 !== 12 || modules.level2 !== 100 || modules.level3 !== 119 || modules.level1 + modules.level2 + modules.level3 !== modules.total || modules.navigable !== 186 || modules.routeFilesResolved !== modules.navigable || modules.moduleInventoryHash !== "b34ba532888fee122f93305403f8985bcb9bd1a5ccec69e8013b1d4c4f14e296") fail("GROUP_WEB_MODULE_BOUNDARY_INVALID", "deploymentEvidence.modules");

  const auth = manifest.atomicAuthorization;
  exact(auth, ["actions", "dataScopes", "roleTemplates", "deployedUsers", "deployedRoleAssignments", "deployedDepartmentScopeRows", "legacyAssignmentDecision"], "atomicAuthorization");
  if (JSON.stringify(strings(auth.actions, "atomicAuthorization.actions")) !== JSON.stringify(REQUIRED_ACTIONS) || auth.deployedUsers !== 15 || auth.deployedRoleAssignments !== 181 || auth.deployedDepartmentScopeRows !== 694 || auth.legacyAssignmentDecision !== "do_not_clone_overbroad_assignments") fail("GROUP_WEB_AUTHORIZATION_BOUNDARY_INVALID", "atomicAuthorization");
  strings(auth.dataScopes, "atomicAuthorization.dataScopes");
  if (strings(auth.roleTemplates, "atomicAuthorization.roleTemplates").length !== 12) fail("GROUP_WEB_ROLE_TEMPLATE_INVALID", "atomicAuthorization.roleTemplates");

  if (!Array.isArray(manifest.topLevelDomains) || manifest.topLevelDomains.length !== 12) fail("GROUP_WEB_DOMAIN_SET_INVALID", "topLevelDomains");
  const ids = new Set();
  let moduleCount = 0;
  for (const domain of manifest.topLevelDomains) {
    exact(domain, ["id", "legacyName", "legacyModuleCount", "targetRoutes", "disposition", "targetStatus"], `topLevelDomains.${domain?.id}`);
    if (!REQUIRED_DOMAINS.includes(domain.id) || ids.has(domain.id) || typeof domain.legacyName !== "string" || !domain.legacyName || !Number.isInteger(domain.legacyModuleCount) || domain.legacyModuleCount < 1) fail("GROUP_WEB_DOMAIN_INVALID", String(domain?.id));
    strings(domain.targetRoutes, `${domain.id}.targetRoutes`);
    if (!domain.targetRoutes.every(route => route.startsWith("/")) || !["preserve", "modernize", "cross_module"].includes(domain.disposition) || !["mapped", "partial", "implemented"].includes(domain.targetStatus)) fail("GROUP_WEB_TARGET_MAPPING_INVALID", domain.id);
    ids.add(domain.id);
    moduleCount += domain.legacyModuleCount;
  }
  if (REQUIRED_DOMAINS.some(id => !ids.has(id)) || moduleCount !== modules.total) fail("GROUP_WEB_DOMAIN_SET_INVALID", `${ids.size}/${moduleCount}`);

  exact(manifest.roleProjection, ["employee", "manager", "hrAdministrator", "specialist"], "roleProjection");
  for (const [key, value] of Object.entries(manifest.roleProjection)) strings(value, `roleProjection.${key}`);
  exact(manifest.security, ["credentialsRecorded", "personalValuesRecorded", "screenshotsCommitted", "sourceFilesCommitted", "writeActionsExecuted", "forbiddenActions"], "security");
  for (const key of ["credentialsRecorded", "personalValuesRecorded", "screenshotsCommitted", "sourceFilesCommitted", "writeActionsExecuted"]) if (manifest.security[key] !== false) fail("GROUP_WEB_SECURITY_INVALID", key);
  for (const action of ["save", "approve", "close_period", "payroll_payment", "export_personal_data"]) if (!strings(manifest.security.forbiddenActions, "security.forbiddenActions").includes(action)) fail("GROUP_WEB_FORBIDDEN_ACTION_MISSING", action);
  strings(manifest.remainingCompatibilityGates, "remainingCompatibilityGates");
  if (manifest.productionImport !== "HOLD") fail("GROUP_WEB_PRODUCTION_IMPORT_NOT_HELD", String(manifest.productionImport));
  return {
    ok: true,
    modules: modules.total,
    navigableModules: modules.navigable,
    domains: ids.size,
    atomicActions: auth.actions.length,
    remainingCompatibilityGates: manifest.remainingCompatibilityGates.length,
    productionImport: manifest.productionImport
  };
}
