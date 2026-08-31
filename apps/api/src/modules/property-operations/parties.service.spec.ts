import assert from "node:assert/strict";
import test from "node:test";
import type { TenantParkScope } from "@jinhu/shared";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { Brackets } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { PartyQueryDto, RevealPartyIdentityDto } from "./dto/party.dto";
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
    identityNumberEncryptionKeyId: "party-data-v1",
    identityNumberHash: "hash:old",
    identityNumberMasked: "11************02",
    sourceDomain: null,
    verificationStatus: "verified",
    consentStatus: "pending",
    currentConsentFactId: null,
    processingRestrictedAt: null,
    processingRestrictionReason: null,
    processingRestrictionRequestId: null,
    identityVersion: "1",
    currentIdentitySubmissionId: null,
    currentVerifiedSubmissionId: null,
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

type RevealTestManager = {
  getRepository(): { createQueryBuilder(): unknown };
  transaction<T>(callback: (manager: RevealTestManager) => Promise<T>): Promise<T>;
};

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
    "currentConsentFactId",
    "displayName",
    "id",
    "identitySummary",
    "parkId",
    "partyType",
    "processingRestrictedAt",
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
  assert.equal(scopePredicate.parameters?.housingActorId, actor.sub);
  assert.match(String(scopePredicate.sql), /party\.source_domain = 'housing_rental'/u);
  assert.match(String(scopePredicate.sql), /NOT EXISTS[\s\S]+any_housing_lease/u);
  assert.equal(pageQueries, 1);
  assert.deepEqual(result, { items: [], total: 0, page: 8, page_size: 20 });
});

