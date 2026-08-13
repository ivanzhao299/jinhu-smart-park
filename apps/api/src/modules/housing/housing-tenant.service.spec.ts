import assert from "node:assert/strict";
import test from "node:test";
import {
  SYSTEM_PERMISSIONS,
  type PartyListItemResponse,
  type TenantParkScope
} from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { CreatePartyDto, PartyQueryDto } from "../property-operations/dto/party.dto";
import { HousingService } from "./housing.service";
import { HousingTenantService } from "./housing-tenant.service";

const scope: TenantParkScope = { tenantId: "tenant-1", parkId: "park-1" };
const actor: JwtPrincipal = {
  sub: "user-1",
  username: "user-1",
  tenantId: scope.tenantId,
  parkId: scope.parkId,
  roles: [],
  permissions: []
};

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

function tenantService(partiesService: {
  list: (scope: TenantParkScope, query: PartyQueryDto) => Promise<{
    items: PartyListItemResponse[];
    total: number;
    page: number;
    page_size: number;
  }>;
  create: (
    scope: TenantParkScope,
    actor: JwtPrincipal,
    dto: CreatePartyDto,
    clientKey?: string
  ) => Promise<PartyListItemResponse>;
}, allowedUnitIds: string[] | null = null) {
  return new HousingTenantService(
    {
      ...partiesService,
      listForDomainProjection: partiesService.list
    } as never,
    { allowedUnitIds: async () => allowedUnitIds } as never
  );
}

test("housing tenant list passes the actor's complete allowed unit set to Party projection", async () => {
  let receivedUnitIds: string[] | null | undefined;
  const service = new HousingTenantService({
    listForDomainProjection: async (
      _scope: TenantParkScope,
      _query: PartyQueryDto,
      _actor: JwtPrincipal,
      unitIds: string[] | null
    ) => {
      receivedUnitIds = unitIds;
      return { items: [], total: 0, page: 1, page_size: 20 };
    }
  } as never, {
    allowedUnitIds: async () => ["unit-allowed"]
  } as never);

  await service.list(scope, actor, { page: 1, page_size: 20 });

  assert.deepEqual(receivedUnitIds, ["unit-allowed"]);
});

test("housing tenant list forces person scope and preserves server pagination", async () => {
  let receivedQuery: PartyQueryDto | undefined;
  const service = tenantService({
    list: async (_scope, query) => {
      receivedQuery = query;
      return { items: [], total: 41, page: 3, page_size: 10 };
    },
    create: async () => partyResponse()
  });

  const result = await service.list(scope, actor, {
    page: 3,
    page_size: 10,
    party_type: "organization"
  });

  assert.equal(receivedQuery?.party_type, "person");
  assert.deepEqual(result, { items: [], total: 41, page: 3, page_size: 10 });
});

test("housing tenant list masks contact fields without mutating the Party response", async () => {
  const source = partyResponse();
  const service = tenantService({
    list: async () => ({ items: [source], total: 1, page: 1, page_size: 20 }),
    create: async () => source
  });

  const result = await service.list(scope, {
    ...actor,
    permissions: [SYSTEM_PERMISSIONS.HOUSING_TENANT_MANAGE]
  }, { page: 1, page_size: 20 });
  const serialized = JSON.stringify(result);

  assert.equal(result.items[0]?.mobile, "138****5678");
  assert.equal(result.items[0]?.email, "te***@example.com");
  assert.doesNotMatch(serialized, /13812345678|tenant@example\.com/u);
  assert.equal(source.mobile, "13812345678");
  assert.equal(source.email, "tenant@example.com");
  assert.notEqual(result.items[0], source);
  assert.deepEqual(Object.keys(result.items[0]!).sort(), [
    "displayName", "email", "id", "mobile", "verificationStatus"
  ]);
});

