import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildHousingTenantCreateBody } from "./housing-tenant-create.logic";

describe("housing tenant create request", () => {
  it("omits the source domain owned by HousingTenantService", () => {
    const form = new FormData();
    form.set("display_name", "测试租客");
    form.set("mobile", "13800000000");

    const body = buildHousingTenantCreateBody(form);
    assert.deepEqual(body, {
      party_type: "person",
      display_name: "测试租客",
      mobile: "13800000000"
    });
    assert.equal(Object.hasOwn(body, "source_domain"), false);
  });
});
