import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { ParseUUIDPipe } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA, ROUTE_ARGS_METADATA } from "@nestjs/common/constants";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import {
  ANY_PERMISSIONS_KEY,
  PERMISSIONS_KEY
} from "../../shared/decorators/permissions.decorator";
import { MODULES_KEY } from "../../shared/decorators/modules.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HousingController } from "./housing.controller";
import { HousingEnergyMeterCandidateQueryDto } from "./dto/housing.dto";
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
const lease = { id: "00000000-0000-4000-8000-000000000010", unitId: "unit-1" };

function serviceWith(
  query: (sql: string, parameters: unknown[]) => Promise<unknown[]>,
  assertAccess: (unitId: string) => Promise<void> = async () => undefined
) {
  const manager = {
    getRepository: () => ({
      findOne: async ({ where }: { where: Record<string, unknown> }) => {
        assert.deepEqual(where, {
          id: lease.id,
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          isDeleted: false
        });
        return lease;
      }
    })
  };
  return new HousingService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      assertAccess: async (
        actualScope: TenantParkScope,
        actualActor: JwtPrincipal,
        unitId: string
      ) => {
        assert.deepEqual(actualScope, scope);
        assert.equal(actualActor, actor);
        await assertAccess(unitId);
      }
    } as never,
    {} as never,
    { manager, query } as never,
    {} as never
  );
}

test("housing energy meter candidate query trims and bounds server search", async () => {
  const query = plainToInstance(HousingEnergyMeterCandidateQueryDto, {
    keyword: "  MTR-01  ",
    page: "2",
    page_size: "100"
  });
  assert.deepEqual(await validate(query), []);
  assert.equal(query.keyword, "MTR-01");
  assert.equal(query.page, 2);
  assert.equal(query.page_size, 100);
  assert.ok(
    (await validate(plainToInstance(HousingEnergyMeterCandidateQueryDto, {
      keyword: "x".repeat(101)
    }))).some((error) => error.property === "keyword")
  );
  assert.ok(
    (await validate(plainToInstance(HousingEnergyMeterCandidateQueryDto, {
      page_size: 101
    }))).some((error) => error.property === "page_size")
  );
});

test("housing energy meter candidate controller is lease-scoped for billing and handover", async () => {
  const handler = HousingController.prototype.listEnergyMeterCandidates;
  assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY, handler), [
    SYSTEM_PERMISSIONS.ENERGY_METER_READ
  ]);
  assert.deepEqual(Reflect.getMetadata(ANY_PERMISSIONS_KEY, handler), [
    SYSTEM_PERMISSIONS.HOUSING_LEASE_CREATE,
    SYSTEM_PERMISSIONS.HOUSING_HANDOVER_MANAGE,
    SYSTEM_PERMISSIONS.HOUSING_BILLING_GENERATE
  ]);
  assert.deepEqual(Reflect.getMetadata(MODULES_KEY, handler), [
    "housing_rental",
    "asset",
    "energy"
  ]);
  assert.equal(Reflect.getMetadata(METHOD_METADATA, handler), 0);
  assert.equal(
    Reflect.getMetadata(PATH_METADATA, handler),
    "leases/:id/energy-meter-candidates"
  );
  const args = Reflect.getMetadata(
    ROUTE_ARGS_METADATA,
    HousingController,
    "listEnergyMeterCandidates"
  ) as Record<string, { pipes?: unknown[] }>;
  assert.ok(
    Object.values(args)
      .flatMap((argument) => argument.pipes ?? [])
      .some((candidate) => candidate instanceof ParseUUIDPipe)
  );
});

test("housing energy meter candidates stay scoped, minimal, and constant for page sizes 1, 20, and 100", async () => {
  for (const pageSize of [1, 20, 100]) {
    const statements: Array<{ sql: string; parameters: unknown[] }> = [];
    let accessCalls = 0;
    const service = serviceWith(async (sql, parameters) => {
      statements.push({ sql, parameters });
      if (sql.includes("count(*)::int AS total")) return [{ total: 37 }];
      return [{
        id: "meter-1",
        meterCode: "MTR-01",
        meterName: "101 电表",
        meterType: "ELECTRIC",
        unit: "kWh",
        multiplier: "1.500000",
        currentReading: "sensitive-not-returned"
      }];
    }, async (unitId) => {
      accessCalls += 1;
      assert.equal(unitId, lease.unitId);
    });

    const result = await service.listEnergyMeterCandidates(
      scope,
      actor,
      lease.id,
      { keyword: "电表", page: 7, page_size: pageSize }
    );

    assert.equal(accessCalls, 1);
    assert.equal(statements.length, 2);
    for (const statement of statements) {
      assert.match(statement.sql, /meter\.tenant_id=\$1/u);
      assert.match(statement.sql, /meter\.park_id=\$2/u);
      assert.match(statement.sql, /meter\.room_id=\$3/u);
      assert.match(statement.sql, /meter\.is_deleted=false/u);
      assert.match(statement.sql, /meter\.is_enabled=true/u);
      assert.match(statement.sql, /meter\.status='ONLINE'/u);
      assert.match(statement.sql, /meter\.meter_code ILIKE \$4/u);
      assert.match(statement.sql, /meter\.meter_name ILIKE \$4/u);
    }
    assert.deepEqual(statements[1]!.parameters, [
      scope.tenantId,
      scope.parkId,
      lease.unitId,
      "%电表%"
    ]);
    assert.deepEqual(statements[0]!.parameters, [
      scope.tenantId,
      scope.parkId,
      lease.unitId,
      "%电表%",
      pageSize,
      6 * pageSize
    ]);
    assert.deepEqual(result, {
      items: [{
        id: "meter-1",
        meterCode: "MTR-01",
        meterName: "101 电表",
        meterType: "ELECTRIC",
        unit: "kWh",
        multiplier: "1.500000"
      }],
      total: 37,
      page: 7,
      page_size: pageSize
    });
  }
});

test("housing energy meter empty page retains server total", async () => {
  const service = serviceWith(async (sql) =>
    sql.includes("count(*)::int AS total") ? [{ total: 41 }] : []
  );
  assert.deepEqual(
    await service.listEnergyMeterCandidates(
      scope,
      actor,
      lease.id,
      { page: 99, page_size: 20 }
    ),
    { items: [], total: 41, page: 99, page_size: 20 }
  );
});
