import assert from "node:assert/strict";
import test from "node:test";
import type { UserContext } from "@jinhu/shared";
import {
  clearParkRoleRecoverySource,
  isCurrentParkAccessOnly,
  readParkRoleRecoverySource,
  updateParkRoleRecoverySource
} from "./park-role-recovery";

const values = new Map<string, string>();
const storage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); }
};
Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: storage });

function user(parkId: string, roleState: Record<string, boolean | undefined>): UserContext {
  const parks = Object.entries(roleState).map(([id, hasBusinessRole]) => ({
    park_id: id,
    park_name: `园区-${id}`,
    is_default: id === "park-a",
    status: "enabled",
    ...(hasBusinessRole === undefined ? {} : {
      role_summary: { role_names: [], role_count: hasBusinessRole ? 1 : 0, has_business_role: hasBusinessRole }
    })
  }));
  return {
    id: "user-1",
    tenant_id: "tenant-1",
    park_id: parkId,
    current_park: parks.find((park) => park.park_id === parkId) ?? null,
    accessible_parks: parks,
    roles: [],
    permissions: [],
    data_scope: "self",
    is_super: false
  } as unknown as UserContext;
}

test.beforeEach(() => values.clear());

test("classifies only an explicit false role summary as access-only", () => {
  assert.equal(isCurrentParkAccessOnly(user("park-b", { "park-a": true, "park-b": false })), true);
  assert.equal(isCurrentParkAccessOnly(user("park-b", { "park-a": true, "park-b": undefined })), false);
  assert.equal(isCurrentParkAccessOnly(user("park-a", { "park-a": true })), false);
});

test("records the previous enabled park for an access-only target and survives a reload", () => {
  const previous = user("park-a", { "park-a": true, "park-b": false });
  const next = user("park-b", { "park-a": true, "park-b": false });
  const source = updateParkRoleRecoverySource(previous, next);

  assert.deepEqual(source, {
    userId: "user-1",
    tenantId: "tenant-1",
    parkId: "park-a",
    parkName: "园区-park-a"
  });
  assert.deepEqual(readParkRoleRecoverySource(next), source);
});

test("does not offer a return action when the source park was also access-only", () => {
  assert.equal(updateParkRoleRecoverySource(
    user("park-a", { "park-a": false, "park-b": false }),
    user("park-b", { "park-a": false, "park-b": false })
  ), null);
});

test("clears stale recovery state after role configuration or identity mismatch", () => {
  const previous = user("park-a", { "park-a": true, "park-b": false });
  const accessOnly = user("park-b", { "park-a": true, "park-b": false });
  updateParkRoleRecoverySource(previous, accessOnly);

  const configured = user("park-b", { "park-a": true, "park-b": true });
  assert.equal(updateParkRoleRecoverySource(accessOnly, configured), null);
  assert.equal(readParkRoleRecoverySource(accessOnly), null);

  updateParkRoleRecoverySource(previous, accessOnly);
  const anotherUser = { ...accessOnly, id: "user-2" };
  assert.equal(readParkRoleRecoverySource(anotherUser), null);
});

test("clears a restored source after its business role is removed", () => {
  const previous = user("park-a", { "park-a": true, "park-b": false });
  const accessOnly = user("park-b", { "park-a": true, "park-b": false });
  updateParkRoleRecoverySource(previous, accessOnly);

  assert.equal(readParkRoleRecoverySource(
    user("park-b", { "park-a": false, "park-b": false })
  ), null);
});

test("explicit clear removes the tab-scoped recovery source", () => {
  updateParkRoleRecoverySource(
    user("park-a", { "park-a": true, "park-b": false }),
    user("park-b", { "park-a": true, "park-b": false })
  );
  clearParkRoleRecoverySource();
  assert.equal(readParkRoleRecoverySource(user("park-b", { "park-a": true, "park-b": false })), null);
});
