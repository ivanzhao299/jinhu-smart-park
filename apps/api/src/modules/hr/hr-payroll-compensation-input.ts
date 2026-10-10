import { BadRequestException, ConflictException } from "@nestjs/common";
import { FORMAL_PAYROLL_COMPENSATION_POLICIES, type FormalPayrollCompensationPolicy, type TenantParkScope } from "@jinhu/shared";
import type { EntityManager } from "typeorm";
import { formatPayrollDecimal } from "./hr-payroll-formula-dsl";
import { hrMoneyToCents } from "./hr-money";

export type PayrollCompensationSegment = {
  id: string; version: number; effectiveFrom: string; effectiveThrough: string | null;
  planId: string; planVersion: number; baseSalary: string; allowanceAmount: string; variableTarget: string;
};
/** Deliberately amount-free: options must never turn source coverage into a salary preview. */
export type PayrollCompensationSourceMetadata = Pick<PayrollCompensationSegment, "id" | "version" | "effectiveFrom" | "effectiveThrough" | "planId" | "planVersion"> & { currency: string };
export type PayrollCompensationCoverage = { status: "covered"; sourceCount: number; slices: Array<{ segment: PayrollCompensationSourceMetadata; start: number; end: number }> }
  | { status: "missing_or_incomplete" | "overlap" | "incompatible_policy" | "invalid_metadata" | "unsupported_currency"; sourceCount: number; message: string; exceptionKind: "bad_request" | "conflict" };
const salaryReferences = new Map([
  ["hr:基本工资", "baseSalary"], ["hr:津贴", "allowanceAmount"], ["hr:浮动目标", "variableTarget"],
] as const);

export function requiresPayrollCompensationInputs(dependencies: readonly string[]) {
  return [...salaryReferences.keys()].some(reference => dependencies.includes(reference));
}

function day(value: string): number {
  if (typeof value !== "string" || !/^(?:19\d{2}|20\d{2}|2100)-\d{2}-\d{2}$/u.test(value)) throw new BadRequestException("Invalid compensation date");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new BadRequestException("Invalid compensation date");
  return date.getTime() / 86400000;
}

