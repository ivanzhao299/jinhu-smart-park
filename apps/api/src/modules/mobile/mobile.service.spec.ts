import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MOBILE_BOOTSTRAP_CONTRACT_VERSION,
  projectMobileCapabilities,
  type UserContext
} from "@jinhu/shared";
import { MobileService } from "./mobile.service";
import { MobileController } from "./mobile.controller";
import { AUTHENTICATED_ONLY_KEY } from "../../shared/decorators/permissions.decorator";

function subject(overrides: Partial<Pick<UserContext, "roles" | "permissions" | "enabled_modules" | "is_super">> = {}) {
  return {
    roles: [],
    permissions: [],
    enabled_modules: [],
    is_super: false,
    ...overrides
  };
}

describe("mobile capability projection", () => {
  it("projects employee inspection capabilities only when safety is enabled", () => {
    const enabled = projectMobileCapabilities(subject({
      permissions: ["safety_inspect_task:my", "safety_inspect_task:start"],
      enabled_modules: [{ module_code: "safety", module_name: "安全", module_group: "operations", enabled: true }]
    }));
    assert.deepEqual(enabled.portals, ["employee"]);
    assert.deepEqual(enabled.capabilities, [
      "employee.home.view",
      "employee.inspection.execute",
      "employee.inspection.view"
    ]);

    const disabled = projectMobileCapabilities(subject({
      permissions: ["safety_inspect_task:my", "safety_inspect_task:start"],
      is_super: true
    }));
    assert.deepEqual(disabled, { portals: [], capabilities: [] });
  });

  it("requires an owner identity in addition to workorder permissions", () => {
    const enabledModule = [{ module_code: "workorder", module_name: "工单", module_group: "operations", enabled: true }];
    const employee = projectMobileCapabilities(subject({
      permissions: ["workorder:read", "workorder:create"],
      enabled_modules: enabledModule
    }));
    assert.deepEqual(employee.portals, []);
    assert.ok(!employee.capabilities.includes("owner.service.create"));

    const owner = projectMobileCapabilities(subject({
      roles: [{ role_code: "TENANT_USER", role_name: "租户用户" }],
      permissions: ["workorder:read", "workorder:create"],
      enabled_modules: enabledModule
    }));
    assert.deepEqual(owner.portals, ["owner"]);
    assert.ok(owner.capabilities.includes("owner.service.create"));
    assert.ok(owner.capabilities.includes("owner.service.view"));
  });

  it("keeps capability output unique and stable for wildcard dual-portal users", () => {
    const projection = projectMobileCapabilities(subject({
      roles: [{ role_code: "PARK_TENANT", role_name: "园区租户" }],
      permissions: ["*"],
      enabled_modules: [
        { module_code: "workorder", module_name: "工单", module_group: "operations", enabled: true },
        { module_code: "safety", module_name: "安全", module_group: "operations", enabled: true }
      ]
    }));
    assert.deepEqual(projection.portals, ["employee", "owner"]);
    assert.deepEqual(projection.capabilities, [...projection.capabilities].sort());
    assert.equal(new Set(projection.capabilities).size, projection.capabilities.length);
  });
});

describe("MobileService", () => {
  it("requires authentication on the bootstrap endpoint", () => {
    assert.equal(
      Reflect.getMetadata(AUTHENTICATED_ONLY_KEY, MobileController.prototype.bootstrap),
      true
    );
  });

  it("returns the versioned minimal bootstrap projection", async () => {
    const context = {
      id: "user-1",
      username: "owner",
      real_name: "业主用户",
      mobile: null,
      email: null,
      tenant_id: "tenant-1",
      park_id: "park-1",
      current_park: null,
      accessible_parks: [],
      org_id: null,
      org_name: null,
      roles: [{ role_code: "TENANT_USER", role_name: "租户用户" }],
      permissions: ["workorder:create"],
      data_scope: "self",
      enabled_modules: [{ module_code: "workorder", module_name: "工单", module_group: "operations", enabled: true }],
      is_super: false
    } satisfies UserContext;
    const service = new MobileService({ getCurrentUserContext: async () => context } as never);

    const result = await service.bootstrap({ tenantId: "tenant-1", parkId: "park-1" }, "user-1");
    assert.equal(result.contract_version, MOBILE_BOOTSTRAP_CONTRACT_VERSION);
    assert.deepEqual(result.portals, ["owner"]);
    assert.ok(result.capabilities.includes("owner.service.create"));
    assert.equal("permissions" in result.user, false);
    assert.equal("mobile" in result.user, false);
  });
});
