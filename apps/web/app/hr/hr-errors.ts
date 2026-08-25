import { ApiError } from "../../lib/api-client";

const MISSING_EMPLOYEE_CONTEXT = "No employee profile is linked to current user";

export function hrLoadErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.status === 404 && error.message === MISSING_EMPLOYEE_CONTEXT) {
    return "当前账号未关联员工档案，个人及团队事项暂不可用。";
  }
  return error instanceof Error ? error.message : fallback;
}
