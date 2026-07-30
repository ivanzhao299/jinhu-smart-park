import assert from "node:assert/strict";
import test from "node:test";
import type { TenantParkScope } from "@jinhu/shared";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { Brackets } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { PartyQueryDto } from "./dto/party.dto";
import type { PartyEntity } from "./entities/party.entity";
import { PartiesService } from "./parties.service";

const scope: TenantParkScope = { tenantId: "tenant-1", parkId: "park-1" };
const actor: JwtPrincipal = {
  sub: "user-1",
  username: "user-1",
  tenantId: scope.tenantId,
  parkId: scope.parkId,
  roles: [],
  permissions: []
};

function partyFixture(overrides: Partial<PartyEntity> = {}): PartyEntity {
  return {
    id: "party-1",
    tenantId: scope.tenantId,
    parkId: scope.parkId,
    partyType: "person",
    displayName: "Tenant",
    mobile: null,
    email: null,
    identityDocumentType: "id_card",
    identityNumberEncrypted: "enc:old",
    identityNumberHash: "hash:old",
    identityNumberMasked: "11************02",
    sourceDomain: null,
    verificationStatus: "verified",
    consentStatus: "pending",
    createBy: actor.sub,
    createTime: new Date("2026-01-01T00:00:00Z"),
    updateBy: actor.sub,
    updateTime: new Date("2026-01-01T00:00:00Z"),
    isDeleted: false,
    version: 1,
    remark: null,
    ...overrides
  };
}

function lockedPartyHarness(entity: PartyEntity) {
  const lockModes: string[] = [];
  const saved: PartyEntity[] = [];
  const builder = {
    where: () => builder,
    andWhere: () => builder,
    addSelect: () => builder,
    setLock: (mode: string) => {
      lockModes.push(mode);
      return builder;
    },
    getOne: async () => entity
  };
  const transactionRepository = {
    createQueryBuilder: () => builder,
    findOne: async () => null,
    save: async (value: PartyEntity) => {
      saved.push(value);
      return value;
    }
  };
  const partiesRepository = {
    manager: {
      transaction: async <T>(work: (manager: { getRepository: () => typeof transactionRepository }) => Promise<T>) =>
        work({ getRepository: () => transactionRepository })
    }
  };
  const sensitiveDataService = {
    encrypt: (value: string) => `enc:${value}`,
    hash: (value: string) => `hash:${value}`,
    mask: (value: string) => `mask:${value}`
  };
  return {
    lockModes,
    saved,
    service: new PartiesService(partiesRepository as never, {} as never, sensitiveDataService as never)
  };
}

test("party list uses shared projection and hides every sensitive field without exact permission", async () => {
  const entity = partyFixture({
    mobile: "13812345678",
    email: "tenant@example.com"
  });
  const builder = {
    where: () => builder,
    andWhere: () => builder,
    orderBy: () => builder,
    addOrderBy: () => builder,
    skip: () => builder,
    take: () => builder,
    getManyAndCount: async () => [[entity], 1]
  };
  const service = new PartiesService(
    { createQueryBuilder: () => builder } as never,
    {} as never,
    {} as never
  );

  const result = await service.list(scope, { page: 1, page_size: 20 }, actor);
  const item = result.items[0]!;

  assert.equal("mobile" in item, false);
  assert.equal("email" in item, false);
  assert.equal("identityDocumentType" in item, false);
  assert.equal("identityNumberMasked" in item, false);
  assert.equal("identityNumber" in item, false);
  assert.equal(item.createTime, "2026-01-01T00:00:00.000Z");
  assert.deepEqual(Object.keys(item).sort(), [
    "consentStatus",
    "createTime",
    "displayName",
    "id",
    "parkId",
    "partyType",
    "remark",
    "sourceDomain",
    "tenantId",
    "updateTime",
    "verificationStatus",
    "version"
  ]);
});

