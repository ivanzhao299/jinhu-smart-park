import { FORMAL_PAYROLL_ROLES, FORMAL_PAYROLL_COMPENSATION_POLICIES, type FormalPayrollRole, type FormalPayrollItem, type FormalPayrollDefinition } from "@jinhu/shared";
import { requiresPayrollCompensationInputs } from "./hr-payroll-compensation-input";
import { BadRequestException } from "@nestjs/common";
import {
  assertAcyclicFormulaDependencies,
  assertFormulaEvaluationOrder,
  evaluatePayrollFormula,
  formatPayrollDecimal,
  HR_PAYROLL_DSL_ENGINE_VERSION,
  parsePayrollFormula,
  type PayrollAst,
} from "./hr-payroll-formula-dsl";
import { hrCentsToMoney, normalizeHrMoney } from "./hr-money";

export const FORMAL_PAYROLL_CALCULATION_VERSION = "jinhu-formal-payroll-v1";
export { FORMAL_PAYROLL_ROLES } from "@jinhu/shared";
export type { FormalPayrollRole, FormalPayrollItem, FormalPayrollDefinition } from "@jinhu/shared";
type PreparedItem = FormalPayrollItem & { ast: PayrollAst | null; dependencies: string[]; parserVersion: string | null; astHash: string | null };

function invalid(message: string): never {
  throw new BadRequestException(`FORMAL_PAYROLL_INVALID: ${message}`);
}

function prepare(definition: FormalPayrollDefinition): PreparedItem[] {
  if (definition.roundingPolicy !== "line_items_half_up") invalid("An explicit supported rounding policy is required");
  if (!definition.items.length || definition.items.length > 256) invalid("Payroll requires 1 to 256 items");
  const codes = new Set<string>();
  const items = definition.items.map(item => {
    if (!/^[\p{L}\p{N}_ -]{1,96}$/u.test(item.code) || item.code.trim() !== item.code || codes.has(item.code)) {
      invalid("Item codes must be valid and unique");
    }
    codes.add(item.code);
    if (!FORMAL_PAYROLL_ROLES.includes(item.role)) invalid("Every item requires an explicit accounting role");
    if (item.expression === null) return { ...item, ast: null, dependencies: [], parserVersion: null, astHash: null };
    const parsed = parsePayrollFormula(item.expression);
    if (!parsed.ast) invalid(`Invalid formula for ${item.code}`);
    return { ...item, ast: parsed.ast, dependencies: parsed.dependencies, parserVersion: parsed.parserVersion, astHash: parsed.astHash };
  });
  for (const role of ["gross", "tax", "net"] as const) {
    if (items.filter(item => item.role === role).length !== 1) invalid(`Exactly one ${role} item is required`);
  }
  if (!items.some(item => item.role === "earning")) invalid("At least one earning item is required");
  for (const item of items) {
    for (const dependency of item.dependencies) {
      if (dependency.startsWith("payroll:") && !codes.has(dependency.slice(8))) {
        invalid(`Undefined project dependency for ${item.code}`);
      }
    }
  }
  const graph = items.map(item => ({ itemCode: item.code, dependencies: item.dependencies }));
  if (definition.compensationPolicy !== undefined && !FORMAL_PAYROLL_COMPENSATION_POLICIES.includes(definition.compensationPolicy)) invalid("Unsupported compensation policy");
  if (requiresPayrollCompensationInputs(items.flatMap(item => item.dependencies)) && definition.compensationPolicy === undefined) invalid("Salary references require an explicit compensation policy");
  assertAcyclicFormulaDependencies(graph);
  assertFormulaEvaluationOrder(graph);
  return items;
}

/** Syntax and accounting validation only; this does not approve a rule version. */
export function validateFormalPayrollDefinition(definition: FormalPayrollDefinition): void {
  prepare(definition);
}

/** Persist with the draft and freeze on submission; parser upgrades require a new reviewed revision. */
export function buildFormalPayrollDefinitionEvidence(definition: FormalPayrollDefinition) {
  return { calculationVersion: FORMAL_PAYROLL_CALCULATION_VERSION, formulaEngineVersion: HR_PAYROLL_DSL_ENGINE_VERSION,
    ...(definition.compensationPolicy === undefined ? {} : { compensationPolicy: definition.compensationPolicy }),
    roundingPolicy: definition.roundingPolicy, items: prepare(definition).map(item => ({ code: item.code,
      role: item.role, expression: item.expression, ast: item.ast, dependencies: item.dependencies,
      parserVersion: item.parserVersion, astHash: item.astHash })) };
}

