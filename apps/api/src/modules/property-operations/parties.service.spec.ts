import assert from "node:assert/strict";
import test from "node:test";
import type { TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
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