test("party keyword cannot probe mobile without party sensitive read", async () => {
  const predicates: string[] = [];
  const nested = {
    where: (predicate: string) => {
      predicates.push(predicate);
      return nested;
    },
    orWhere: (predicate: string) => {
      predicates.push(predicate);
      return nested;
    }
  };
  const builder = {
    where: () => builder,
    andWhere: (condition: unknown) => {
      if (condition instanceof Brackets) condition.whereFactory(nested as never);
      return builder;
    },
    orderBy: () => builder,
    addOrderBy: () => builder,
    skip: () => builder,
    take: () => builder,
    getManyAndCount: async () => [[], 0]
  };
  const service = new PartiesService(
    { createQueryBuilder: () => builder } as never,
    {} as never,
    {} as never
  );

  await service.list(scope, { keyword: "138", page: 1, page_size: 20 }, actor);
  assert.deepEqual(predicates, ["party.display_name ILIKE :keyword"]);

  predicates.length = 0;
  await service.list(
    scope,
    { keyword: "138", page: 1, page_size: 20 },
    { ...actor, permissions: ["party:sensitive_read"] }
  );
  assert.deepEqual(predicates, [
    "party.display_name ILIKE :keyword",
    "party.mobile ILIKE :keyword"
  ]);
});

test("party and housing tenant sort contract rejects raw columns and maps stable SQL", async () => {
  const valid = plainToInstance(PartyQueryDto, {
    sort: "displayName",
    order: "asc",
    page: "2",
    page_size: "100"
  });
  assert.deepEqual(await validate(valid), []);
  for (const input of [
    { sort: "update_time; DROP TABLE biz_party" },
    { order: "sideways" }
  ]) {
    assert.ok((await validate(plainToInstance(PartyQueryDto, input))).length > 0);
  }

  const orders: Array<[string, string]> = [];
  const builder = {
    where: () => builder,
    andWhere: () => builder,
    orderBy: (column: string, direction: string) => {
      orders.push([column, direction]);
      return builder;
    },
    addOrderBy: (column: string, direction: string) => {
      orders.push([column, direction]);
      return builder;
    },
    skip: () => builder,
    take: () => builder,
    getManyAndCount: async () => [[], 0]
  };
  const service = new PartiesService(
    { createQueryBuilder: () => builder } as never,
    {} as never,
    {} as never
  );
  await service.list(scope, valid, actor);
  assert.deepEqual(orders, [
    ["party.display_name", "ASC"],
    ["party.id", "ASC"]
  ]);
});

test("restricted housing tenant list is one scoped query and excludes unrelated or unbound parties", async () => {
  const predicates: Array<{ sql: unknown; parameters?: Record<string, unknown> }> = [];
  let pageQueries = 0;
  const builder = {
    where: (sql: unknown, parameters?: Record<string, unknown>) => {
      predicates.push({ sql, parameters });
      return builder;
    },
    andWhere: (sql: unknown, parameters?: Record<string, unknown>) => {
      predicates.push({ sql, parameters });
      return builder;
    },
    orderBy: () => builder,
    addOrderBy: () => builder,
    skip: () => builder,
    take: () => builder,
    getManyAndCount: async () => {
      pageQueries += 1;
      return [[], 0];
    }
  };
  const service = new PartiesService(
    { createQueryBuilder: () => builder } as never,
    {} as never,
    {} as never
  );

  const result = await service.listForDomainProjection(
    scope,
    { party_type: "person", page: 8, page_size: 20 },
    actor,
    ["00000000-0000-4000-8000-000000000010"]
  );
  const scopePredicate = predicates.find((item) =>
    typeof item.sql === "string" && item.sql.includes("biz_housing_lease")
  );
  assert.ok(scopePredicate);
  assert.match(String(scopePredicate.sql), /scoped_lease\.unit_id IN \(:\.\.\.housingUnitIds\)/u);
  assert.match(String(scopePredicate.sql), /biz_property_occupancy scoped_occupancy/u);
  assert.match(String(scopePredicate.sql), /scoped_occupancy\.unit_id IN \(:\.\.\.housingUnitIds\)/u);
  assert.match(String(scopePredicate.sql), /scoped_lease\.tenant_party_id = party\.id/u);
  assert.match(String(scopePredicate.sql), /rel_housing_lease_occupant/u);
  assert.match(String(scopePredicate.sql), /scoped_occupant\.party_id = party\.id/u);
  assert.deepEqual(scopePredicate.parameters?.housingUnitIds, [
    "00000000-0000-4000-8000-000000000010"
  ]);
  assert.equal(pageQueries, 1);
  assert.deepEqual(result, { items: [], total: 0, page: 8, page_size: 20 });
});

