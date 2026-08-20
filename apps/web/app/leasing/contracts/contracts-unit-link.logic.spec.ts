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
  assert.match(page, /CONTRACT_UNIT_REQUIRED_ERROR = "Contract must link at least one unit before submit"/);
  assert.match(page, /openContractDrawer\(row, "units"\)/);
  assert.match(page, /提交前必须先在“合同房源”中添加至少一个房源/);
  assert.match(page, /const canUpdateContract = hasPermission\(authUser, CONTRACT_PERMISSIONS\.update\)/);
  assert.match(page, /if \(editing && !canUpdateContract\)/);
  assert.match(page, /contractDetailTab === "profile" && canUpdateContract/);
  assert.match(page, /当前账号没有合同更新权限，基础信息仅供查看/);
  assert.match(page, /if \(editing\) \{[\s\S]*?setShowForm\(false\)/);
});

test("unit-linking step explains missing candidate units instead of leaving an empty selector", () => {
  const page = readFileSync(resolve(__dirname, "page.tsx"), "utf8");

  assert.match(page, /SYSTEM_PERMISSIONS\.UNIT_READ/);
  assert.match(page, /当前账号没有房源读取权限，无法加载可关联房源/);
  assert.match(page, /房源列表加载失败/);
  assert.match(page, /当前筛选范围暂无可关联房源，请调整楼栋、楼层、出租状态或联系管理员确认房源数据范围/);
  assert.match(page, /disabled=\{!unitForm\.relId && \(unitOptionsLoading \|\| Boolean\(unitOptionsLoadError\) \|\| unitOptions\.length === 0\)\}/);
  assert.match(page, /当前账号没有添加合同房源权限，无法完成提交前的房源关联/);
  assert.match(page, /当前账号没有查看合同房源权限，无法确认或添加提交所需房源/);
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