test("housing tenant read-only projection omits contact fields and raw Party metadata", async () => {
  const source = partyResponse({ identityNumber: "320123199001011234" });
  const service = tenantService({
    list: async () => ({ items: [source], total: 1, page: 1, page_size: 20 }),
    create: async () => source
  });

  const result = await service.list(scope, {
    ...actor,
    permissions: [SYSTEM_PERMISSIONS.HOUSING_TENANT_READ]
  }, { page: 1, page_size: 20 });

  assert.deepEqual(Object.keys(result.items[0]!).sort(), [
    "displayName", "id", "verificationStatus"
  ]);
  assert.equal("identityNumber" in result.items[0]!, false);
  assert.equal("tenantId" in result.items[0]!, false);
});

test("housing tenant identity mask requires exact party sensitive read", async () => {
  const source = partyResponse({ identityNumberMasked: "320***********1234" });
  const service = tenantService({
    list: async () => ({ items: [source], total: 1, page: 1, page_size: 20 }),
    create: async () => source
  });

  const withoutSensitive = await service.list(scope, {
    ...actor,
    permissions: [SYSTEM_PERMISSIONS.HOUSING_TENANT_MANAGE]
  }, { page: 1, page_size: 20 });
  const withSensitive = await service.list(scope, {
    ...actor,
    permissions: [
      SYSTEM_PERMISSIONS.HOUSING_TENANT_READ,
      SYSTEM_PERMISSIONS.PARTY_SENSITIVE_READ
    ]
  }, { page: 1, page_size: 20 });

  assert.equal("identityNumberMasked" in withoutSensitive.items[0]!, false);
  assert.equal(withSensitive.items[0]?.identityNumberMasked, "320***********1234");
});

test("housing tenant creation fixes Party ownership and masks short or null contacts", async () => {
  const created = partyResponse({ mobile: "123", email: "a@b" });
  let receivedDto: CreatePartyDto | undefined;
  let receivedClientKey: string | undefined;
  const service = tenantService({
    list: async () => ({ items: [], total: 0, page: 1, page_size: 20 }),
    create: async (_scope, _actor, dto, clientKey) => {
      receivedDto = dto;
      receivedClientKey = clientKey;
      return created;
    }
  });
  const manager = { ...actor, permissions: [SYSTEM_PERMISSIONS.HOUSING_TENANT_MANAGE] };

  const result = await service.create(scope, manager, {
    party_type: "organization",
    display_name: "Tenant",
    mobile: "123",
    email: "a@b"
  }, "housing-tenant-create-key");

  assert.equal(receivedDto?.party_type, "person");
  assert.equal(receivedDto?.source_domain, "housing_rental");
  assert.equal(receivedClientKey, "housing-tenant-create-key");
  assert.equal(result.mobile, "****");
  assert.equal(result.email, "a***@b");
  assert.doesNotMatch(JSON.stringify(result), /"mobile":"123"|"email":"a@b"/u);
  assert.equal(created.mobile, "123");
  assert.equal(created.email, "a@b");

  const nullContacts = partyResponse({ mobile: null, email: null });
  const nullService = tenantService({
    list: async () => ({ items: [], total: 0, page: 1, page_size: 20 }),
    create: async () => nullContacts
  });
  const nullResult = await nullService.create(
    scope,
    manager,
    { party_type: "person", display_name: "Tenant" }
  );
  assert.equal(nullResult.mobile, null);
  assert.equal(nullResult.email, null);
});

test("HousingService tenant methods are façade-only delegations", async () => {
  const calls: Array<{ kind: string; args: unknown[] }> = [];
  const tenant = {
    list: async (...args: unknown[]) => {
      calls.push({ kind: "list", args });
      return { items: [], total: 0, page: 1, page_size: 20 };
    },
    create: async (...args: unknown[]) => {
      calls.push({ kind: "create", args });
      return { id: "party-1", displayName: "Tenant", verificationStatus: "unverified" };
    }
  };
  const service = new HousingService(
    {} as never,
    {} as never,
    tenant as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never
  );
  const query = { page: 1, page_size: 20 };
  const dto = { party_type: "person" as const, display_name: "Tenant" };
  const clientKey = "housing-service-tenant-create-key";

  await service.listTenants(scope, actor, query);
  await service.createTenant(scope, actor, dto, clientKey);

  assert.deepEqual(calls, [
    { kind: "list", args: [scope, actor, query] },
    { kind: "create", args: [scope, actor, dto, clientKey] }
  ]);
});
