import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const controller = readFileSync(resolve(process.cwd(), "src/modules/assets/assets.controller.ts"), "utf8");
const service = readFileSync(resolve(process.cwd(), "src/modules/assets/asset-space-mapping.service.ts"), "utf8");
const mappingModule = readFileSync(resolve(process.cwd(), "src/modules/assets/asset-space-mapping.module.ts"), "utf8");
const assetsModule = readFileSync(resolve(process.cwd(), "src/modules/assets/assets.module.ts"), "utf8");
const propertyOperationsModule = readFileSync(resolve(process.cwd(), "src/modules/property-operations/property-operations.module.ts"), "utf8");

test("mapping endpoints retain granular permissions and true HTTP idempotency", () => {
  for (const path of ["buildings/:id/operating-building", "floors/:id/operating-floor", "units/:id/operating-unit"]) {
    assert.match(controller, new RegExp(`@Post\\(\\"${path}\\"\\)[\\s\\S]{0,100}@UseInterceptors\\(new IdempotencyInterceptor\\(\\)\\)`));
  }
  assert.match(controller, /ASSET_BUILDING_CREATE/u);
  assert.match(controller, /ASSET_FLOOR_CREATE/u);
  assert.match(controller, /ASSET_UNIT_CREATE/u);
  assert.match(controller, /@Get\("operating-space-candidates"\)[\s\S]{0,100}ASSET_UNIT_LIST/u);
});

test("mapping service locks source assets and revalidates the complete unit parent chain", () => {
  assert.match(service, /pg_advisory_xact_lock/u);
  assert.match(service, /FOR UPDATE OF source/u);
  assert.match(service, /building\.asset_building_id=source\.building_id/u);
  assert.match(service, /floor\.asset_floor_id=source\.floor_id/u);
  assert.match(service, /Map the asset building and floor before creating an operating unit/u);
});

test("mapping service preserves source decimal strings and writes immutable audit evidence", () => {
  assert.match(service, /source\.building_area/u);
  assert.match(service, /source\.rentable_area/u);
  assert.match(service, /biz_asset_space_mapping_audit/u);
  assert.match(service, /Idempotency key belongs to another asset mapping/u);
  assert.match(service, /already mapped to an operating unit/u);
});

test("mapping service is composed without creating an assets and units module cycle", () => {
  assert.match(mappingModule, /providers: \[AssetSpaceMappingService\]/u);
  assert.match(mappingModule, /exports: \[AssetSpaceMappingService\]/u);
  assert.match(assetsModule, /AssetSpaceMappingModule/u);
  assert.match(propertyOperationsModule, /AssetSpaceMappingModule/u);
  assert.doesNotMatch(propertyOperationsModule, /AssetsModule/u);
});
