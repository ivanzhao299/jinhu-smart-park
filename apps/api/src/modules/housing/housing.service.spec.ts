import assert from "node:assert/strict";
import test from "node:test";
import {
  SYSTEM_PERMISSIONS,
  type PartyListItemResponse,
  type TenantParkScope
} from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import {
  PROPERTY_APPROVAL_REQUIRED_MESSAGE,
  PROPERTY_HIGH_RISK_PERMISSION_REQUIRED_MESSAGE
} from "../../shared/property-workbench/property-high-risk-stopship";
import type { CreatePartyDto, PartyQueryDto } from "../property-operations/dto/party.dto";
import { HousingService } from "./housing.service";

const scope: TenantParkScope = { tenantId: "tenant-1", parkId: "park-1" };
const actor: JwtPrincipal = {
  sub: "user-1",
  username: "user-1",
  tenantId: scope.tenantId,
  parkId: scope.parkId,
  roles: [],
  permissions: []
};

test("direct housing pure high-risk actions stop before a transaction for every principal class", async () => {
  let transactionCalls = 0;
  const service = new HousingService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      transaction: async () => {
        transactionCalls += 1;
      }
    } as never,
    {} as never
  );
  const principals = [
    actor,
    { ...actor, isSuper: true },
    { ...actor, permissions: ["*"] }
  ];

  for (const principal of principals) {
    const runs = [
      () => service.approveLease(scope, principal, "lease-1", {}),
      () => service.voidLease(scope, principal, "lease-1", "reason"),
      () => service.checkoutLease(scope, principal, "lease-1", "reason"),
      () => service.purchaseAction(scope, principal, "purchase-1", {
        action: "approve",
        reason: "reason"
      }),
      () => service.transferPurchase(scope, principal, "purchase-1", {} as never)
    ];
    for (const run of runs) {
      await assert.rejects(run, (error: unknown) => {
        assert.ok(error instanceof ConflictException);
        assert.equal(error.message, PROPERTY_APPROVAL_REQUIRED_MESSAGE);
        return true;
      });
    }
  }
  assert.equal(transactionCalls, 0);
});

test("housing mixed high-risk variants enforce exact permission intersections before stop-ship", async () => {
  let transactionCalls = 0;
  const service = new HousingService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { transaction: async () => { transactionCalls += 1; } } as never,
    {} as never
  );
  const financeDenied = [
    actor,
    { ...actor, permissions: [SYSTEM_PERMISSIONS.HOUSING_FINANCE_WAIVE] },
    { ...actor, permissions: [SYSTEM_PERMISSIONS.PROPERTY_APPROVAL_CREATE] },
    {
      ...actor,
      permissions: [
        SYSTEM_PERMISSIONS.HOUSING_FINANCE_REGISTER,
        SYSTEM_PERMISSIONS.PROPERTY_APPROVAL_CREATE
      ]
    }
  ];
  const financeAllowed = [
    {
      ...actor,
      permissions: [
        SYSTEM_PERMISSIONS.HOUSING_FINANCE_WAIVE,
        SYSTEM_PERMISSIONS.PROPERTY_APPROVAL_CREATE
      ]
    },
    { ...actor, isSuper: true },
    { ...actor, permissions: ["*"] }
  ];
  for (const entryType of ["refund", "waiver", "deposit_refund"] as const) {
    for (const principal of financeDenied) {
      await assert.rejects(
        service.registerLedger(scope, principal, "lease-1", {
          entry_type: entryType
        } as never),
        (error: unknown) => {
          assert.ok(error instanceof ForbiddenException);
          assert.equal(error.message, PROPERTY_HIGH_RISK_PERMISSION_REQUIRED_MESSAGE);
          return true;
        }
      );
    }
    for (const principal of financeAllowed) {
      await assert.rejects(
        service.registerLedger(scope, principal, "lease-1", {
          entry_type: entryType
        } as never),
        (error: unknown) => {
          assert.ok(error instanceof ConflictException);
          assert.equal(error.message, PROPERTY_APPROVAL_REQUIRED_MESSAGE);
          return true;
        }
      );
    }
  }

  const handoverDenied = [
    actor,
    { ...actor, permissions: [SYSTEM_PERMISSIONS.HOUSING_HANDOVER_MANAGE] },
    { ...actor, permissions: [SYSTEM_PERMISSIONS.PROPERTY_APPROVAL_CREATE] }
  ];
  const handoverAllowed = [
    {
      ...actor,
      permissions: [
        SYSTEM_PERMISSIONS.HOUSING_HANDOVER_MANAGE,
        SYSTEM_PERMISSIONS.PROPERTY_APPROVAL_CREATE
      ]
    },
    { ...actor, isSuper: true },
    { ...actor, permissions: ["*"] }
  ];
  for (const field of [
    "damage_amount",
    "unsettled_amount",
    "deposit_deduction_amount"
  ] as const) {
    const dto = {
      handover_type: "move_out" as const,
      damage_amount: "0.00",
      unsettled_amount: "0.00",
      deposit_deduction_amount: "0.00",
      [field]: "0.01"
    };
    for (const principal of handoverDenied) {
      await assert.rejects(
        service.completeHandover(scope, principal, "lease-1", dto),
        ForbiddenException
      );
    }
    for (const principal of handoverAllowed) {
      await assert.rejects(
        service.completeHandover(scope, principal, "lease-1", dto),
        ConflictException
      );
    }
  }
  assert.equal(transactionCalls, 0);
});

