import { ConflictException } from "@nestjs/common";
import type { FormalPayrollDefinition, FormalPayrollEmployeeInput } from "@jinhu/shared";
import { calculateFormalPayroll, buildFormalPayrollDefinitionEvidence } from "./hr-payroll-formal-calculation";
import { projectPayrollCompensationInputs, type PayrollCompensationSegment } from "./hr-payroll-compensation-input";
import { resolvePayrollEligibility } from "./hr-payroll-eligibility";
import { projectPayrollInsuranceInputs, type PayrollInsuranceAmountFact, HR_PAYROLL_INSURANCE_REFERENCE_CODES } from "./hr-payroll-insurance-input";

export type FormalPayrollAttendanceSource = {
  id: string; batchId: string; workedMinutes: string; lateMinutes: string; earlyMinutes: string;
  absenceDays: string; missingPunchDays: string;
};
const attendanceFields = new Map([
  ["工作分钟", "workedMinutes"], ["迟到分钟", "lateMinutes"], ["早退分钟", "earlyMinutes"],
  ["缺勤天数", "absenceDays"], ["缺卡天数", "missingPunchDays"],
] as const);

/** Sources must be read under scoped transaction locks; this composes calculation and frozen evidence, not source approval. */
export function calculateFormalPayrollWithSources(definition: FormalPayrollDefinition, source: {
  periodStart: string; periodEnd: string;
  employee: { id: string; version: number; hireDate: string | null; departureDate: string | null };
  input: FormalPayrollEmployeeInput;
  compensations: readonly PayrollCompensationSegment[];
  attendance?: FormalPayrollAttendanceSource;
  insurance?: { id: string; revisionNo: number; snapshotHash: string; items: readonly PayrollInsuranceAmountFact[] };
}) {
  if (source.employee.id !== source.input.employeeId || source.employee.version !== source.input.expectedEmployeeVersion) throw new ConflictException("Payroll employee source changed");
  const evidence = buildFormalPayrollDefinitionEvidence(definition);
  const dependencies = [...new Set(evidence.items.flatMap(item => item.dependencies))];
  const eligibility = resolvePayrollEligibility({ periodStart: source.periodStart, periodEnd: source.periodEnd,
    hireDate: source.employee.hireDate, departureDate: source.employee.departureDate,
    settlementStart: source.input.settlementStart, settlementEnd: source.input.settlementEnd,
    eligibilityReason: source.input.eligibilityReason });
  const hrInputs = projectPayrollCompensationInputs({ periodStart: source.periodStart, periodEnd: source.periodEnd,
    ...eligibility, policy: definition.compensationPolicy, segments: source.compensations, dependencies });
  const attendanceRequired = [...attendanceFields].filter(([code]) => dependencies.includes(`hr:${code}`));
  if (attendanceRequired.length && !source.attendance) throw new ConflictException("Required closed attendance source is missing");
  for (const [code, field] of attendanceRequired) {
    const value = source.attendance![field];
    if (typeof value !== "string" || !/^\d{1,16}(?:\.\d{1,4})?$/u.test(value)) throw new ConflictException("Invalid exact attendance source value");
    hrInputs[code] = value;
  }
  const insuranceRequired = dependencies.some(code => code.startsWith("hr:") && HR_PAYROLL_INSURANCE_REFERENCE_CODES.has(code.slice(3)));
  if (insuranceRequired && !source.insurance) throw new ConflictException("Required confirmed insurance source is missing");
  for (const [code, value] of Object.entries(projectPayrollInsuranceInputs(source.insurance?.items ?? [], dependencies))) hrInputs[code.slice(3)] = value;
  const calculation = calculateFormalPayroll(definition, { directItems: source.input.directItems, hrInputs });
  return { calculation, frozenSources: {
    employee: { ...source.employee }, eligibility, directItems: { ...source.input.directItems }, hrInputs,
    compensations: source.compensations.map(segment => ({ ...segment })),
    attendance: attendanceRequired.length ? { ...source.attendance! } : null,
    insurance: insuranceRequired ? { ...source.insurance!, items: source.insurance!.items.map(item => ({ ...item })) } : null,
  } };
}
