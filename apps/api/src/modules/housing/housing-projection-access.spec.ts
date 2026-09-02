import assert from "node:assert/strict";
import test from "node:test";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { FileEntity } from "../files/entities/file.entity";
import { PartyEntity } from "../property-operations/entities/party.entity";
import { WorkOrderEntity } from "../work-orders/entities/work-order.entity";
import {
  HousingChargePlanEntity,
  HousingHandoverEntity,
  HousingLeaseOccupantEntity,
  HousingLedgerEntryEntity,
  HousingPurchaseItemEntity,
  HousingReceivableEntity
} from "./entities/housing.entities";
import { HousingPurchaseService } from "./housing-purchase.service";
import { HousingTransactionSupportService } from "./housing-transaction-support.service";
import { HousingTenantService } from "./housing-tenant.service";
import { HousingLeaseQueryService } from "./housing-lease-query.service";

const scope: TenantParkScope = { tenantId: "tenant-1", parkId: "park-1" };
const actor: JwtPrincipal = {
  sub: "00000000-0000-4000-8000-000000000001",
  username: "operator",
  tenantId: scope.tenantId,
  parkId: scope.parkId,
  roles: [],
  permissions: []
};

const purchase = {
  id: "00000000-0000-4000-8000-000000000010",
  purchaseCode: "HP-1",
  unitId: "00000000-0000-4000-8000-000000000020",
  vendorName: "Vendor",
  purchaseDate: "2026-07-31",
  costCategory: "repair",
  approvalStatus: "draft",
  paymentStatus: "unpaid",
  totalAmount: "123.45"
};

const purchaseItem = {
  id: "00000000-0000-4000-8000-000000000030",
  itemName: "Valve",
  quantity: "2.000",
  unit: "piece",
  unitPrice: "12.34",
  amount: "24.68",
  transferredReceivableId: null
};

function purchaseService(
  receiptFiles: unknown[] = [],
  purchaseRecord: typeof purchase | (Omit<typeof purchase, "unitId"> & { unitId: null }) = purchase,
  queries: string[] = []
) {
  const builder = {
    where: () => builder,
    andWhere: () => builder,
    orderBy: () => builder,
    addOrderBy: () => builder,
    skip: () => builder,
    take: () => builder,
    getManyAndCount: async () => [[purchaseRecord], 1]
  };
  const purchasesRepository = {
    createQueryBuilder: () => builder,
    findOne: async () => purchaseRecord
  };
  const dataSource = {
    query: async (sql: string) => {
      queries.push(sql);
      return sql.includes("FROM biz_unit unit")
        ? [{ id: purchaseRecord.unitId, unitCode: "U-020", unitName: "人才公寓 020" }]
        : [];
    },
    getRepository: (entity: unknown) => {
      if (entity === HousingPurchaseItemEntity) {
        return { find: async () => [purchaseItem] };
      }
      if (entity === FileEntity) {
        return { find: async () => receiptFiles };
      }
      return { find: async () => [] };
    }
  };
  return new HousingPurchaseService(
    purchasesRepository as never,
    {
      allowedUnitIds: async () => null,
      assertAccess: async () => ({ id: purchaseRecord.unitId })
    } as never,
    dataSource as never,
    new HousingTransactionSupportService()
  );
}

