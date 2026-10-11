import { BadRequestException, ConflictException } from "@nestjs/common";
import type { TenantParkScope } from "@jinhu/shared";
import type { EntityManager } from "typeorm";

export interface LeaveTypeSnapshot {
 leaveTypeId: string | null;
 leaveTypeVersion: number | null;
 leaveTypeName: string | null;
}
export interface LeaveTypeSelection {
 requestType: string;
 leaveTypeId?: string | null;
 expectedLeaveTypeVersion?: number;
}

/** Omission preserves an edited request; explicit null clears classification.
 * An unchanged frozen choice remains usable even after the type is disabled.
 */
export async function resolveLeaveTypeSelection(m: EntityManager, s: TenantParkScope, d: LeaveTypeSelection, before?: LeaveTypeSnapshot): Promise<LeaveTypeSnapshot> {
 if (d.leaveTypeId === undefined) {
  if (d.expectedLeaveTypeVersion !== undefined) throw new BadRequestException("请同时选择假期类型与版本。");
  return before ?? { leaveTypeId: null, leaveTypeVersion: null, leaveTypeName: null };
 }
 if (d.requestType !== "leave") throw new BadRequestException("仅请假申请可以指定假期类型。");
 if (d.leaveTypeId === null) {
  if (d.expectedLeaveTypeVersion !== undefined) throw new BadRequestException("清除假期类型时不能指定版本。");
  return { leaveTypeId: null, leaveTypeVersion: null, leaveTypeName: null };
 }
 if (!Number.isInteger(d.expectedLeaveTypeVersion) || d.expectedLeaveTypeVersion! < 1) throw new BadRequestException("请选择明确的假期类型版本。");
 if (before?.leaveTypeId === d.leaveTypeId && before.leaveTypeVersion === d.expectedLeaveTypeVersion) return before;
 const [row] = await m.query("SELECT id,type_name name,version,enabled FROM hr_attendance_leave_type WHERE tenant_id=$1 AND park_id=$2 AND id=$3 FOR SHARE", [s.tenantId, s.parkId, d.leaveTypeId]) as Array<{ id: string; name: string; version: number; enabled: boolean }>;
 if (!row || !row.enabled || row.version !== d.expectedLeaveTypeVersion) throw new ConflictException("假期类型已变更或停用，请重新选择。");
 return { leaveTypeId: row.id, leaveTypeVersion: row.version, leaveTypeName: row.name };
}
