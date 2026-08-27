import { ApiError } from "../../lib/api-client";

const MISSING_EMPLOYEE_CONTEXT = "No employee profile is linked to current user";
const INTERNAL_ERROR_PATTERNS = [
  /bind message supplies \d+ parameters/i,
  /prepared statement/i,
  /database unavailable/i,
  /query failed/i,
  /syntax error at or near/i,
];

export function hrLoadErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.status === 404 && error.message === MISSING_EMPLOYEE_CONTEXT) {
    return "当前账号未关联员工档案，个人及团队事项暂不可用。";
  }
  if (
    error instanceof ApiError &&
    (error.status >= 500 || INTERNAL_ERROR_PATTERNS.some((pattern) => pattern.test(error.message)))
  ) {
    return fallback;
  }
  return error instanceof Error ? error.message : fallback;
}