test("empty housing unit scope still exposes only the actor's newly created unbound housing tenants", async () => {
  const predicates: Array<{ sql: unknown; parameters?: Record<string, unknown> }> = [];
  const builder = {
    where: (sql: unknown, parameters?: Record<string, unknown>) => { predicates.push({ sql, parameters }); return builder; },
    andWhere: (sql: unknown, parameters?: Record<string, unknown>) => { predicates.push({ sql, parameters }); return builder; },
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
  await service.listForDomainProjection(scope, { page: 99, page_size: 20 }, actor, []);
  const scopePredicate = predicates.find((item) =>
    typeof item.sql === "string" && item.sql.includes("any_housing_lease")
  );
  assert.ok(scopePredicate);
  assert.match(String(scopePredicate.sql), /OR false/u);
  assert.equal(scopePredicate.parameters?.housingActorId, actor.sub);
  assert.equal(scopePredicate.parameters?.housingUnitIds, undefined);
});

test("party detail exposes masked protected fields and never decrypts plaintext", async () => {
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

  assert.equal(decryptCount, 0);
  assert.equal(detail.mobile, entity.mobile);
  assert.equal(detail.identityNumberMasked, entity.identityNumberMasked);
  assert.equal("identityNumber" in detail, false);
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

test("party identity reveal requires exact permission and required audit before returning plaintext", async () => {
  const events: string[] = [];
  const entity = partyFixture();
  const builder = {
    where: () => builder,
    andWhere: () => builder,
    addSelect: () => builder,
    getOne: async () => entity
  };
  const manager: RevealTestManager = {
    getRepository: () => ({ createQueryBuilder: () => builder }),
    transaction: async <T>(callback: (value: RevealTestManager) => Promise<T>) => callback(manager)
  };
  const service = new PartiesService(
    { manager } as never,
    {} as never,
    { decrypt: () => { events.push("decrypt"); return "11010519491231002X"; } } as never,
    undefined,
    { recordOperationRequired: async (input: { afterJson?: unknown; bizId?: string }, auditManager: unknown) => {
      events.push("audit");
      assert.deepEqual(input.afterJson, { reasonCode: "LEGAL_COMPLIANCE" });
      assert.equal(input.bizId, entity.id);
      assert.equal(auditManager, manager);
      assert.doesNotMatch(JSON.stringify(input), /11010519491231002X/u);
    } } as never
  );
  await assert.rejects(
    service.revealIdentity(scope, actor, entity.id, "LEGAL_COMPLIANCE"),
    /party:identity_reveal/u
  );

  const result = await service.revealIdentity(scope, {
    ...actor,
    permissions: ["party:identity_reveal"]
  }, entity.id, "LEGAL_COMPLIANCE");

  assert.deepEqual(events, ["decrypt", "audit"]);
  assert.deepEqual(result, { partyId: entity.id, identityNumber: "11010519491231002X" });
});

test("party identity reveal reason is required and restricted to the controlled dictionary", async () => {
  const missing = await validate(plainToInstance(RevealPartyIdentityDto, {}));
  const freeText = await validate(plainToInstance(RevealPartyIdentityDto, { reason_code: "because I want it" }));
  const controlled = await validate(plainToInstance(RevealPartyIdentityDto, { reason_code: "DISPUTE_HANDLING" }));
  assert.ok(missing.length > 0);
  assert.ok(freeText.length > 0);
  assert.equal(controlled.length, 0);
});

test("party identity reveal fails closed when required audit fails", async () => {
  const entity = partyFixture();
  const builder = {
    where: () => builder,
    andWhere: () => builder,
    addSelect: () => builder,
    getOne: async () => entity
  };
  const manager: RevealTestManager = {
    getRepository: () => ({ createQueryBuilder: () => builder }),
    transaction: async <T>(callback: (value: RevealTestManager) => Promise<T>) => callback(manager)
  };
  const service = new PartiesService(
    { manager } as never,
    {} as never,
    { decrypt: () => "11010519491231002X" } as never,
    undefined,
    { recordOperationRequired: async () => { throw new Error("audit unavailable"); } } as never
  );
  await assert.rejects(
    service.revealIdentity(scope, { ...actor, permissions: ["party:identity_reveal"] }, entity.id, "BUSINESS_OPERATION"),
    /audit unavailable/u
  );
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

test("legacy party identity create calls the canonical adapter and never writes protected columns", async () => {
  const writes: unknown[][] = [];
  const saved: PartyEntity[] = [];
  const transactionManager = {
    getRepository: () => ({
      save: async (value: PartyEntity) => {
        saved.push(value);
        return value;
      }
    })
  };
  const partiesRepository = {
    manager: {
      transaction: async <T>(work: (manager: typeof transactionManager) => Promise<T>) =>
        work(transactionManager)
    },
    create: (value: Record<string, unknown>) => ({
      ...partyFixture(),
      ...value
    })
  };
  const identityAdapter = {
    writeDraft: async (...args: unknown[]) => {
      writes.push(args);
      return { id: "submission-1" };
    },
    identitySummaries: async () => new Map()
  };
  const service = new PartiesService(
    partiesRepository as never,
    {} as never,
    {} as never,
    identityAdapter as never
  );
  const identityActor = {
    ...actor,
    permissions: ["party:identity_update"]
  };

  await service.create(scope, identityActor, {
    party_type: "person",
    display_name: "Tenant",
    identity_document_type: "id_card",
    identity_number: "11010519491231002x"
  }, "legacy-key");

  assert.equal(saved[0]?.identityDocumentType, null);
  assert.equal(saved[0]?.identityNumberEncrypted, null);
  assert.equal(saved[0]?.identityNumberHash, null);
  assert.equal(saved[0]?.identityNumberMasked, null);
  assert.deepEqual(writes[0]?.slice(2, 6), [
    "party-1",
    "legacy-key",
    "id_card",
    "11010519491231002X"
  ]);
  assert.equal(writes[0]?.[6], transactionManager);
});

test("legacy identity mutation requires the new exact permission before persistence", async () => {
  const service = new PartiesService({
    create: () => {
      throw new Error("persistence must not run");
    }
  } as never, {} as never, {} as never);

  await assert.rejects(
    service.create(scope, actor, {
      party_type: "person",
      display_name: "Tenant",
      identity_document_type: "id_card",
      identity_number: "11010519491231002X"
    }),
    /party:identity_update/
  );
});

test("legacy verification uses only the canonical decision adapter", async () => {
  const decisions: unknown[][] = [];
  const identityAdapter = {
    decide: async (...args: unknown[]) => {
      decisions.push(args);
      return { id: "submission-1" };
    }
  };
  const service = new PartiesService(
    {
      manager: {
        transaction: async <T>(work: (manager: Record<string, never>) => Promise<T>) =>
          work({})
      }
    } as never,
    {} as never,
    {} as never,
    identityAdapter as never
  );
  Object.defineProperty(service, "detail", {
    value: async () => ({ id: "party-1" })
  });
  await service.verify(
    scope,
    { ...actor, permissions: ["party:identity_verify"] },
    "party-1",
    { verification_status: "verified" },
    "legacy-verify-key"
  );
  assert.deepEqual(decisions[0]?.slice(2, 6), [
    "party-1",
    "legacy-verify-key",
    "verified",
    undefined
  ]);
});

test("legacy profile and identity failure roll back through the same manager transaction", async () => {
  const committed: PartyEntity[] = [];
  const pending: PartyEntity[] = [];
  const transactionManager = {
    getRepository: () => ({
      save: async (value: PartyEntity) => {
        pending.push(value);
        return value;
      }
    })
  };
  const partiesRepository = {
    manager: {
      transaction: async <T>(work: (manager: typeof transactionManager) => Promise<T>) => {
        try {
          const result = await work(transactionManager);
          committed.push(...pending);
          return result;
        } finally {
          pending.length = 0;
        }
      }
    },
    create: (value: Record<string, unknown>) => ({ ...partyFixture(), ...value })
  };
  const identityAdapter = {
    writeDraft: async (...args: unknown[]) => {
      assert.equal(args.at(-1), transactionManager);
      throw new Error("identity command failed");
    }
  };
  const service = new PartiesService(
    partiesRepository as never,
    {} as never,
    {} as never,
    identityAdapter as never
  );

  await assert.rejects(
    service.create(
      scope,
      { ...actor, permissions: ["party:identity_update"] },
      {
        party_type: "person",
        display_name: "Atomic",
        identity_document_type: "id_card",
        identity_number: "11010519491231002X"
      },
      "atomic-key"
    ),
    /identity command failed/
  );
  assert.equal(committed.length, 0);
});
