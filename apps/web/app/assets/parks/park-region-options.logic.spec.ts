import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getCityOptions,
  getDistrictOptions,
  getProvinceOptions
} from "./park-region-options";

describe("park region cascading options", () => {
  it("limits cities and districts to the selected parents", () => {
    const shandongCities = getCityOptions("山东省").map((option) => option.value);
    assert.ok(shandongCities.includes("临沂市"));
    assert.equal(shandongCities.includes("杭州市"), false);

    const linyiDistricts = getDistrictOptions("山东省", "临沂市").map((option) => option.value);
    assert.ok(linyiDistricts.includes("兰山区"));
    assert.equal(linyiDistricts.includes("西湖区"), false);
  });

  it("keeps unknown persisted values visible only as historical options", () => {
    assert.deepEqual(getProvinceOptions("旧省份")[0], {
      value: "旧省份",
      label: "旧省份（历史值）",
      legacy: true
    });
    assert.deepEqual(getCityOptions("旧省份", "旧城市")[0], {
      value: "旧城市",
      label: "旧城市（历史值）",
      legacy: true
    });
  });

  it("includes every supported province-level region", () => {
    const provinces = getProvinceOptions().map((option) => option.value);
    assert.equal(provinces.length, 34);
    assert.ok(provinces.includes("台湾省"));
    assert.ok(provinces.includes("香港特别行政区"));
    assert.ok(provinces.includes("澳门特别行政区"));
    assert.ok(getDistrictOptions("香港特别行政区", "香港特别行政区").some((option) => option.value === "中西区"));
    assert.ok(getDistrictOptions("澳门特别行政区", "澳门特别行政区").some((option) => option.value === "花地玛堂区"));
  });
});
