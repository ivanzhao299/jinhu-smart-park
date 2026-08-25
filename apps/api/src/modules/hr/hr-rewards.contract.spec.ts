import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
const root = join(__dirname, "../../../../.."),
  read = (p: string) => readFileSync(join(root, p), "utf8");
test("reward schema freezes category and submitted facts with append-only action correction link", () => {
  const sql = read(
    "database/migrations/000255_hr_reward_discipline_operations.sql",
  );
  for (const table of [
    "hr_reward_discipline_category",
    "hr_reward_discipline_category_version",
    "hr_reward_discipline_case",
    "hr_reward_discipline_action",
    "hr_reward_discipline_correction",
    "hr_reward_discipline_link",
  ])
    assert.match(sql, new RegExp(`CREATE TABLE ${table}`));
  for (const marker of [
    "numeric(20,4)",
    "submitted reward facts are immutable",
    "terminal reward case is immutable",
    "invalid reward case transition",
    "hr_reward_action_immutable",
    "hr_reward_correction_immutable",
    "hr_reward_link_immutable",
    "reward evidence file owner mismatch",
    "referenced reward evidence is immutable",
    "invalid reward category version pointer",
  ])
    assert.match(sql, new RegExp(marker.replace(/[().]/g, "\\$&")));
  for (const fk of [
    "FOREIGN KEY(tenant_id,park_id,employee_id)",
    "FOREIGN KEY(tenant_id,park_id,category_id,category_version_id)",
    "FOREIGN KEY(tenant_id,park_id,case_id)",
  ])
    assert.match(sql, new RegExp(fk.replace(/[()]/g, "\\$&")));
});
test("reward writes are replay-aware body-free and service fails closed", () => {
  const controller = read("apps/api/src/modules/hr/hr-rewards.controller.ts"),
    service = read("apps/api/src/modules/hr/hr-rewards.service.ts"),
    writes = (controller.match(/@(Post|Put)\(/g) ?? []).length;
  assert.equal(
    writes,
    (controller.match(/new IdempotencyInterceptor/g) ?? []).length,
  );
  assert.equal(
    writes,
    (controller.match(/captureBody:\s*false/g) ?? []).length,
  );
  for (const atom of [
    "HR_REWARD_MANAGE",
    "HR_REWARD_REVIEW",
    "HR_REWARD_SELF_READ",
    "HR_REWARD_TEAM_READ",
    "HR_REWARD_AMOUNT_READ",
    "HR_REWARD_LINK_PAYROLL",
    "HR_REWARD_LINK_PERFORMANCE",
  ])
    assert.match(service + controller, new RegExp(atom));
  assert.match(service, /FOR UPDATE OF c/);
  assert.match(service, /Self review is not allowed/);
  assert.match(service, /managed_org/);
  assert.match(service, /recordHrSensitiveRead/);
  assert.match(service, /HR_REWARD_REASON_READ/);
  assert.match(service, /HR_REWARD_DOCUMENT_MANAGE/);
  assert.match(service, /hr_attendance_payroll_input_item/);
  assert.match(service, /i\.employee_id=\$5/);
  assert.match(service, /employee_id=\$5[\s\S]*status IN\('draft','self_review','manager_review','calibrating'\)/);
  assert.match(service, /INSERT INTO biz_user_message/);
  assert.match(
    service,
    /ON CONFLICT\(tenant_id,park_id,recipient_id,unique_key\)/,
  );
  assert.doesNotMatch(
    service,
    /INSERT INTO hr_payroll_run|UPDATE hr_payroll_run|INSERT INTO hr_payslip|UPDATE hr_payslip|INSERT INTO hr_performance_item|UPDATE hr_performance_plan|UPDATE hr_employee SET/,
  );
});
test("least privilege seed and protected evidence do not leak amount reason or documents", () => {
  const seed = read("database/seeds/production/000022_hr_rewards_rbac.sql"),
    access = read("apps/api/src/modules/files/file-business-access.service.ts"),
    files = read("apps/api/src/modules/files/files.service.ts");
  assert.match(seed, /DEPARTMENT_MANAGER','hr:reward:team_read/);
  assert.match(seed, /DEPARTMENT_MANAGER','hr:reward:review/);
  assert.match(seed, /EMPLOYEE_SELF_SERVICE','hr:reward:self_read/);
  for (const atom of [
    "hr:reward_amount:read",
    "hr:reward_reason:read",
    "hr:reward_document:read",
    "hr:reward:link_payroll",
  ]) {
    assert.doesNotMatch(seed, new RegExp(`DEPARTMENT_MANAGER','${atom}`));
    assert.doesNotMatch(seed, new RegExp(`EMPLOYEE_SELF_SERVICE','${atom}`));
  }
  assert.match(access, /hr_reward_evidence/);
  assert.match(access, /HR_REWARD_DOCUMENT_MANAGE/);
  assert.match(access, /HR_REWARD_DOCUMENT_READ/);
  assert.match(files, /读取奖惩证据列表/);
  assert.match(files, /下载奖惩证据/);
  assert.match(access, /HR_REWARD_MANAGE[\s\S]*HR_REWARD_READ/);
  assert.match(access, /Reward evidence can only change while the case is draft or returned/);
});
test("web reward workbench has readable selectors paging cancellation and mobile records", () => {
  const page = read("apps/web/app/hr/rewards/HrRewardsClient.tsx"),
    api = read("apps/web/lib/hr-api.ts"),
    menu = read("apps/web/lib/menu.ts");
  for (const atom of [
    "HR_REWARDS_PAGE",
    "HR_REWARD_READ",
    "HR_REWARD_TEAM_READ",
    "HR_REWARD_SELF_READ",
    "HR_REWARD_AMOUNT_READ",
  ])
    assert.match(page, new RegExp(atom));
  assert.match(page, /ds-mobile-record-list/);
  assert.match(page, /listAbort\.current\?\.abort/);
  assert.match(page, /detailAbort\.current\?\.abort/);
  assert.match(page, /generation\.current/);
  assert.match(page, /employees\.map/);
  assert.match(page, /categories\.map/);
  assert.match(page, /step="0\.0001"/);
  assert.doesNotMatch(page, /tenantId|parkId|输入 UUID/);
  assert.match(api, /rewardCases/);
  assert.match(menu, /"\/hr\/rewards"/);
});