function leaseService() {
  const calls = new Map<string, number>();
  const pendingFilePredicates: string[] = [];
  const pendingFileBindings: Array<Record<string, unknown> | undefined> = [];
  const record = (name: string) => calls.set(name, (calls.get(name) ?? 0) + 1);
  const lease = {
    id: "00000000-0000-4000-8000-000000000100",
    leaseCode: "HL-1",
    unitId: "00000000-0000-4000-8000-000000000020",
    tenantPartyId: "00000000-0000-4000-8000-000000000110",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    status: "active",
    paymentCycleMonths: 1,
    signatureFileId: null,
    monthlyRent: "1000",
    depositAmount: "500"
  };
  const tenant = {
    id: lease.tenantPartyId,
    displayName: "Tenant",
    identityNumberMasked: "320***********1234",
    verificationStatus: "verified",
    mobile: "13812345678",
    email: "tenant@example.com"
  };
  const fixtures = new Map<unknown, { name: string; rows: unknown[] }>([
    [PartyEntity, { name: "party", rows: [tenant] }],
    [HousingLeaseOccupantEntity, { name: "occupants", rows: [] }],
    [HousingChargePlanEntity, { name: "chargePlans", rows: [{
      id: "plan-1", leaseId: lease.id, chargeType: "rent", billingSource: "fixed",
      cycleMonths: 1, amount: "1000", unitPrice: null, meterId: null, enabled: true
    }] }],
    [HousingReceivableEntity, { name: "receivables", rows: [{
      id: "receivable-1", leaseId: lease.id, chargeType: "rent",
      periodStart: "2026-01-01", periodEnd: "2026-02-01", dueDate: "2026-01-05",
      amount: "1000", paidAmount: "200", waivedAmount: "0", status: "partial"
    }] }],
    [HousingLedgerEntryEntity, { name: "ledger", rows: [{
      id: "ledger-1", leaseId: lease.id, receivableId: "receivable-1",
      entryType: "payment", chargeType: "rent", amount: "200", paymentMethod: "cash",
      status: "confirmed", reason: "payment", occurredAt: new Date("2026-01-05T00:00:00Z")
    }] }],
    [HousingHandoverEntity, { name: "handovers", rows: [{
      id: "handover-1", leaseId: lease.id, handoverType: "move_in", status: "completed",
      handoverAt: new Date("2026-01-01T00:00:00Z"), meterReadings: [],
      itemSnapshot: [], credentials: [], photoFileIds: [], remark: null,
      damageAmount: "0", unsettledAmount: "0", depositDeductionAmount: "0"
    }] }],
    [WorkOrderEntity, { name: "repairs", rows: [{
      id: "repair-1", woCode: "WO-1", title: "Repair", priority: "medium",
      urgency: "normal", status: "20", assigneeName: null, assigneeId: actor.sub,
      reporterId: null, createBy: actor.sub, overdueFlag: false,
      createTime: new Date("2026-01-02T00:00:00Z")
    }] }]
  ]);
  const dataSource = {
    manager: {
      query: async () => [{
        id: lease.id,
        unitStatus: 1,
        operatingMode: "long_rent",
        operatingStatus: "enabled",
        conflict: false
      }],
      getRepository: () => ({
        findOne: async () => {
          record("lease");
          return lease;
        }
      })
    },
    getRepository: (entity: unknown) => {
      const fixture = fixtures.get(entity);
      const pendingFilesBuilder = {
        where: (sql: string) => {
          pendingFilePredicates.push(sql);
          return pendingFilesBuilder;
        },
        andWhere: (sql: string, parameters?: Record<string, unknown>) => {
          pendingFilePredicates.push(sql);
          pendingFileBindings.push(parameters);
          return pendingFilesBuilder;
        },
        orderBy: () => pendingFilesBuilder,
        getMany: async () => []
      };
      return {
        findOne: async () => {
          if (!fixture) return null;
          record(fixture.name);
          return fixture.rows[0] ?? null;
        },
        find: async () => {
          if (!fixture) return [];
          record(fixture.name);
          return fixture.rows;
        },
        createQueryBuilder: () => pendingFilesBuilder
      };
    }
  };
  const service = new HousingLeaseQueryService(
    {} as never,
    dataSource as never,
    { assertAccess: async () => ({ id: lease.unitId }) } as never,
    {
      buildScopeFilter: async () => ({
        unrestricted: true,
        allowed_ids: [],
        scope_types: []
      })
    } as never,
    new HousingTenantService({} as never, {} as never)
  );
  return { service, calls, lease, pendingFilePredicates, pendingFileBindings };
}

