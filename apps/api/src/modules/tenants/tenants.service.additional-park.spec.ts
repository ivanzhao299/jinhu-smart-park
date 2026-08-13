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
  assert.match(block, /upsertTenantModules\(/);
  assert.match(block, /ensureAssetScopeProvisioning\(manager, targetScope, moduleCodes/);
  assert.match(block, /createTenantAdminRole\(manager, tenant, parkId/);
  assert.match(block, /ensureTenantParkPermissions\(manager, sourceScope, targetScope/);
  assert.match(block, /passwordHash: sourceUser\.passwordHash/);
  assert.match(block, /bindAdditionalTenantAdmin\(manager, tenant, parkId/);
  assert.doesNotMatch(block, /dto\.parkId|dto\.tenantId/);
});

test("park scope identities are globally unique and fail closed on historical duplicates", () => {
  const entity = readFileSync(resolve(__dirname, "../parks/entities/park.entity.ts"), "utf8");
  const migration = readFileSync(
    resolve(__dirname, "../../../../../database/migrations/000208_biz_park_scope_identity.sql"),
    "utf8"
  );
  assert.match(entity, /uq_biz_park_entity_park_id_active[\s\S]*unique: true[\s\S]*is_deleted = false/);
  assert.match(migration, /GROUP BY park_id[\s\S]*HAVING COUNT\(\*\) > 1/);
  assert.match(migration, /CREATE UNIQUE INDEX uq_biz_park_park_id_active[\s\S]*WHERE is_deleted = false/);
});

test("additional park access creates a separate default identity context", () => {
  const source = readFileSync(resolve(__dirname, "tenants.service.ts"), "utf8");
  const block = source.slice(
    source.indexOf("private async bindAdditionalTenantAdmin("),
    source.indexOf("private async ensureTenantPermissions(")
  );
  assert.match(block, /UserRoleEntity/);
  assert.match(block, /UserParkEntity[\s\S]*isDefault: true/);
  assert.match(block, /UserOrgEntity[\s\S]*isPrimary: true/);
});

test("park management widens only for tenant administrators", () => {
  const source = readFileSync(resolve(__dirname, "../parks/parks.service.ts"), "utf8");
  assert.match(source, /private canManageTenantParks[\s\S]*actor\.roles\.includes\("TENANT_ADMIN"\)/);
  assert.match(source, /if \(!actor \|\| !this\.canManageTenantParks\(actor\)\) \{\s*builder\.andWhere\("park\.park_id = :parkId"/);
  assert.equal((source.match(/if \(!actor \|\| !this\.canManageTenantParks\(actor\)\) await this\.applyParkDataScope/g) ?? []).length, 2);
});
