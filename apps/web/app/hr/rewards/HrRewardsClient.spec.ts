import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(join(__dirname, "HrRewardsClient.tsx"), "utf8");

test("reward evidence uses shared protected upload surfaces and exact permission intersections", () => {
  assert.match(source, /<FileUploader/);
  assert.match(source, /<AttachmentList/);
  assert.match(source, /bizType="hr_reward_evidence"/);
  for (const permission of [
    "HR_REWARD_READ",
    "HR_REWARD_DOCUMENT_READ",
    "HR_REWARD_DOCUMENT_MANAGE",
    "FILE_READ",
    "FILE_UPLOAD",
    "FILE_DELETE",
  ]) assert.match(source, new RegExp(permission));
  assert.match(source, /\["draft", "returned"\]\.includes\(detail\.status\)/);
  assert.match(source, /hrApi\.updateRewardCase/);
  assert.match(source, /保存修改/);
  assert.doesNotMatch(source, /输入 UUID|name="employeeId"|name="categoryId"/);
});