test("purchase manage/transfer-only list and detail omit every money field", async () => {
  for (const permission of [
    SYSTEM_PERMISSIONS.HOUSING_PURCHASE_MANAGE,
    SYSTEM_PERMISSIONS.HOUSING_PURCHASE_TRANSFER
  ]) {
    const principal = { ...actor, permissions: [permission] };
    const service = purchaseService();
    const list = await service.listPurchases(scope, principal, {
      page: 1,
      page_size: 20
    });
    const detail = await service.getPurchase(scope, principal, purchase.id);

    assert.equal("totalAmount" in list.items[0]!, false);
    assert.equal("totalAmount" in detail.purchase, false);
    assert.equal("unitPrice" in detail.items[0]!, false);
    assert.equal("amount" in detail.items[0]!, false);
    assert.deepEqual(Object.keys(list.items[0]!).sort(), [
      "approvalStatus", "costCategory", "id", "paymentStatus", "purchaseCode",
      "purchaseDate", "transferredItemCount", "unitCode", "unitId", "unitName", "vendorName"
    ]);
    assert.deepEqual(Object.keys(detail.items[0]!).sort(), [
      "id", "itemName", "quantity", "transferredReceivableId", "unit"
    ]);
  }
});

test("purchase read list and detail expose formatted decimal strings with strict keys", async () => {
  const queries: string[] = [];
  const service = purchaseService([], purchase, queries);
  const principal = {
    ...actor,
    permissions: [SYSTEM_PERMISSIONS.HOUSING_PURCHASE_READ]
  };
  const list = await service.listPurchases(scope, principal, {
    page: 1,
    page_size: 20
  });
  const detail = await service.getPurchase(scope, principal, purchase.id);

  assert.equal(list.items[0]?.totalAmount, "123.45");
  assert.equal(detail.purchase.totalAmount, "123.45");
  assert.equal(list.items[0]?.unitCode, "U-020");
  assert.equal(list.items[0]?.unitName, "人才公寓 020");
  assert.equal(detail.purchase.unitCode, "U-020");
  assert.equal(detail.purchase.unitName, "人才公寓 020");
  const unitQuery = queries.find((sql) => sql.includes("FROM biz_unit unit"));
  assert.match(unitQuery ?? "", /unit\.tenant_id = \$1/u);
  assert.match(unitQuery ?? "", /unit\.park_id = \$2/u);
  assert.match(unitQuery ?? "", /unit\.is_deleted = false/u);
  assert.equal(detail.items[0]?.unitPrice, "12.34");
  assert.equal(detail.items[0]?.amount, "24.68");
  assert.deepEqual(Object.keys(detail.items[0]!).sort(), [
    "amount", "id", "itemName", "quantity",
    "transferredReceivableId", "unit", "unitPrice"
  ]);
});

test("project-wide purchases keep nullable unit names and never synthesize an ID label", async () => {
  const unlinkedPurchase = { ...purchase, unitId: null };
  const service = purchaseService([], unlinkedPurchase);
  const principal = {
    ...actor,
    permissions: [SYSTEM_PERMISSIONS.HOUSING_PURCHASE_READ]
  };
  const list = await service.listPurchases(scope, principal, { page: 1, page_size: 20 });
  const detail = await service.getPurchase(scope, principal, purchase.id);
  assert.equal(list.items[0]?.unitId, null);
  assert.equal(list.items[0]?.unitCode, null);
  assert.equal(list.items[0]?.unitName, null);
  assert.equal(detail.purchase.unitCode, null);
  assert.equal(detail.purchase.unitName, null);
});

