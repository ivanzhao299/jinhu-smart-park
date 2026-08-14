import assert from "node:assert/strict";
import test from "node:test";
import { UsersService } from "./users.service";

type ResolveAccessibleParks = (
  userId: string,
  tenantId: string,
  options?: { activeOnly?: boolean; homeParkId?: string }
) => Promise<Array<{ park_id: string; park_name: string; status: string }>>;

const resolveAccessibleParks = (UsersService.prototype as unknown as {
  resolveAccessibleParks: ResolveAccessibleParks;
}).resolveAccessibleParks;

test("accessible parks use only current-tenant links and add the exact active home park", async () => {
  const linkQueries: unknown[] = [];
  const service = {
    userParkRepository: {
      find: async (options: unknown) => {
        linkQueries.push(options);
        return [];
      }
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
    userParkRepository: { find: async () => [] },
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
      }]
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
