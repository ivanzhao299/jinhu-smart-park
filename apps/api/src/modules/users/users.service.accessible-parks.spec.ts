import assert from "node:assert/strict";
import test from "node:test";
import { UsersService } from "./users.service";
import type { RoleEntity } from "../roles/entities/role.entity";
import type { UserRoleEntity } from "../roles/entities/user-role.entity";

type ResolveAccessibleParks = (
  userId: string,
  tenantId: string,
  options?: { activeOnly?: boolean; homeParkId?: string; isTenantSuper?: boolean; roleLinks?: UserRoleEntity[] }
) => Promise<Array<{ park_id: string; park_name: string; status: string }>>;

const resolveAccessibleParks = (UsersService.prototype as unknown as {
  resolveAccessibleParks: ResolveAccessibleParks;
}).resolveAccessibleParks;
const attachParkRoleSummaries = (UsersService.prototype as unknown as {
  attachParkRoleSummaries: (
    parks: Array<{ park_id: string; park_name: string; is_default: boolean; status: string }>,
    tenantId: string,
    roleLinks: UserRoleEntity[]
  ) => Array<{ park_id: string; role_summary?: { role_names: string[]; role_count: number; has_business_role: boolean } }>;
}).attachParkRoleSummaries;

test("accessible park summaries distinguish role-bearing and access-only parks", () => {
  const role = {
    code: "PARK_OPERATOR",
    name: "园区运营",
    tenantId: "tenant-a",
    parkId: "park-a",
    roleScope: "park",
    status: "enabled",
    isEnabled: true,
    isDeleted: false
  } as RoleEntity;
  const parks = attachParkRoleSummaries.call({}, [
    { park_id: "park-a", park_name: "园区 A", is_default: true, status: "enabled" },
    { park_id: "park-b", park_name: "园区 B", is_default: false, status: "enabled" }
  ], "tenant-a", [{ tenantId: "tenant-a", parkId: "park-a", isDeleted: false, role } as UserRoleEntity]);

  assert.deepEqual(parks[0]?.role_summary, {
    role_names: ["园区运营"],
    role_count: 1,
    has_business_role: true
  });
  assert.deepEqual(parks[1]?.role_summary, {
    role_names: [],
    role_count: 0,
    has_business_role: false
  });
});

test("protected tenant super sees every live tenant park without per-park access links", async () => {
  let accessReads = 0;
  const parkQueries: unknown[] = [];
  const service = {
    userParkRepository: {
      find: async () => {
        accessReads += 1;
        return [];
      }
    },
    parksRepository: {
      find: async (options: unknown) => {
        parkQueries.push(options);
        return [
          { tenantId: "tenant-a", parkId: "park-home", parkCode: "HOME", parkName: "初始园区", status: 1 },
          { tenantId: "tenant-a", parkId: "park-future", parkCode: "FUTURE", parkName: "未来园区", status: 1 }
        ];
      }
    }
  };

  const parks = await resolveAccessibleParks.call(service, "user-a", "tenant-a", {
    homeParkId: "park-home",
    isTenantSuper: true
  });

  assert.equal(accessReads, 0);
  assert.deepEqual(parkQueries, [{
    where: { tenantId: "tenant-a", status: 1, isDeleted: false },
    order: { createTime: "ASC" }
  }]);
  assert.deepEqual(parks.map((park) => park.park_id), ["park-home", "park-future"]);
});

test("accessible parks use only current-tenant links and add the exact active home park", async () => {
  const linkQueries: unknown[] = [];
  const service = {
    userParkRepository: {
      find: async (options: unknown) => {
        linkQueries.push(options);
        return [];
      },
      findOne: async () => null
    },
    parksRepository: {
      find: async () => [{
        tenantId: "tenant-a",
        parkId: "park-home",
        parkCode: "HOME",
        parkName: "真实园区名称",
        status: 1
      }]
    }
  };

  const parks = await resolveAccessibleParks.call(service, "user-a", "tenant-a", { homeParkId: "park-home" });

  assert.equal(linkQueries.length, 1);
  assert.deepEqual(linkQueries[0], {
    where: { tenantId: "tenant-a", userId: "user-a", isDeleted: false, status: "enabled" },
    order: { isDefault: "DESC", createTime: "ASC" }
  });
  assert.deepEqual(parks, [{
    tenant_id: "tenant-a",
    park_id: "park-home",
    park_code: "HOME",
    park_name: "真实园区名称",
    is_default: true,
    status: "enabled"
  }]);
});

test("an inactive or deleted home park is not projected into the authenticated context", async () => {
  const parkQueries: Array<{ where?: { status?: number } }> = [];
  const service = {
    userParkRepository: { find: async () => [], findOne: async () => null },
    parksRepository: {
      find: async (options: { where?: { status?: number } }) => {
        parkQueries.push(options);
        return [];
      }
    }
  };

  assert.deepEqual(
    await resolveAccessibleParks.call(service, "user-a", "tenant-a", { homeParkId: "park-home" }),
    []
  );
  assert.equal(parkQueries[0]?.where?.status, 1);
});

test("cross-tenant links never widen the current tenant and an explicit home link is not duplicated", async () => {
  const parkQueries: Array<{ where: { tenantId: string; parkId: unknown } }> = [];
  const service = {
    userParkRepository: {
      find: async () => [{
        tenantId: "tenant-a",
        parkId: "park-home",
        isDefault: true
      }, {
        tenantId: "tenant-b",
        parkId: "park-foreign",
        isDefault: true
      }],
      findOne: async () => {
        throw new Error("active home relation must not trigger legacy fallback lookup");
      }
    },
    parksRepository: {
      find: async (options: { where: { tenantId: string; parkId: unknown } }) => {
        parkQueries.push(options);
        return [{
          tenantId: "tenant-a",
          parkId: "park-home",
          parkCode: "HOME",
          parkName: "当前租户园区",
          status: 1
        }];
      }
    }
  };

  const parks = await resolveAccessibleParks.call(service, "shared-user-id", "tenant-a", {
    homeParkId: "park-home"
  });

  assert.equal(parkQueries[0]?.where.tenantId, "tenant-a");
  assert.deepEqual(parks.map((park) => park.park_id), ["park-home"]);
  assert.equal(parks.filter((park) => park.park_id === "park-home").length, 1);
  assert.equal(parks.some((park) => park.park_id === "park-foreign"), false);
});

test("a disabled or deleted explicit home relation suppresses legacy home projection", async () => {
  for (const explicitRelation of [
    { tenantId: "tenant-a", userId: "user-a", parkId: "park-home", status: "disabled", isDeleted: false },
    { tenantId: "tenant-a", userId: "user-a", parkId: "park-home", status: "enabled", isDeleted: true }
  ]) {
    const exactQueries: unknown[] = [];
    let parkReads = 0;
    const service = {
      userParkRepository: {
        find: async () => [],
        findOne: async (options: unknown) => {
          exactQueries.push(options);
          return explicitRelation;
        }
      },
      parksRepository: {
        find: async () => {
          parkReads += 1;
          return [];
        }
      }
    };

    assert.deepEqual(
      await resolveAccessibleParks.call(service, "user-a", "tenant-a", { homeParkId: "park-home" }),
      []
    );
    assert.deepEqual(exactQueries, [{
      where: { tenantId: "tenant-a", userId: "user-a", parkId: "park-home" }
    }]);
    assert.equal(parkReads, 0);
  }
});
