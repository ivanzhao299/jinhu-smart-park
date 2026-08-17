import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("additional park provisioning creates an independent, atomic tenant scope", () => {
  const source = readFileSync(resolve(__dirname, "tenants.service.ts"), "utf8");
  const block = source.slice(
    source.indexOf("async provisionAdditionalPark("),
    source.indexOf("async update(", source.indexOf("async provisionAdditionalPark("))
  );

  assert.match(block, /generateParkScopeId\(parkRepository\)/);
  assert.match(block, /lockAssetScope\(manager, targetScope\)/);
  assert.match(block, /tenantId: sourceScope\.tenantId,[\s\S]*parkId,/);
  assert.match(block, /createRootOrg\(manager, tenant, parkId/);
  assert.match(block, /where: \{ tenantId: sourceScope\.tenantId, parkId: sourceScope\.parkId/);
  assert.match(block, /cloneTenantParkModules\(manager, tenant, parkId, sourceAssignments, modules/);
  assert.match(block, /ensureAssetScopeProvisioning\(manager, targetScope, moduleCodes/);
  assert.match(block, /ensureTenantPermissions\(manager, sourceScope, targetScope/);
  assert.match(block, /getOrCreateTenantAdminRole\(manager, tenant, parkId/);
  assert.doesNotMatch(block, /passwordHash: sourceUser\.passwordHash/);
  assert.match(block, /bindAdditionalTenantAdmin\(manager, tenant, parkId/);
  assert.doesNotMatch(block, /dto\.parkId|dto\.tenantId/);
});

test("new tenant and additional park provisioning copy dictionary baselines", () => {
  const source = readFileSync(resolve(__dirname, "tenants.service.ts"), "utf8");
  const createBlock = source.slice(
    source.indexOf("async create(actorScope:"),
    source.indexOf("async provisionAdditionalPark(")
  );
  const additionalParkBlock = source.slice(
    source.indexOf("async provisionAdditionalPark("),
    source.indexOf("async update(", source.indexOf("async provisionAdditionalPark("))
  );
  const helperBlock = source.slice(
    source.indexOf("private async ensureTenantDictionaries("),
    source.indexOf("private async cloneTenantParkModules(")
  );
  const migration = readFileSync(
    resolve(__dirname, "../../../../../database/migrations/000214_tenant_scope_dictionary_provisioning.sql"),
    "utf8"
  );
  const productionSeed = readFileSync(
    resolve(__dirname, "../../../../../database/seeds/production/000016_tenant_scope_dictionary_reconcile.sql"),
    "utf8"
  );

  assert.match(createBlock, /ensureTenantDictionaries\(manager, actorScope, \{ tenantId, parkId: park\.parkId \}/);
  assert.match(additionalParkBlock, /ensureTenantDictionaries\(manager, sourceScope, targetScope/);
  assert.match(helperBlock, /DEFAULT_PLATFORM_SCOPE\.tenantId/);
  assert.match(helperBlock, /sourceScopes = \[/);
  assert.match(helperBlock, /copyMissingTenantDictionaries\(manager, source, targetScope, actorId\)/);
  assert.match(helperBlock, /INSERT INTO sys_dict_type/);
  assert.match(helperBlock, /INSERT INTO sys_dict_item/);
  assert.match(helperBlock, /PARTITION BY source_type\.dict_code, source_item\.item_value/);
  assert.match(migration, /target_scopes AS/);
  assert.match(migration, /FROM biz_park park/);
  assert.match(migration, /INSERT INTO sys_dict_type/);
  assert.match(migration, /INSERT INTO sys_dict_item/);
  assert.match(migration, /NOT EXISTS/);
  assert.match(productionSeed, /FROM biz_park park/);
  assert.match(productionSeed, /INSERT INTO sys_dict_type/);
  assert.match(productionSeed, /INSERT INTO sys_dict_item/);
  assert.match(productionSeed, /NOT EXISTS/);
});

test("park scope allocation serializes globally without forbidding canonical source history", () => {
  const service = readFileSync(resolve(__dirname, "tenants.service.ts"), "utf8");
  const entity = readFileSync(resolve(__dirname, "../parks/entities/park.entity.ts"), "utf8");
  const migration = readFileSync(
    resolve(__dirname, "../../../../../database/migrations/000210_biz_park_scope_identity.sql"),
    "utf8"
  );
  assert.match(service, /pg_advisory_xact_lock[\s\S]*biz-park-scope-id-allocation[\s\S]*generateParkScopeId/);
  assert.doesNotMatch(entity, /uq_biz_park_entity_park_id_active/);
  assert.match(migration, /DROP INDEX IF EXISTS uq_biz_park_park_id_active/);
});

test("additional parks preserve each source module authorization window", () => {
  const source = readFileSync(resolve(__dirname, "tenants.service.ts"), "utf8");
  const block = source.slice(
    source.indexOf("private async cloneTenantParkModules("),
    source.indexOf("private async createTenantAdminRole(")
  );
  assert.match(block, /startTime: source\.startTime/);
  assert.match(block, /expireTime: source\.expireTime/);
  assert.match(block, /enabled: source\.enabled/);
  assert.match(block, /status: source\.status/);
  assert.match(block, /featureConfig: \{ \.\.\.\(source\.featureConfig \?\? \{\}\) \}/);
  assert.doesNotMatch(block, /tenant\.expireTime|new Date\(\)/);
});

test("additional park access keeps one login identity and adds scoped secondary relations", () => {
  const source = readFileSync(resolve(__dirname, "tenants.service.ts"), "utf8");
  const block = source.slice(
    source.indexOf("private async bindAdditionalTenantAdmin("),
    source.indexOf("private async ensureTenantPermissions(")
  );
  assert.match(block, /UserRoleEntity/);
  assert.match(block, /UserParkEntity[\s\S]*isDefault: false/);
  assert.match(block, /UserOrgEntity[\s\S]*isPrimary: true/);
});

test("additional parks start active so asset authorization has a complete provisioning path", () => {
  const source = readFileSync(resolve(__dirname, "tenants.service.ts"), "utf8");
  const block = source.slice(
    source.indexOf("async provisionAdditionalPark("),
    source.indexOf("async update(", source.indexOf("async provisionAdditionalPark("))
  );
  assert.match(block, /\(dto\.status \?\? 1\) !== 1/);
  assert.match(block, /Additional park must be active when created/);
  assert.match(block, /ensureAssetScopeProvisioning\(manager, targetScope, moduleCodes/);
});

test("park management widens only for tenant administrators", () => {
  const source = readFileSync(resolve(__dirname, "../parks/parks.service.ts"), "utf8");
  assert.match(source, /private canManageTenantParks[\s\S]*actor\.roles\.includes\("TENANT_ADMIN"\)/);
  assert.match(source, /if \(!actor \|\| !this\.canManageTenantParks\(actor\)\) \{\s*builder\.andWhere\("park\.park_id = :parkId"/);
  assert.equal((source.match(/if \(!actor \|\| !this\.canManageTenantParks\(actor\)\) await this\.applyParkDataScope/g) ?? []).length, 2);
});