test("purchase receipt metadata requires purchase read intersected with file read", async () => {
  const receipt = {
    id: "00000000-0000-4000-8000-000000000040",
    bizId: purchase.id,
    originalName: "receipt.pdf",
    mimeType: "application/pdf",
    fileSize: "4096",
    storagePath: "/must-not-project",
    createTime: new Date("2026-07-31T00:00:00.000Z")
  };
  for (const permissions of [
    [SYSTEM_PERMISSIONS.HOUSING_PURCHASE_READ],
    [SYSTEM_PERMISSIONS.FILE_READ],
    [SYSTEM_PERMISSIONS.HOUSING_PURCHASE_MANAGE, SYSTEM_PERMISSIONS.FILE_READ]
  ]) {
    const service = purchaseService([receipt]);
    const principal = { ...actor, permissions };
    const list = await service.listPurchases(scope, principal, { page: 1, page_size: 20 });
    const detail = await service.getPurchase(scope, principal, purchase.id);
    assert.equal("receiptFiles" in list.items[0]!, false, permissions.join(","));
    assert.equal("receiptFiles" in detail, false, permissions.join(","));
  }

  const service = purchaseService([receipt]);
  const principal = {
    ...actor,
    permissions: [
      SYSTEM_PERMISSIONS.HOUSING_PURCHASE_READ,
      SYSTEM_PERMISSIONS.FILE_READ
    ]
  };
  const list = await service.listPurchases(scope, principal, { page: 1, page_size: 20 });
  const detail = await service.getPurchase(scope, principal, purchase.id);
  const expected = [{
    id: receipt.id,
    originalName: receipt.originalName,
    mimeType: receipt.mimeType,
    fileSize: receipt.fileSize
  }];

  assert.deepEqual(list.items[0]?.receiptFiles, expected);
  assert.deepEqual(detail.receiptFiles, expected);
  assert.deepEqual(Object.keys(detail.receiptFiles![0]!).sort(), [
    "fileSize",
    "id",
    "mimeType",
    "originalName"
  ]);
  assert.doesNotMatch(JSON.stringify(detail), /storagePath/u);
});

test("lease detail without block read permissions neither queries nor returns optional blocks", async () => {
  const { service, calls, lease } = leaseService();
  const result = await service.get(scope, actor, lease.id);

  assert.deepEqual(Object.keys(result), ["lease"]);
  assert.deepEqual([...calls.entries()], [["lease", 1]]);
  assert.deepEqual(Object.keys(result.lease).sort(), [
    "eligibility", "endDate", "id", "leaseCode", "paymentCycleMonths",
    "startDate", "status", "tenantPartyId", "unitId"
  ]);
});

test("lease detail queries and projects only blocks backed by exact read permissions", async () => {
  const cases = [
    {
      permission: SYSTEM_PERMISSIONS.HOUSING_TENANT_READ,
      keys: ["lease", "tenant", "occupants"],
      calls: ["lease", "party", "occupants"]
    },
    {
      permission: SYSTEM_PERMISSIONS.HOUSING_BILLING_READ,
      keys: ["lease", "charge_plans"],
      calls: ["lease", "chargePlans"]
    },
    {
      permission: SYSTEM_PERMISSIONS.HOUSING_FINANCE_READ,
      keys: ["lease", "receivables", "ledger", "finance_summary"],
      calls: ["lease", "receivables", "ledger"]
    },
    {
      permission: SYSTEM_PERMISSIONS.HOUSING_HANDOVER_READ,
      keys: ["lease", "handovers"],
      calls: ["lease", "handovers"]
    },
    {
      permission: SYSTEM_PERMISSIONS.HOUSING_REPAIR_READ,
      keys: ["lease", "repairs"],
      calls: ["lease", "repairs"]
    }
  ] as const;

  for (const matrixCase of cases) {
    const { service, calls, lease } = leaseService();
    const result = await service.get(
      scope,
      { ...actor, permissions: [matrixCase.permission] },
      lease.id
    );
    assert.deepEqual(Object.keys(result), matrixCase.keys);
    assert.deepEqual([...calls.keys()], matrixCase.calls);
  }
});

