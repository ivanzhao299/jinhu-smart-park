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

test("HR load errors do not expose database or internal service details", () => {
  assert.equal(hrLoadErrorMessage(new ApiError("Database unavailable", 500), "加载失败"), "加载失败");
  assert.equal(
    hrLoadErrorMessage(new ApiError('bind message supplies 5 parameters, but prepared statement "" requires 4', 500), "加载失败"),
    "加载失败",
  );
  assert.equal(hrLoadErrorMessage(new ApiError("业务状态冲突", 409), "加载失败"), "业务状态冲突");
  assert.equal(hrLoadErrorMessage(null, "加载失败"), "加载失败");
});
