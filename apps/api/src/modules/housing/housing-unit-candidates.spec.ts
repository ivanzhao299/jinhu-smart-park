import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { MODULES_KEY } from "../../shared/decorators/modules.decorator";
import { ANY_PERMISSIONS_KEY } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HousingController } from "./housing.controller";
import { HousingUnitCandidateQueryDto } from "./dto/housing.dto";
import { HousingService } from "./housing.service";

const scope: TenantParkScope = { tenantId: "tenant-1", parkId: "park-1" };
const actor: JwtPrincipal = {
  sub: "user-1",
  username: "operator",
  tenantId: scope.tenantId,
  parkId: scope.parkId,
  roles: [],
  permissions: [SYSTEM_PERMISSIONS.HOUSING_LEASE_CREATE]
};

function serviceWith(
  allowedUnitIds: string[] | null,
  query: (sql: string, parameters: unknown[]) => Promise<unknown[]>
) {
  return new HousingService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { allowedUnitIds: async () => allowedUnitIds } as never,
    {} as never,
    { query } as never,
    {} as never
  );
}

test("housing unit candidate query trims and bounds server search", async () => {
  const query = plainToInstance(HousingUnitCandidateQueryDto, {
    keyword: "  A-101  ",
    page: "2",
    page_size: "100"
  });
  assert.deepEqual(await validate(query), []);
  assert.equal(query.keyword, "A-101");
  assert.equal(query.page, 2);
  assert.equal(query.page_size, 100);
  assert.ok(
    (await validate(plainToInstance(HousingUnitCandidateQueryDto, {
      keyword: "x".repeat(101)
    }))).some((error) => error.property === "keyword")
  );
});

test("housing unit candidate controller requires a housing action and both modules", () => {
  const handler = HousingController.prototype.listUnitCandidates;
  assert.deepEqual(Reflect.getMetadata(ANY_PERMISSIONS_KEY, handler), [
    SYSTEM_PERMISSIONS.HOUSING_LEASE_CREATE,
    SYSTEM_PERMISSIONS.HOUSING_PURCHASE_MANAGE
  ]);
  assert.deepEqual(Reflect.getMetadata(MODULES_KEY, handler), [
    "housing_rental",
    "asset"
  ]);
  assert.equal(Reflect.getMetadata(METHOD_METADATA, handler), 0);
  assert.equal(Reflect.getMetadata(PATH_METADATA, handler), "unit-candidates");
});

test("housing unit candidates use authoritative biz_unit IDs with constant scoped queries", async () => {
  for (const pageSize of [1, 20, 100]) {
    const statements: Array<{ sql: string; parameters: unknown[] }> = [];
    const service = serviceWith(["unit-1"], async (sql, parameters) => {
      statements.push({ sql, parameters });
      if (sql.includes("count(*)::int AS total")) return [{ total: 37 }];
      return [{
        id: "unit-1",
        unitCode: "A-101",
        unitName: "101",
        assetUnitId: "must-not-return"
      }];
    });

    const result = await service.listUnitCandidates(
      scope,
      actor,
      { keyword: "A-101", page: 7, page_size: pageSize }
    );

    assert.equal(statements.length, 2);
    for (const statement of statements) {
      assert.match(statement.sql, /FROM biz_unit unit/u);
      assert.doesNotMatch(statement.sql, /FROM asset_unit/u);
      assert.match(statement.sql, /unit\.tenant_id=\$1/u);
      assert.match(statement.sql, /unit\.park_id=\$2/u);
      assert.match(statement.sql, /unit\.id=ANY\(\$3::uuid\[\]\)/u);
      assert.match(statement.sql, /unit\.unit_code ILIKE \$4/u);
      assert.match(statement.sql, /unit\.unit_name ILIKE \$4/u);
    }
    assert.deepEqual(statements[1]!.parameters, [
      scope.tenantId,
      scope.parkId,
      ["unit-1"],
      "%A-101%"
    ]);
    assert.deepEqual(statements[0]!.parameters, [
      scope.tenantId,
      scope.parkId,
      ["unit-1"],
      "%A-101%",
      pageSize,
      6 * pageSize
    ]);
    assert.deepEqual(result, {
      items: [{ id: "unit-1", unitCode: "A-101", unitName: "101" }],
      total: 37,
      page: 7,
      page_size: pageSize
    });
  }
});

test("housing unit candidate empty scope and empty page remain server-authoritative", async () => {
  let queryCalls = 0;
  const emptyScopeService = serviceWith([], async () => {
    queryCalls += 1;
    return [];
  });
  assert.deepEqual(
    await emptyScopeService.listUnitCandidates(
      scope,
      actor,
      { page: 1, page_size: 20 }
    ),
    { items: [], total: 0, page: 1, page_size: 20 }
  );
  assert.equal(queryCalls, 0);

  const emptyPageService = serviceWith(null, async (sql) =>
    sql.includes("count(*)::int AS total") ? [{ total: 41 }] : []
  );
  assert.deepEqual(
    await emptyPageService.listUnitCandidates(
      scope,
      actor,
      { page: 99, page_size: 20 }
    ),
    { items: [], total: 41, page: 99, page_size: 20 }
  );
});
