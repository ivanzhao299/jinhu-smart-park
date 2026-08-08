import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import type { TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HousingLeaseQueryDto } from "./dto/housing.dto";
import { HousingService } from "./housing.service";

const scope: TenantParkScope = { tenantId: "tenant-1", parkId: "park-1" };
const actor: JwtPrincipal = {
  sub: "user-1",
  username: "operator",
  tenantId: scope.tenantId,
  parkId: scope.parkId,
  roles: [],
  permissions: ["housing:lease:read"]
};
const lease = {
  id: "lease-1",
  leaseCode: "HL-2026-001",
  unitId: "unit-1",
  tenantPartyId: "party-1",
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  status: "active",
  paymentCycleMonths: 1,
  signatureFileId: null,
  monthlyRent: "1000.00",
  depositAmount: "2000.00"
};

test("housing lease picker query trims and bounds keyword", async () => {
  const query = plainToInstance(HousingLeaseQueryDto, {
    keyword: "  HL-2026  ",
    page: "2",
    page_size: "20"
  });
  assert.deepEqual(await validate(query), []);
  assert.equal(query.keyword, "HL-2026");
  assert.equal(query.page, 2);
  assert.equal(query.page_size, 20);
  assert.ok(
    (await validate(plainToInstance(HousingLeaseQueryDto, {
      keyword: "x".repeat(101)
    }))).some((error) => error.property === "keyword")
  );
});

test("housing lease keyword stays set-based, scoped, and constant for page sizes 1, 20, and 100", async () => {
  const queryCounts: Array<{ page: number; enrichment: number }> = [];
  for (const pageSize of [1, 20, 100]) {
    const conditions: Array<{ sql: string; parameters?: Record<string, unknown> }> = [];
    let pageQueries = 0;
    let enrichmentQueries = 0;
    const builder = {
      where: (sql: string, parameters?: Record<string, unknown>) => {
        conditions.push({ sql, parameters });
        return builder;
      },
      andWhere: (sql: string, parameters?: Record<string, unknown>) => {
        conditions.push({ sql, parameters });
        return builder;
      },
      orderBy: () => builder,
      addOrderBy: () => builder,
      skip: () => builder,
      take: () => builder,
      getManyAndCount: async () => {
        pageQueries += 1;
        return [[lease], 37];
      }
    };
    const service = new HousingService(
      { createQueryBuilder: () => builder } as never,
      {} as never,
      {} as never,
      {} as never,
      { allowedUnitIds: async () => ["unit-1"] } as never,
      {} as never,
      {
        query: async (sql: string, parameters: unknown[]) => {
          enrichmentQueries += 1;
          assert.match(sql, /lease\.tenant_id = \$1/u);
          assert.deepEqual(parameters, [scope.tenantId, scope.parkId, [lease.id]]);
          return [{
            id: lease.id,
            unitCode: "A-101",
            unitName: "101",
            tenantDisplayName: "张三"
          }];
        }
      } as never,
      {} as never
    );

    const result = await service.listLeases(
      scope,
      actor,
      { keyword: "张三", page: 7, page_size: pageSize }
    );
    const keyword = conditions.find((condition) =>
      condition.sql.includes("lease.lease_code ILIKE")
    );

    assert.ok(keyword);
    assert.equal(keyword.parameters?.leaseKeyword, "%张三%");
    assert.match(keyword.sql, /keyword_unit\.tenant_id = lease\.tenant_id/u);
    assert.match(keyword.sql, /keyword_unit\.park_id = lease\.park_id/u);
    assert.match(keyword.sql, /keyword_unit\.unit_code ILIKE/u);
    assert.match(keyword.sql, /keyword_unit\.unit_name ILIKE/u);
    assert.match(keyword.sql, /keyword_party\.tenant_id = lease\.tenant_id/u);
    assert.match(keyword.sql, /keyword_party\.park_id = lease\.park_id/u);
    assert.match(keyword.sql, /keyword_party\.display_name ILIKE/u);
    assert.ok(conditions.some((condition) =>
      condition.sql === "lease.unit_id IN (:...unitIds)"
    ));
    assert.equal(result.total, 37);
    assert.deepEqual(result.items[0], {
      id: lease.id,
      leaseCode: lease.leaseCode,
      unitId: lease.unitId,
      tenantPartyId: lease.tenantPartyId,
      startDate: lease.startDate,
      endDate: lease.endDate,
      status: lease.status,
      paymentCycleMonths: lease.paymentCycleMonths,
      unitCode: "A-101",
      unitName: "101",
      tenantDisplayName: "张三"
    });
    assert.equal("monthlyRent" in result.items[0]!, false);
    assert.equal("depositAmount" in result.items[0]!, false);
    queryCounts.push({ page: pageQueries, enrichment: enrichmentQueries });
  }
  assert.deepEqual(queryCounts, [
    { page: 1, enrichment: 1 },
    { page: 1, enrichment: 1 },
    { page: 1, enrichment: 1 }
  ]);
});

test("housing lease empty page retains total and skips enrichment without leaking cross scope", async () => {
  let enrichmentQueries = 0;
  const builder = {
    where: () => builder,
    andWhere: () => builder,
    orderBy: () => builder,
    addOrderBy: () => builder,
    skip: () => builder,
    take: () => builder,
    getManyAndCount: async () => [[], 41]
  };
  const service = new HousingService(
    { createQueryBuilder: () => builder } as never,
    {} as never,
    {} as never,
    {} as never,
    { allowedUnitIds: async () => ["allowed-unit"] } as never,
    {} as never,
    {
      query: async () => {
        enrichmentQueries += 1;
        return [];
      }
    } as never,
    {} as never
  );

  assert.deepEqual(
    await service.listLeases(
      scope,
      actor,
      { keyword: "outside-scope", page: 99, page_size: 20 }
    ),
    { items: [], total: 41, page: 99, page_size: 20 }
  );
  assert.equal(enrichmentQueries, 0);
});
