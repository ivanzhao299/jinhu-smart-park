import assert from "node:assert/strict";
import test from "node:test";
import { ApiError } from "../../lib/api-client";
import { hrLoadErrorMessage } from "./hr-errors";

test("HR employee context errors are presented as a Chinese business state", () => {
  assert.equal(
    hrLoadErrorMessage(new ApiError("No employee profile is linked to current user", 404), "加载失败"),
    "当前账号未关联员工档案，个人及团队事项暂不可用。"
  );
});

test("HR load errors preserve real service failures", () => {
  assert.equal(hrLoadErrorMessage(new ApiError("Database unavailable", 500), "加载失败"), "Database unavailable");
  assert.equal(hrLoadErrorMessage(null, "加载失败"), "加载失败");
});