test("direct housing service keeps low-risk ledger and handover variants reachable", async () => {
  let transactionCalls = 0;
  const service = new HousingService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      transaction: async () => {
        transactionCalls += 1;
        return "direct";
      }
    } as never,
    {} as never
  );
  const principal = {
    ...actor,
    permissions: [SYSTEM_PERMISSIONS.HOUSING_FINANCE_REGISTER]
  };
  for (const entryType of ["payment", "deposit_receipt"] as const) {
    assert.equal(
      await service.registerLedger(scope, principal, "lease-1", {
        entry_type: entryType
      } as never),
      "direct"
    );
  }
  for (const dto of [
    {
      handover_type: "move_in",
      damage_amount: "0.00",
      unsettled_amount: "0.00",
      deposit_deduction_amount: "0.00"
    },
    {
      handover_type: "move_out",
      damage_amount: "0.00",
      unsettled_amount: "0.00",
      deposit_deduction_amount: "0.00"
    }
  ] as const) {
    assert.equal(
      await service.completeHandover(scope, principal, "lease-1", dto),
      "direct"
    );
  }
  assert.equal(transactionCalls, 4);
});

function partyResponse(
  overrides: Partial<PartyListItemResponse> = {}
): PartyListItemResponse {
  return {
    id: "party-1",
    tenantId: scope.tenantId,
    parkId: scope.parkId,
    partyType: "person",
    displayName: "Tenant",
    mobile: "13812345678",
    email: "tenant@example.com",
    identityDocumentType: null,
    identityNumberMasked: null,
    sourceDomain: "housing_rental",
    verificationStatus: "unverified",
    consentStatus: "pending",
    createTime: "2026-01-01T00:00:00.000Z",
    updateTime: "2026-01-01T00:00:00.000Z",
    version: 1,
    remark: null,
    ...overrides
  };
}

function housingService(partiesService: {
  list: (scope: TenantParkScope, query: PartyQueryDto) => Promise<{
    items: PartyListItemResponse[];
    total: number;
    page: number;
    page_size: number;
  }>;
  create: (
    scope: TenantParkScope,
    actor: JwtPrincipal,
    dto: CreatePartyDto
  ) => Promise<PartyListItemResponse>;
}, allowedUnitIds: string[] | null = null) {
  return new HousingService(
    {} as never,
    {} as never,
    {
      ...partiesService,
      listForDomainProjection: partiesService.list
    } as never,
    {} as never,
    { allowedUnitIds: async () => allowedUnitIds } as never,
    {} as never,
    {} as never,
    {} as never
  );
}

test("housing tenant API passes the actor's allowed unit set to the Party projection", async () => {
  let receivedUnitIds: string[] | null | undefined;
  const partiesService = {
    listForDomainProjection: async (
      _scope: TenantParkScope,
      _query: PartyQueryDto,
      _actor: JwtPrincipal,
      unitIds: string[] | null
    ) => {
      receivedUnitIds = unitIds;
      return { items: [], total: 0, page: 1, page_size: 20 };
    },
    create: async () => partyResponse()
  };
  const service = new HousingService(
    {} as never,
    {} as never,
    partiesService as never,
    {} as never,
    { allowedUnitIds: async () => ["unit-allowed"] } as never,
    {} as never,
    {} as never,
    {} as never
  );
  await service.listTenants(scope, actor, { page: 1, page_size: 20 });
  assert.deepEqual(receivedUnitIds, ["unit-allowed"]);
});