test("empty housing unit scope returns zero without querying parties", async () => {
  let builders = 0;
  const service = new PartiesService(
    { createQueryBuilder: () => {
      builders += 1;
      return {};
    } } as never,
    {} as never,
    {} as never
  );
  assert.deepEqual(
    await service.listForDomainProjection(
      scope,
      { page: 99, page_size: 20 },
      actor,
      []
    ),
    { items: [], total: 0, page: 99, page_size: 20 }
  );
  assert.equal(builders, 0);
});

test("party detail exposes protected fields and minimal roles only with sensitive read", async () => {
  const entity = partyFixture({
    mobile: "13812345678",
    email: "tenant@example.com"
  });
  const builder = {
    where: () => builder,
    andWhere: () => builder,
    addSelect: () => builder,
    getOne: async () => entity
  };
  const role = {
    id: "role-1",
    roleType: "tenant",
    sourceType: "housing_lease",
    sourceId: "lease-1",
    status: "active",
    createTime: new Date("2026-01-02T00:00:00.000Z"),
    updateBy: "must-not-project"
  };
  let decryptCount = 0;
  const service = new PartiesService(
    { createQueryBuilder: () => builder } as never,
    { find: async () => [role] } as never,
    {
      decrypt: () => {
        decryptCount += 1;
        return "11010519491231002X";
      }
    } as never
  );
  const sensitiveActor = {
    ...actor,
    permissions: ["party:sensitive_read"]
  };

  const detail = await service.detail(scope, sensitiveActor, entity.id);

  assert.equal(decryptCount, 1);
  assert.equal(detail.mobile, entity.mobile);
  assert.equal(detail.identityNumber, "11010519491231002X");
  assert.deepEqual(detail.roles, [{
    id: role.id,
    roleType: role.roleType,
    sourceType: role.sourceType,
    sourceId: role.sourceId,
    status: role.status,
    createTime: "2026-01-02T00:00:00.000Z"
  }]);
  assert.equal("updateBy" in detail.roles[0]!, false);
});

test("concurrent duplicate party-role creation returns the committed relation", async () => {
  const concurrent = { id: "role-1", roleType: "tenant", sourceType: null, sourceId: null };
  const created: Array<Record<string, unknown>> = [];
  let findCount = 0;
  const rolesRepository = {
    findOne: async () => {
      findCount += 1;
      return findCount === 1 ? null : concurrent;
    },
    create: (value: Record<string, unknown>) => {
      created.push(value);
      return value;
    },
    save: async () => {
      throw Object.assign(new Error("duplicate"), { code: "23505" });
    }
  };
  const service = new PartiesService({} as never, rolesRepository as never, {} as never);
  Object.defineProperty(service, "mustFind", { value: async () => ({ id: "party-1" }) });

  const result = await service.addRole(scope, actor, {
    party_id: "party-1",
    role_type: " tenant ",
    source_type: undefined,
    source_id: undefined,
    remark: undefined
  });

  assert.equal(result, concurrent);
  assert.equal(findCount, 2);
  assert.equal(created[0]?.roleType, "tenant");
  assert.equal(created[0]?.sourceType, null);
  assert.equal(created[0]?.sourceId, null);
});

test("party-role creation does not hide unrelated persistence failures", async () => {
  const failure = Object.assign(new Error("database unavailable"), { code: "57P01" });
  const rolesRepository = {
    findOne: async () => null,
    create: (value: Record<string, unknown>) => value,
    save: async () => {
      throw failure;
    }
  };
  const service = new PartiesService({} as never, rolesRepository as never, {} as never);
  Object.defineProperty(service, "mustFind", { value: async () => ({ id: "party-1" }) });

  await assert.rejects(
    service.addRole(scope, actor, {
      party_id: "party-1",
      role_type: "tenant",
      source_type: undefined,
      source_id: undefined,
      remark: undefined
    }),
    failure
  );
});