function decimalUnits(value: string): bigint {
  if (typeof value !== "string" || !/^-?\d+(?:\.\d{1,4})?$/u.test(value) || value.length > 26) invalid("Invalid exact decimal input");
  const negative = value.startsWith("-");
  const [integer, fraction = ""] = (negative ? value.slice(1) : value).split(".");
  const units = BigInt(integer!) * 10000n + BigInt(fraction.padEnd(4, "0"));
  if (units > 99999999999999999999n) invalid("Decimal input overflow");
  return negative ? -units : units;
}

function roundedCents(units: bigint): bigint {
  const absolute = units < 0n ? -units : units;
  const result = absolute / 100n + (absolute % 100n >= 50n ? 1n : 0n);
  return units < 0n ? -result : result;
}

function signedMoney(cents: bigint): string {
  return `${cents < 0n ? "-" : ""}${normalizeHrMoney(hrCentsToMoney(cents < 0n ? -cents : cents))}`;
}

export type FormalPayrollCalculation = {
  calculationVersion: typeof FORMAL_PAYROLL_CALCULATION_VERSION;
  formulaEngineVersion: typeof HR_PAYROLL_DSL_ENGINE_VERSION;
  roundingPolicy: FormalPayrollDefinition["roundingPolicy"];
  items: Array<{ code: string; role: FormalPayrollRole; decimalValue: string; amount: string | null }>;
  grossAmount: string;
  deductionAmount: string;
  personalTax: string;
  netAmount: string;
};

/** Caller owns authorization, approved effective versions, and frozen source evidence. */
export function calculateFormalPayroll(
  definition: FormalPayrollDefinition,
  input: { directItems: Readonly<Record<string, string>>; hrInputs: Readonly<Record<string, string>> },
): FormalPayrollCalculation {
  const rules = prepare(definition);
  const directCodes = new Set(rules.filter(item => item.ast === null).map(item => item.code));
  if (Object.keys(input.directItems).some(code => !directCodes.has(code))) invalid("Unexpected or computed project input");
  const values: Record<string, string> = Object.create(null) as Record<string, string>;
  const requiredHr = new Set(rules.flatMap(item => item.dependencies.filter(code => code.startsWith("hr:"))));
  for (const dependency of requiredHr) {
    const code = dependency.slice(3);
    if (!Object.hasOwn(input.hrInputs, code)) invalid(`Missing HR input ${code}`);
    values[dependency] = formatPayrollDecimal(decimalUnits(input.hrInputs[code]!));
  }
  let earnings = 0n, deductions = 0n;
  const roleValues = new Map<FormalPayrollRole, bigint>();
  const items = rules.map(item => {
    if (item.ast === null && !Object.hasOwn(input.directItems, item.code)) invalid(`Missing project input ${item.code}`);
    const raw = item.ast ? evaluatePayrollFormula(item.ast, values) : input.directItems[item.code]!;
    const units = decimalUnits(raw);
    const cents = roundedCents(units);
    const decimalValue = formatPayrollDecimal(item.role === "informational" ? units : cents * 100n);
    values[`payroll:${item.code}`] = decimalValue;
    if (item.role === "earning") earnings += cents;
    if (item.role === "deduction") deductions += cents;
    if (["gross", "tax", "net"].includes(item.role)) roleValues.set(item.role, cents);
    return { code: item.code, role: item.role, decimalValue,
      amount: item.role === "informational" ? null : signedMoney(cents) };
  });
  const gross = roleValues.get("gross")!, tax = roleValues.get("tax")!, net = roleValues.get("net")!;
  if (gross !== earnings) invalid("Gross amount does not equal the earning items");
  if (gross < 0n || deductions < 0n || tax < 0n || net < 0n) invalid("Payroll totals cannot be negative");
  if (gross !== deductions + tax + net) invalid("Gross, deductions, tax and net do not balance");
  // The persisted numeric(18,2) and existing HR monetary contract apply to totals.
  return { calculationVersion: FORMAL_PAYROLL_CALCULATION_VERSION,
    formulaEngineVersion: HR_PAYROLL_DSL_ENGINE_VERSION, roundingPolicy: definition.roundingPolicy, items,
    grossAmount: normalizeHrMoney(hrCentsToMoney(gross)),
    deductionAmount: normalizeHrMoney(hrCentsToMoney(deductions)),
    personalTax: normalizeHrMoney(hrCentsToMoney(tax)),
    netAmount: normalizeHrMoney(hrCentsToMoney(net)) };
}