test("housing tenant list masks contact fields without mutating the Party response", async () => {
  const source = partyResponse();
  const service = housingService({
    list: async () => ({ items: [source], total: 1, page: 1, page_size: 20 }),
    create: async () => source
  });

  const result = await service.listTenants(
    scope,
    { ...actor, permissions: [SYSTEM_PERMISSIONS.HOUSING_TENANT_MANAGE] },
    { page: 1, page_size: 20 }
  );
  const serialized = JSON.stringify(result);

  assert.equal(result.items[0]?.mobile, "138****5678");
  assert.equal(result.items[0]?.email, "te***@example.com");
  assert.doesNotMatch(serialized, /13812345678|tenant@example\.com/u);
  assert.equal(source.mobile, "13812345678");
  assert.equal(source.email, "tenant@example.com");
  assert.notEqual(result.items[0], source);
  assert.deepEqual(Object.keys(result.items[0]!).sort(), [
    "displayName",
    "email",
    "id",
    "mobile",
    "verificationStatus"
  ]);
});

test("housing tenant read-only projection omits contact fields and raw Party metadata", async () => {
  const source = partyResponse({ identityNumber: "320123199001011234" });
  const service = housingService({
    list: async () => ({ items: [source], total: 1, page: 1, page_size: 20 }),
    create: async () => source
  });

  const result = await service.listTenants(
    scope,
    { ...actor, permissions: [SYSTEM_PERMISSIONS.HOUSING_TENANT_READ] },
    { page: 1, page_size: 20 }
  );

  assert.deepEqual(Object.keys(result.items[0]!).sort(), [
    "displayName",
    "id",
    "verificationStatus"
  ]);
  assert.equal("identityNumber" in result.items[0]!, false);
  assert.equal("tenantId" in result.items[0]!, false);
});

test("housing tenant identity mask requires exact party sensitive read", async () => {
  const source = partyResponse({ identityNumberMasked: "320***********1234" });
  const service = housingService({
    list: async () => ({ items: [source], total: 1, page: 1, page_size: 20 }),
    create: async () => source
  });

  const withoutSensitive = await service.listTenants(
    scope,
    { ...actor, permissions: [SYSTEM_PERMISSIONS.HOUSING_TENANT_MANAGE] },
    { page: 1, page_size: 20 }
  );
  const withSensitive = await service.listTenants(
    scope,
    { ...actor, permissions: [
      SYSTEM_PERMISSIONS.HOUSING_TENANT_READ,
      SYSTEM_PERMISSIONS.PARTY_SENSITIVE_READ
    ] },
    { page: 1, page_size: 20 }
  );

  assert.equal("identityNumberMasked" in withoutSensitive.items[0]!, false);
  assert.equal(withSensitive.items[0]?.identityNumberMasked, "320***********1234");
});

test("housing tenant creation masks contacts while preserving nulls and short-value privacy", async () => {
  const created = partyResponse({
    mobile: "123",
    email: "a@b"
  });
  let receivedDto: CreatePartyDto | undefined;
  const service = housingService({
    list: async () => ({ items: [], total: 0, page: 1, page_size: 20 }),
    create: async (_scope, _actor, dto) => {
      receivedDto = dto;
      return created;
    }
  });

  const result = await service.createTenant(
    scope,
    { ...actor, permissions: [SYSTEM_PERMISSIONS.HOUSING_TENANT_MANAGE] },
    {
    party_type: "organization",
    display_name: "Tenant",
    mobile: "123",
    email: "a@b"
    }
  );
  const serialized = JSON.stringify(result);

  assert.equal(receivedDto?.party_type, "person");
  assert.equal(receivedDto?.source_domain, "housing_rental");
  assert.equal(result.mobile, "****");
  assert.equal(result.email, "a***@b");
  assert.doesNotMatch(serialized, /"mobile":"123"|"email":"a@b"/u);
  assert.equal(created.mobile, "123");
  assert.equal(created.email, "a@b");

  const nullContacts = partyResponse({ mobile: null, email: null });
  const nullService = housingService({
    list: async () => ({ items: [], total: 0, page: 1, page_size: 20 }),
    create: async () => nullContacts
  });
  const nullResult = await nullService.createTenant(
    scope,
    { ...actor, permissions: [SYSTEM_PERMISSIONS.HOUSING_TENANT_MANAGE] },
    { party_type: "person", display_name: "Tenant" }
  );
  assert.equal(nullResult.mobile, null);
  assert.equal(nullResult.email, null);
});