test("party-role creation rejects a blank normalized role before persistence", async () => {
  const service = new PartiesService({
    createQueryBuilder: () => {
      throw new Error("party lookup must not run for an invalid role");
    }
  } as never, {} as never, {} as never);

  await assert.rejects(
    service.addRole(scope, actor, {
      party_id: "00000000-0000-4000-8000-000000000001",
      role_type: "   "
    }),
    /role_type is required/
  );
});

test("identity-only updates use the persisted document type and canonical storage value", async () => {
  const harness = lockedPartyHarness(partyFixture());

  const result = await harness.service.update(scope, actor, "party-1", {
    identity_number: "11010519491231002x"
  });

  assert.deepEqual(harness.lockModes, ["pessimistic_write"]);
  assert.equal(harness.saved[0]?.identityNumberEncrypted, "enc:11010519491231002X");
  assert.equal(harness.saved[0]?.identityNumberHash, "hash:11010519491231002X");
  assert.equal(harness.saved[0]?.identityNumberMasked, "mask:11010519491231002X");
  assert.equal(result.identityNumberMasked, "mask:11010519491231002X");
  assert.equal(result.verificationStatus, "unverified");
});

test("identity updates reject a number that does not match the persisted document type", async () => {
  const harness = lockedPartyHarness(partyFixture());

  await assert.rejects(
    harness.service.update(scope, actor, "party-1", {
      identity_number: "not-an-id-card"
    }),
    /identity_number does not match identity_document_type/
  );
  assert.equal(harness.saved.length, 0);
});

test("identity updates and verification share the same pessimistic row lock", async () => {
  const entity = partyFixture({ verificationStatus: "unverified" });
  const harness = lockedPartyHarness(entity);

  await harness.service.update(scope, actor, "party-1", { display_name: "Updated tenant" });
  await harness.service.verify(scope, actor, "party-1", { verification_status: "verified" });

  assert.deepEqual(harness.lockModes, ["pessimistic_write", "pessimistic_write"]);
  assert.equal(entity.verificationStatus, "verified");
});

test("party creation canonicalizes an ID-card value before every protected representation", async () => {
  const encryptedValues: string[] = [];
  const hashedValues: string[] = [];
  const maskedValues: string[] = [];
  const partiesRepository = {
    findOne: async () => null,
    create: (value: Record<string, unknown>) => ({
      ...partyFixture(),
      ...value
    }),
    save: async (value: PartyEntity) => value
  };
  const sensitiveDataService = {
    encrypt: (value: string) => {
      encryptedValues.push(value);
      return `enc:${value}`;
    },
    hash: (value: string) => {
      hashedValues.push(value);
      return `hash:${value}`;
    },
    mask: (value: string) => {
      maskedValues.push(value);
      return `mask:${value}`;
    }
  };
  const service = new PartiesService(partiesRepository as never, {} as never, sensitiveDataService as never);

  await service.create(scope, actor, {
    party_type: "person",
    display_name: "Tenant",
    identity_document_type: "id_card",
    identity_number: "11010519491231002x"
  });

  assert.deepEqual(encryptedValues, ["11010519491231002X"]);
  assert.deepEqual(hashedValues, ["11010519491231002x", "11010519491231002X"]);
  assert.deepEqual(maskedValues, ["11010519491231002X"]);
});

test("party creation rejects a legacy lowercase-check-digit identity duplicate", async () => {
  const partiesRepository = {
    findOne: async () => partyFixture(),
    create: () => {
      throw new Error("duplicate detection must run before entity creation");
    }
  };
  const sensitiveDataService = {
    hash: (value: string) => `hash:${value}`
  };
  const service = new PartiesService(partiesRepository as never, {} as never, sensitiveDataService as never);

  await assert.rejects(
    service.create(scope, actor, {
      party_type: "person",
      display_name: "Tenant",
      identity_document_type: "id_card",
      identity_number: "11010519491231002X"
    }),
    /Party identity already exists/
  );
});
