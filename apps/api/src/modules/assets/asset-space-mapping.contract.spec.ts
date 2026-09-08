import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const controller = readFileSync(resolve(process.cwd(), "src/modules/assets/assets.controller.ts"), "utf8");
const service = readFileSync(resolve(process.cwd(), "src/modules/assets/asset-space-mapping.service.ts"), "utf8");
const mappingModule = readFileSync(resolve(process.cwd(), "src/modules/assets/asset-space-mapping.module.ts"), "utf8");
const assetsModule = readFileSync(resolve(process.cwd(), "src/modules/assets/assets.module.ts"), "utf8");
const propertyOperationsModule = readFileSync(resolve(process.cwd(), "src/modules/property-operations/property-operations.module.ts"), "utf8");
const propertyOperationsController = readFileSync(resolve(process.cwd(), "src/modules/property-operations/property-operations.controller.ts"), "utf8");
const propertyOperationsService = readFileSync(resolve(process.cwd(), "src/modules/property-operations/property-operations.service.ts"), "utf8");
const propertyOperationsDto = readFileSync(resolve(process.cwd(), "src/modules/property-operations/dto/configure-property-unit.dto.ts"), "utf8");
const workOrdersService = readFileSync(resolve(process.cwd(), "src/modules/work-orders/work-orders.service.ts"), "utf8");
const mappingDto = readFileSync(resolve(process.cwd(), "src/modules/assets/dto/map-asset-space.dto.ts"), "utf8");

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

test("asset unit conversion accepts every shared operating usage type", () => {
  assert.match(mappingDto, /import \{ UNIT_USAGE_TYPES \} from "@jinhu\/shared"/u);
  assert.match(mappingDto, /@IsIn\(UNIT_USAGE_TYPES\)[\s\S]*usageType!: number/u);
});

test("mapping service is composed without creating an assets and units module cycle", () => {
  assert.match(mappingModule, /providers: \[AssetSpaceMappingService\]/u);
  assert.match(mappingModule, /exports: \[AssetSpaceMappingService\]/u);
  assert.match(assetsModule, /AssetSpaceMappingModule/u);
  assert.match(propertyOperationsModule, /AssetSpaceMappingModule/u);
  assert.doesNotMatch(propertyOperationsModule, /AssetsModule/u);
});

test("M-01 explicit operating-unit decommission and restore lifecycle is enforced", () => {
  assert.match(propertyOperationsController, /@Controller\("property\/units"\)/u);
  assert.match(propertyOperationsController, /@Put\(":unitId\/operation"\)/u);
  assert.match(propertyOperationsDto, /asset_unit_id\?: string \| null/u);
  assert.match(propertyOperationsService, /dto\.asset_unit_id !== null/u);
  assert.match(propertyOperationsService, /unlinkExistingUnit/u);
  assert.match(propertyOperationsService, /Operating unit must be disabled before unlinking the asset unit/u);
  assert.match(propertyOperationsService, /Operating unit decommission is blocked/u);
  assert.match(propertyOperationsService, /lockUnitLifecycle[\s\S]*lock_property_unit_scope/u);
  assert.match(controller, /@Post\("units\/:id\/restore"\)/u);
  assert.match(service, /lockUnitLifecycle/u);
  assert.match(workOrdersService, /async create[\s\S]*lock_property_unit_scope/u);
  assert.match(workOrdersService, /previousUnitId[\s\S]*lockedUnitIds[\s\S]*\.sort\(\)/u);
});
