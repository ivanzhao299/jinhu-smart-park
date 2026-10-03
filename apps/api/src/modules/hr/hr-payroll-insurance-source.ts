import { ConflictException } from "@nestjs/common";
import type { TenantParkScope } from "@jinhu/shared";
import type { EntityManager } from "typeorm";
import type { HrPayrollInsuranceSourceDto } from "./dto/hr-payroll-history.dto";
import type { PayrollInsuranceAmountFact } from "./hr-payroll-insurance-input";

export type ModernPayrollInsuranceSource = {
  id: string; employeeId: string; revisionNo: number; snapshotHash: string;
  items: PayrollInsuranceAmountFact[];
};

/** All choices must describe exactly the employees being calculated. */
export function assertPayrollInsuranceChoices(employeeIds: string[], choices: HrPayrollInsuranceSourceDto[]): void {
  const expected = new Set(employeeIds);
  if (choices.length !== expected.size || new Set(choices.map(choice => choice.employeeId)).size !== choices.length
    || choices.some(choice => !expected.has(choice.employeeId))) {
    throw new ConflictException("Explicit insurance sources must cover exactly the payroll employees");
  }
  if (choices.some(choice => choice.sourceKind === "historical" && choice.expectedHash !== undefined)) {
    throw new ConflictException("Historical insurance sources use their recorded version");
  }
}

export async function lockModernPayrollInsuranceSources(
  manager: EntityManager, scope: TenantParkScope, periodMonth: string,
  choices: HrPayrollInsuranceSourceDto[],
): Promise<Map<string, ModernPayrollInsuranceSource>> {
  const result = new Map<string, ModernPayrollInsuranceSource>();
  // Match the database guard's jsonb key, including date/UUID serialization.
  for (const choice of choices.filter(choice => choice.sourceKind === "modern_confirmed")
    .sort((a, b) => a.employeeId.localeCompare(b.employeeId))) {
    await manager.query("SELECT pg_advisory_xact_lock(hashtextextended(jsonb_build_array('insurance-owned-family',$1::text,$2::text,$3::uuid,$4::date)::text,0))",
      [scope.tenantId, scope.parkId, choice.employeeId, periodMonth]);
    const rows = await manager.query(`SELECT r.id,r.employee_id,r.revision_no,p.snapshot_sha256,p.result
      FROM hr_insurance_owned_revision r JOIN hr_insurance_owned_preview p
        ON p.id=r.preview_id AND p.tenant_id=r.tenant_id AND p.park_id=r.park_id
      WHERE r.tenant_id=$1 AND r.park_id=$2 AND r.id=$3 AND r.employee_id=$4 AND r.period_month=$5::date
        AND NOT EXISTS(SELECT 1 FROM hr_insurance_owned_revision newer
          WHERE newer.tenant_id=r.tenant_id AND newer.park_id=r.park_id AND newer.employee_id=r.employee_id
            AND newer.period_month=r.period_month AND newer.revision_no>r.revision_no)
      FOR UPDATE OF r FOR SHARE OF p`, [scope.tenantId, scope.parkId, choice.sourceId, choice.employeeId, periodMonth]) as Array<{
        id: string; employee_id: string; revision_no: number; snapshot_sha256: string;
        result: { items: Array<{ insuranceKind: string; amounts: { base: string; employer: string; employee: string; supplement: string } }> };
      }>;
    const row = rows[0];
    if (rows.length !== 1 || !row || row.revision_no !== choice.expectedVersion || row.snapshot_sha256 !== choice.expectedHash) {
      throw new ConflictException("Selected modern insurance revision is stale, foreign or changed");
    }
    result.set(choice.employeeId, {
      id: row.id, employeeId: row.employee_id, revisionNo: row.revision_no, snapshotHash: row.snapshot_sha256,
      items: row.result.items.map(item => ({ insuranceKind: item.insuranceKind,
        totalAmount: item.amounts.base, employerAmount: item.amounts.employer,
        employeeAmount: item.amounts.employee, supplementAmount: item.amounts.supplement })),
    });
  }
  return result;
}