test("fully authorized lease detail keeps strict block and item projections", async () => {
  const { service, lease } = leaseService();
  const result = await service.get(scope, {
    ...actor,
    permissions: [
      SYSTEM_PERMISSIONS.HOUSING_TENANT_READ,
      SYSTEM_PERMISSIONS.PARTY_SENSITIVE_READ,
      SYSTEM_PERMISSIONS.HOUSING_BILLING_READ,
      SYSTEM_PERMISSIONS.HOUSING_FINANCE_READ,
      SYSTEM_PERMISSIONS.HOUSING_HANDOVER_READ,
      SYSTEM_PERMISSIONS.HOUSING_REPAIR_READ
    ]
  }, lease.id);

  assert.deepEqual(Object.keys(result), [
    "lease", "tenant", "occupants", "charge_plans", "receivables",
    "ledger", "finance_summary", "handovers", "repairs"
  ]);
  assert.deepEqual(Object.keys(result.tenant!).sort(), [
    "displayName", "id", "identityNumberMasked", "verificationStatus"
  ]);
  assert.deepEqual(Object.keys(result.charge_plans![0]!).sort(), [
    "amount", "billingSource", "chargeType", "cycleMonths", "enabled",
    "id", "leaseId", "meterId", "unitPrice"
  ]);
  assert.deepEqual(Object.keys(result.receivables![0]!).sort(), [
    "amount", "chargeType", "dueDate", "id", "leaseId", "paidAmount",
    "periodEnd", "periodStart", "status", "waivedAmount"
  ]);
  assert.deepEqual(Object.keys(result.ledger![0]!).sort(), [
    "amount", "chargeType", "entryType", "id", "leaseId", "occurredAt",
    "paymentMethod", "reason", "receivableId", "status"
  ]);
  assert.deepEqual(Object.keys(result.handovers![0]!).sort(), [
    "damageAmount", "depositDeductionAmount", "handoverAt", "handoverType",
    "id", "itemSnapshot", "leaseId", "meterReadings", "remark", "status",
    "unsettledAmount"
  ]);
  assert.deepEqual(Object.keys(result.repairs![0]!).sort(), [
    "assigneeName", "createTime", "id", "overdueFlag", "priority",
    "status", "title", "urgency", "woCode"
  ]);
});

test("lease repair draft files exclude evidence already bound to a work order", async () => {
  const { service, lease, pendingFilePredicates } = leaseService();

  const result = await service.get(scope, {
    ...actor,
    permissions: [
      SYSTEM_PERMISSIONS.HOUSING_REPAIR_READ,
      SYSTEM_PERMISSIONS.HOUSING_REPAIR_MANAGE,
      SYSTEM_PERMISSIONS.FILE_READ
    ]
  }, lease.id);

  assert.deepEqual(result.pending_repair_files, []);
  assert.ok(pendingFilePredicates.some((sql) =>
    /NOT EXISTS \([\s\S]*file\.id = ANY\(repair\.image_file_ids\)/u.test(sql)
  ));
});

test("lease handover draft files query only canonical move-in, move-out, and legacy types", async () => {
  const { service, lease, pendingFileBindings } = leaseService();

  const result = await service.get(scope, {
    ...actor,
    permissions: [
      SYSTEM_PERMISSIONS.HOUSING_HANDOVER_READ,
      SYSTEM_PERMISSIONS.HOUSING_HANDOVER_MANAGE,
      SYSTEM_PERMISSIONS.FILE_READ
    ]
  }, lease.id);

  assert.deepEqual(result.pending_handover_files, { move_in: [], move_out: [] });
  assert.ok(pendingFileBindings.some((parameters) =>
    JSON.stringify(parameters?.bizTypes) === JSON.stringify([
      "housing_handover",
      "housing_handover_move_in",
      "housing_handover_move_out"
    ])
  ));
});