/** The date/policy portion of the projector, intentionally independent of salary amounts. */
export function inspectPayrollCompensationCoverage(input: {
  periodStart: string; periodEnd: string; eligibleStart: string; eligibleEnd: string;
  policy: FormalPayrollCompensationPolicy | undefined; segments: readonly PayrollCompensationSourceMetadata[];
}): PayrollCompensationCoverage {
  if (!input.policy || !FORMAL_PAYROLL_COMPENSATION_POLICIES.includes(input.policy)) return { status: "incompatible_policy", sourceCount: input.segments.length, message: "Payroll salary references require an explicit approved compensation policy", exceptionKind: "conflict" };
  if (input.segments.some(segment => segment.currency !== "CNY")) return { status: "unsupported_currency", sourceCount: input.segments.length, message: "Payroll compensation currency must be explicitly supported", exceptionKind: "conflict" };
  let from: number, through: number, eligibleFrom: number, eligibleThrough: number;
  try { from = day(input.periodStart); through = day(input.periodEnd); eligibleFrom = day(input.eligibleStart); eligibleThrough = day(input.eligibleEnd); }
  catch (error) { if (!(error instanceof BadRequestException)) throw error; return { status: "invalid_metadata", sourceCount: input.segments.length, message: "Invalid compensation date", exceptionKind: "bad_request" }; }
  if (through < from || through - from > 365 || eligibleFrom < from || eligibleThrough > through || eligibleThrough < eligibleFrom) return { status: "invalid_metadata", sourceCount: input.segments.length, message: "Invalid payroll compensation range", exceptionKind: "bad_request" };
  const ids = new Set<string>();
  const slices: Array<{ segment: PayrollCompensationSourceMetadata; start: number; end: number }> = [];
  for (const segment of input.segments) {
    if (!segment.id || ids.has(segment.id) || !Number.isSafeInteger(segment.version) || segment.version < 1 || !segment.planId || !Number.isSafeInteger(segment.planVersion) || segment.planVersion < 1) return { status: "invalid_metadata", sourceCount: input.segments.length, message: "Duplicate or invalid compensation source version", exceptionKind: "conflict" };
    ids.add(segment.id);
    let start: number, end: number;
    try { start = day(segment.effectiveFrom); end = segment.effectiveThrough === null ? through : day(segment.effectiveThrough); }
    catch (error) { if (!(error instanceof BadRequestException)) throw error; return { status: "invalid_metadata", sourceCount: input.segments.length, message: "Invalid compensation date", exceptionKind: "bad_request" }; }
    if (end < start) return { status: "invalid_metadata", sourceCount: input.segments.length, message: "Invalid compensation source range", exceptionKind: "conflict" };
    start = Math.max(start, eligibleFrom); end = Math.min(end, eligibleThrough);
    if (end >= start) slices.push({ segment, start, end });
  }
  slices.sort((a, b) => a.start - b.start || a.end - b.end);
  let cursor = eligibleFrom;
  for (const slice of slices) {
    if (slice.start !== cursor) return { status: slice.start < cursor ? "overlap" : "missing_or_incomplete", sourceCount: slices.length, message: slice.start < cursor ? "Compensation ranges overlap" : "Compensation range is incomplete", exceptionKind: "conflict" };
    cursor = slice.end + 1;
  }
  if (cursor !== eligibleThrough + 1) return { status: "missing_or_incomplete", sourceCount: slices.length, message: "Compensation range is incomplete", exceptionKind: "conflict" };
  if (input.policy === "full_period_single" && (slices.length !== 1 || eligibleFrom !== from || eligibleThrough !== through)) return { status: "incompatible_policy", sourceCount: slices.length, message: "Full-period salary requires one source covering the complete period", exceptionKind: "conflict" };
  return { status: "covered", sourceCount: slices.length, slices };
}

function assertPayrollCompensationCoverage(coverage: PayrollCompensationCoverage): asserts coverage is Extract<PayrollCompensationCoverage, { status: "covered" }> {
  if (coverage.status === "covered") return;
  if (coverage.exceptionKind === "bad_request") throw new BadRequestException(coverage.message);
  throw new ConflictException(coverage.message);
}

/** Eligibility dates and basis come from the explicitly reviewed roster/rule, never today's employment status. */
export function projectPayrollCompensationInputs(input: {
  periodStart: string; periodEnd: string; eligibleStart: string; eligibleEnd: string;
  policy: FormalPayrollCompensationPolicy | undefined; segments: readonly PayrollCompensationSegment[];
  dependencies: readonly string[];
}): Record<string, string> {
  const required = [...salaryReferences].filter(([reference]) => input.dependencies.includes(reference));
  if (!required.length) return {};
  const coverage = inspectPayrollCompensationCoverage({ ...input, segments: input.segments.map(segment => ({ ...segment, currency: "CNY" })) });
  assertPayrollCompensationCoverage(coverage);
  const from = day(input.periodStart), through = day(input.periodEnd);
  const slices = coverage.slices.map(slice => ({ ...slice, segment: input.segments.find(segment => segment.id === slice.segment.id)! }));
  const result: Record<string, string> = {};
  for (const [reference, field] of required) {
    const numerator = slices.reduce((total, slice) => total + hrMoneyToCents(slice.segment[field], field) * 100n * BigInt(slice.end - slice.start + 1), 0n);
    const denominator = BigInt(through - from + 1);
    const units = numerator / denominator + (numerator % denominator * 2n >= denominator ? 1n : 0n);
    // Reuse the existing DSL numeric bound without JavaScript floating point money.
    if (units > 99999999999999999999n) throw new BadRequestException("Compensation amount overflow");
    result[reference.slice(3)] = formatPayrollDecimal(units);
  }
  return result;
}

