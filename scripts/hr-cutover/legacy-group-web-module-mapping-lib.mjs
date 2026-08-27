export class LegacyGroupWebModuleMappingError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyGroupWebModuleMappingError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new LegacyGroupWebModuleMappingError(code, detail); };
const exact = (value, keys, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail("GROUP_WEB_MAPPING_SHAPE_INVALID", label);
};
const DOMAIN_COUNTS = Object.freeze({
  organization: 8,
  recruitment: 23,
  employee: 22,
  attendance: 29,
  compensation: 22,
  performance: 20,
  training: 31,
  enterprise_service: 29,
  data_configuration: 4,
  decision_center: 16,
  system_management: 9,
  personal_office: 18
});

export function verifyLegacyGroupWebModuleMapping(manifest) {
  exact(manifest, ["formatVersion", "contractKind", "sourceInventoryHash", "status", "items", "productionImport"], "root");
  if (manifest.formatVersion !== 1 || manifest.contractKind !== "yuzhou_hr_legacy_group_web_module_mapping" || manifest.sourceInventoryHash !== "b34ba532888fee122f93305403f8985bcb9bd1a5ccec69e8013b1d4c4f14e296" || manifest.status !== "mapped_not_implementation_complete") fail("GROUP_WEB_MAPPING_IDENTITY_INVALID", "root");
  const serialized = JSON.stringify(manifest);
  if (/(?:\/Users\/|Downloads\/|file:\/\/|(?:pass(?:word)?|token|secret)\s*[=:]|(?:^|[^0-9])(?:10\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[01])\.))/i.test(serialized)) fail("GROUP_WEB_MAPPING_SENSITIVE_CONTENT", "root");
  if (!Array.isArray(manifest.items) || manifest.items.length !== 231) fail("GROUP_WEB_MAPPING_ITEM_COUNT_INVALID", String(manifest.items?.length));
  const ids = new Set();
  const byId = new Map();
  const levels = new Map([[1, 0], [2, 0], [3, 0]]);
  const domainCounts = new Map(Object.keys(DOMAIN_COUNTS).map(domain => [domain, 0]));
  let navigable = 0;
  let tableBindings = 0;
  let viewBindings = 0;
  for (const item of manifest.items) {
    exact(item, ["legacyId", "parentId", "level", "order", "name", "legacyUrl", "legacyTable", "legacyView", "domain", "ownership", "targetRoutes", "mappingStatus"], `item.${item?.legacyId}`);
    if (!Number.isInteger(item.legacyId) || ids.has(item.legacyId) || !Number.isInteger(item.parentId) || ![1, 2, 3].includes(item.level) || !Number.isInteger(item.order) || item.order < 1 || typeof item.name !== "string" || !item.name.trim()) fail("GROUP_WEB_MAPPING_ITEM_INVALID", String(item?.legacyId));
    if (!(item.legacyUrl === null || typeof item.legacyUrl === "string") || !(item.legacyTable === null || typeof item.legacyTable === "string") || !(item.legacyView === null || typeof item.legacyView === "string")) fail("GROUP_WEB_MAPPING_SOURCE_BINDING_INVALID", String(item.legacyId));
    if (!Object.hasOwn(DOMAIN_COUNTS, item.domain) || !["hr", "platform", "cross_module"].includes(item.ownership) || !Array.isArray(item.targetRoutes) || !item.targetRoutes.length || item.targetRoutes.some(route => typeof route !== "string" || !route.startsWith("/")) || new Set(item.targetRoutes).size !== item.targetRoutes.length || item.mappingStatus !== "mapped") fail("GROUP_WEB_MAPPING_TARGET_INVALID", String(item.legacyId));
    ids.add(item.legacyId);
    byId.set(item.legacyId, item);
    levels.set(item.level, levels.get(item.level) + 1);
    domainCounts.set(item.domain, domainCounts.get(item.domain) + 1);
    if (item.legacyUrl && !/^\d+$/.test(item.legacyUrl)) navigable += 1;
    if (item.legacyTable) tableBindings += 1;
    if (item.legacyView) viewBindings += 1;
  }
  if (levels.get(1) !== 12 || levels.get(2) !== 100 || levels.get(3) !== 119 || navigable !== 186 || tableBindings !== 112 || viewBindings !== 112) fail("GROUP_WEB_MAPPING_BOUNDARY_INVALID", `${levels.get(1)}/${levels.get(2)}/${levels.get(3)}/${navigable}/${tableBindings}/${viewBindings}`);
  for (const [domain, expected] of Object.entries(DOMAIN_COUNTS)) if (domainCounts.get(domain) !== expected) fail("GROUP_WEB_MAPPING_DOMAIN_COUNT_INVALID", `${domain}:${domainCounts.get(domain)}/${expected}`);
  for (const item of manifest.items) {
    if (item.level === 1) {
      if (item.parentId !== -1) fail("GROUP_WEB_MAPPING_PARENT_INVALID", String(item.legacyId));
      continue;
    }
    const parent = byId.get(item.parentId);
    if (!parent || parent.domain !== item.domain) fail("GROUP_WEB_MAPPING_PARENT_INVALID", String(item.legacyId));
    const visited = new Set([item.legacyId]);
    let current = parent;
    while (current) {
      if (visited.has(current.legacyId)) fail("GROUP_WEB_MAPPING_CYCLE", String(item.legacyId));
      visited.add(current.legacyId);
      if (current.parentId === -1) break;
      current = byId.get(current.parentId);
      if (!current) fail("GROUP_WEB_MAPPING_PARENT_INVALID", String(item.legacyId));
    }
  }
  if (manifest.productionImport !== "HOLD") fail("GROUP_WEB_MAPPING_PRODUCTION_IMPORT_NOT_HELD", String(manifest.productionImport));
  return {
    ok: true,
    items: manifest.items.length,
    levels: { level1: levels.get(1), level2: levels.get(2), level3: levels.get(3) },
    domains: domainCounts.size,
    navigable,
    tableBindings,
    viewBindings,
    productionImport: manifest.productionImport
  };
}

export const LEGACY_GROUP_WEB_DOMAIN_COUNTS = DOMAIN_COUNTS;
