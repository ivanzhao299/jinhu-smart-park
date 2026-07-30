import assert from "node:assert/strict";
import test from "node:test";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { CreatePartyDto, PartyQueryDto } from "../property-operations/dto/party.dto";
import type { PartyResponse } from "../property-operations/parties.service";
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

function partyResponse(overrides: Partial<PartyResponse> = {}): PartyResponse {
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
    createTime: new Date("2026-01-01T00:00:00Z"),
    updateTime: new Date("2026-01-01T00:00:00Z"),
    version: 1,
    remark: null,
    ...overrides
  };
}

function housingService(partiesService: {
  list: (scope: TenantParkScope, query: PartyQueryDto) => Promise<{
    items: PartyResponse[];
    total: number;
    page: number;
    page_size: number;
  }>;
  create: (
    scope: TenantParkScope,
    actor: JwtPrincipal,
    dto: CreatePartyDto
  ) => Promise<PartyResponse>;
}) {
  return new HousingService(
    {} as never,
    {} as never,
    partiesService as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never
  );
}

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