/** Caller locks the payroll period/rule and employees first; these exact source versions are then frozen in the run. */
export async function lockPayrollCompensationSegments(
  manager: EntityManager, scope: TenantParkScope, employeeIds: readonly string[], periodStart: string, periodEnd: string,
): Promise<Map<string, PayrollCompensationSegment[]>> {
  day(periodStart); day(periodEnd);
  if (new Set(employeeIds).size !== employeeIds.length) throw new BadRequestException("Duplicate compensation employees");
  const rows: Array<PayrollCompensationSegment & { employeeId: string; currency: string }> = employeeIds.length ? await manager.query(`SELECT c.id,c.employee_id AS "employeeId",c.version,
    to_char(c.effective_from,'YYYY-MM-DD') AS "effectiveFrom",to_char(c.effective_to,'YYYY-MM-DD') AS "effectiveThrough",
    c.plan_id AS "planId",p.version AS "planVersion",p.currency,c.base_salary::text AS "baseSalary",
    c.allowance_amount::text AS "allowanceAmount",c.variable_target::text AS "variableTarget"
    FROM hr_employee_compensation c JOIN hr_compensation_plan p ON (p.id,p.tenant_id,p.park_id)=(c.plan_id,c.tenant_id,c.park_id)
    WHERE c.tenant_id=$1 AND c.park_id=$2 AND c.employee_id=ANY($3::uuid[]) AND NOT c.is_deleted AND NOT p.is_deleted
      AND c.status='active' AND c.effective_from<=$5::date AND (c.effective_to IS NULL OR c.effective_to>=$4::date)
    ORDER BY c.employee_id,c.effective_from,c.id FOR SHARE OF c,p`, [scope.tenantId, scope.parkId, employeeIds, periodStart, periodEnd]) : [];
  const result = new Map<string, PayrollCompensationSegment[]>();
  for (const { employeeId, currency, ...segment } of rows) {
    if (currency !== "CNY") throw new ConflictException("Payroll compensation currency must be explicitly supported");
    result.set(employeeId, [...(result.get(employeeId) ?? []), segment]);
  }
  return result;
}

/** One roster-scoped metadata read for advisory options. It intentionally omits all salary amounts. */
export async function readPayrollCompensationCoverageMetadata(
  manager: EntityManager, scope: TenantParkScope, employeeIds: readonly string[], periodStart: string, periodEnd: string,
): Promise<Map<string, PayrollCompensationSourceMetadata[]>> {
  day(periodStart); day(periodEnd);
  if (new Set(employeeIds).size !== employeeIds.length) throw new BadRequestException("Duplicate compensation employees");
  const rows: Array<PayrollCompensationSourceMetadata & { employeeId: string }> = employeeIds.length ? await manager.query(`SELECT c.id,c.employee_id AS "employeeId",c.version,
    to_char(c.effective_from,'YYYY-MM-DD') AS "effectiveFrom",to_char(c.effective_to,'YYYY-MM-DD') AS "effectiveThrough",
    c.plan_id AS "planId",p.version AS "planVersion",p.currency
    FROM hr_employee_compensation c JOIN hr_compensation_plan p ON (p.id,p.tenant_id,p.park_id)=(c.plan_id,c.tenant_id,c.park_id)
    WHERE c.tenant_id=$1 AND c.park_id=$2 AND c.employee_id=ANY($3::uuid[]) AND NOT c.is_deleted AND NOT p.is_deleted
      AND c.status='active' AND c.effective_from<=$5::date AND (c.effective_to IS NULL OR c.effective_to>=$4::date)
    ORDER BY c.employee_id,c.effective_from,c.id`, [scope.tenantId, scope.parkId, employeeIds, periodStart, periodEnd]) : [];
  const result = new Map<string, PayrollCompensationSourceMetadata[]>();
  for (const { employeeId, ...segment } of rows) result.set(employeeId, [...(result.get(employeeId) ?? []), segment]);
  return result;
}
