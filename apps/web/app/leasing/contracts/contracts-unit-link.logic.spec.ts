import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("new contract drafts continue directly into the unit-linking step", () => {
  const page = readFileSync(resolve(__dirname, "page.tsx"), "utf8");

  assert.match(page, /保存基础信息后将自动进入“合同房源”步骤；至少关联一个房源后才能提交/);
  assert.match(page, /const response = await apiRequest<LeasingContractRow>\(path/);
  assert.match(page, /setEditing\(response\.data\)/);
  assert.match(page, /setContractDetailTab\("units"\)/);
  assert.match(page, /合同草稿已创建，请关联至少一个房源后再提交/);
  assert.match(page, /await loadContractUnits\(response\.data\.id\)/);
  assert.match(page, /const canUpdateContract = hasPermission\(authUser, CONTRACT_PERMISSIONS\.update\)/);
  assert.match(page, /if \(editing && !canUpdateContract\)/);
  assert.match(page, /contractDetailTab === "profile" && canUpdateContract/);
  assert.match(page, /当前账号没有合同更新权限，基础信息仅供查看/);
  assert.match(page, /if \(editing\) \{[\s\S]*?setShowForm\(false\)/);
});

test("contract-creating production roles can read and create contract unit links", () => {
  const seed = readFileSync(
    resolve(__dirname, "../../../../../database/seeds/000001_s1_production_core.sql"),
    "utf8"
  );

  for (const role of ["OPERATIONS_OWNER", "INVEST_MANAGER", "INVEST_SPECIALIST"]) {
    assert.match(seed, new RegExp(`\\('${role}', 'leasing_contract:create'\\)`));
    assert.match(seed, new RegExp(`\\('${role}', 'leasing_contract_unit:read'\\)`));
    assert.match(seed, new RegExp(`\\('${role}', 'leasing_contract_unit:create'\\)`));
  }
});
