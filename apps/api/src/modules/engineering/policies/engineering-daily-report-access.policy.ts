import { ForbiddenException, Injectable } from "@nestjs/common";

export const EngineeringDailyReportPermission = {
  VIEW: "ENGINEERING_DAILY_REPORT_VIEW",
  CREATE: "ENGINEERING_DAILY_REPORT_CREATE",
  UPDATE: "ENGINEERING_DAILY_REPORT_UPDATE",
  DELETE: "ENGINEERING_DAILY_REPORT_UPDATE",
  SUBMIT: "ENGINEERING_DAILY_REPORT_SUBMIT",
  REVIEW: "ENGINEERING_DAILY_REPORT_REVIEW"
} as const;

export type EngineeringDailyReportPermissionValue =
  (typeof EngineeringDailyReportPermission)[keyof typeof EngineeringDailyReportPermission];

export interface EngineeringDailyReportPermissionContext {
  actorPermissions?: string[];
}

@Injectable()
export class EngineeringDailyReportAccessPolicy {
  assertPermission(permission: EngineeringDailyReportPermissionValue, context: EngineeringDailyReportPermissionContext): void {
    const permissions = context.actorPermissions ?? [];
    if (permissions.includes("*")) {
      return;
    }
    if (!permissions.includes(permission)) {
      throw new ForbiddenException(`Missing permission ${permission}`);
    }
  }
}
