import { ConflictException, NotFoundException } from "@nestjs/common";
import type { TenantParkScope } from "@jinhu/shared";
import type { EntityManager } from "typeorm";

export type PayrollPeriodContext = { id: string; month: string; start_date: string; end_date: string; status: string;
  correctionWindow?: { id: string; originalRunId: string; ruleSetId: string; inputHeadAtOpen: number } };

/** Internal transaction primitive. Callers authorize first and retain the period lock through writes. */
export async function lockPayrollPeriodContext(manager: EntityManager, scope: TenantParkScope, id: string, windowId?: string | null): Promise<PayrollPeriodContext> {
  const rows: PayrollPeriodContext[] = await manager.query("SELECT id,to_char(period_month,'YYYY-MM') AS month,to_char(start_date,'YYYY-MM-DD') AS start_date,to_char(end_date,'YYYY-MM-DD') AS end_date,status FROM hr_payroll_period WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND is_deleted=false FOR UPDATE", [id, scope.tenantId, scope.parkId]);
  if (rows.length !== 1) throw new NotFoundException("Payroll period not found");
  const period = rows[0]!;
  if (!windowId) {
    if (period.status !== "open") throw new ConflictException("Payroll period is closed; select its correction window");
    return period;
  }
  const windows: Array<{ id: string; original_run_id: string; rule_set_id: string; input_head_at_open: number }> = await manager.query("SELECT id,original_run_id,rule_set_id,input_head_at_open FROM hr_payroll_correction_window WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND period_id=$4 AND status='open' FOR UPDATE", [windowId, scope.tenantId, scope.parkId, id]);
  if (period.status !== "closed" || windows.length !== 1) throw new ConflictException("Payroll correction window changed or closed");
  const window = windows[0]!;
  return { ...period, correctionWindow: { id: window.id, originalRunId: window.original_run_id, ruleSetId: window.rule_set_id, inputHeadAtOpen: window.input_head_at_open } };
}

export async function assertPayrollCorrectionRoster(manager: EntityManager, scope: TenantParkScope, period: PayrollPeriodContext, ruleSetId: string, employeeIds?: string[]) {
  if (!period.correctionWindow) return;
  if (period.correctionWindow.ruleSetId !== ruleSetId) throw new ConflictException("Correction must use its original payroll rule set");
  if (!employeeIds) return;
  const originals: Array<{ employee_id: string }> = await manager.query("SELECT employee_id FROM hr_payslip WHERE run_id=$1 AND tenant_id=$2 AND park_id=$3 AND NOT is_deleted ORDER BY employee_id FOR SHARE", [period.correctionWindow.originalRunId, scope.tenantId, scope.parkId]);
  if (JSON.stringify(originals.map(row => row.employee_id)) !== JSON.stringify([...employeeIds].sort())) throw new ConflictException("Correction must preserve its original employee roster");
}
