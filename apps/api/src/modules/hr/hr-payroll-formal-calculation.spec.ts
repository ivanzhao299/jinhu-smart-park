import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  calculateFormalPayroll, validateFormalPayrollDefinition, buildFormalPayrollDefinitionEvidence,
  type FormalPayrollDefinition,
} from "./hr-payroll-formal-calculation";

const definition: FormalPayrollDefinition = {
  roundingPolicy: "line_items_half_up",
  compensationPolicy: "full_period_single",
  items: [
    { code: "基本", role: "earning", expression: "[人事系统.基本工资]" },
    { code: "奖金", role: "earning", expression: null },
    { code: "考勤扣款", role: "deduction", expression: "[人事系统.缺勤天数]*100" },
    { code: "社保扣款", role: "deduction", expression: "[人事系统.五险个人金额]" },
    { code: "单位社保", role: "employer_contribution", expression: null },
    { code: "个税", role: "tax", expression: null },
    { code: "应发", role: "gross", expression: "[基本]+[奖金]" },
    { code: "实发", role: "net", expression: "[应发]-[考勤扣款]-[社保扣款]-[个税]" },
  ],
};
const input = {
  directItems: { 奖金: "100.0050", 单位社保: "900", 个税: "80.10" },
  hrInputs: { 基本工资: "5000.00", 缺勤天数: "0.5", 五险个人金额: "350.25" },
};

test("formal payroll calculates current HR, direct projects, insurance and tax without historical wages", () => {
  const result = calculateFormalPayroll(definition, input);
  assert.deepEqual([result.grossAmount, result.deductionAmount, result.personalTax, result.netAmount],
    ["5100.01", "400.25", "80.10", "4619.66"]);
  assert.equal(result.items.find(item => item.code === "奖金")?.decimalValue, "100.0100");
  assert.equal(result.roundingPolicy, "line_items_half_up");
  const changed = calculateFormalPayroll(definition, { ...input, hrInputs: { ...input.hrInputs, 五险个人金额: "360.25" } });
  assert.equal(changed.netAmount, "4609.66");
  assert.equal(result.netAmount, "4619.66");
});

test("v2 pre-gross reductions remain distinct from post-gross deductions", () => {
  const v2: FormalPayrollDefinition = { roundingPolicy: "line_items_half_up", items: [
    { code: "收入", role: "earning", expression: null }, { code: "质量扣减", role: "gross_reduction", expression: null },
    { code: "扣款", role: "deduction", expression: null }, { code: "税", role: "tax", expression: null },
    { code: "应发", role: "gross", expression: "[收入]-[质量扣减]" }, { code: "实发", role: "net", expression: "[应发]-[扣款]-[税]" },
  ] };
  const result = calculateFormalPayroll(v2, { directItems: { 收入: "100", 质量扣减: "10", 扣款: "3", 税: "5" }, hrInputs: {} });
  assert.deepEqual([result.grossAmount, result.grossReductionAmount, result.deductionAmount, result.personalTax, result.netAmount], ["90.00", "10.00", "3.00", "5.00", "82.00"]);
  assert.equal(result.calculationVersion, "jinhu-formal-payroll-v2");
  assert.equal(calculateFormalPayroll(v2, { directItems: { 收入: "100", 质量扣减: "-10", 扣款: "3", 税: "5" }, hrInputs: {} }).grossAmount, "110.00");
  assert.throws(() => calculateFormalPayroll(v2, { directItems: { 收入: "100", 质量扣减: "100.01", 扣款: "0", 税: "0" }, hrInputs: {} }), /negative/);
});

test("missing financial sources are rejected, while explicitly recorded zero is valid", () => {
  const directItems: Record<string, string> = { ...input.directItems };
  delete directItems.个税;
  assert.throws(() => calculateFormalPayroll(definition, { ...input, directItems }), /Missing project input 个税/);
  const hrInputs: Record<string, string> = { ...input.hrInputs };
  delete hrInputs.五险个人金额;
  assert.throws(() => calculateFormalPayroll(definition, { ...input, hrInputs }), /Missing HR input 五险个人金额/);
  assert.equal(calculateFormalPayroll(definition, { ...input, directItems: { ...input.directItems, 个税: "0" } }).personalTax, "0.00");
});

test("direct input cannot replace formulas, inherit prototypes, or inject extra projects", () => {
  assert.throws(() => calculateFormalPayroll(definition, {
    ...input, directItems: { ...input.directItems, 基本: "1" },
  }), /Unexpected or computed/);
  assert.throws(() => calculateFormalPayroll(definition, {
    ...input, directItems: Object.create(input.directItems) as Record<string, string>,
  }), /Missing project input/);
});

test("accounting roles must be explicit and complete", () => {
  assert.throws(() => validateFormalPayrollDefinition({ ...definition, items: definition.items.filter(item => item.role !== "tax") }), /Exactly one tax/);
  assert.throws(() => validateFormalPayrollDefinition({ ...definition, items: [...definition.items, definition.items[0]!] }), /unique/);
  assert.throws(() => validateFormalPayrollDefinition({ ...definition, roundingPolicy: undefined! }), /rounding policy/);
});

test("unknown dependencies, ordering, cycles and executable source fail before calculation", () => {
  const replace = (code: string, expression: string) => ({
    ...definition, items: definition.items.map(item => item.code === code ? { ...item, expression } : item),
  });
  assert.throws(() => validateFormalPayrollDefinition(replace("奖金", "[不存在]")), /Undefined project dependency/);
  assert.throws(() => validateFormalPayrollDefinition(replace("基本", "[应发]")), /cycle/);
  assert.throws(() => validateFormalPayrollDefinition(replace("基本", "[奖金]")), /not available before/);
  assert.throws(() => validateFormalPayrollDefinition(replace("奖金", "EXEC wage")), /Invalid formula/);
});

test("monetary projects round before subsequent totals, avoiding hidden pennies", () => {
  const rules: FormalPayrollDefinition = { roundingPolicy: "line_items_half_up", items: [
    { code: "一", role: "earning", expression: null },
    { code: "二", role: "earning", expression: null },
    { code: "税", role: "tax", expression: "0" },
    { code: "应发", role: "gross", expression: "[一]+[二]" },
    { code: "实发", role: "net", expression: "[应发]-[税]" },
  ] };
  assert.equal(calculateFormalPayroll(rules, { directItems: { 一: "0.005", 二: "0.005" }, hrInputs: {} }).netAmount, "0.02");
  assert.equal(calculateFormalPayroll(rules, { directItems: { 一: "0.015", 二: "-0.005" }, hrInputs: {} }).netAmount, "0.01");
});

test("incorrect summaries, negative totals, zero divisors and numeric corruption cannot produce payroll", () => {
  assert.throws(() => calculateFormalPayroll({ ...definition, items: definition.items.map(item => item.role === "net" ? { ...item, expression: "[应发]" } : item) }, input), /do not balance/);
  assert.throws(() => calculateFormalPayroll({ ...definition, items: definition.items.map(item => item.role === "gross" ? { ...item, expression: "1" } : item) }, input), /earning items/);
  assert.throws(() => calculateFormalPayroll(definition, { ...input, directItems: { ...input.directItems, 个税: "9000" } }), /negative/);
  assert.throws(() => calculateFormalPayroll({ ...definition, items: definition.items.map(item => item.code === "基本" ? { ...item, expression: "1/0" } : item) }, input), /division by zero/);
  for (const invalid of ["1e3", "NaN", "1.00001", "999999999999999999999999", 10 as unknown as string]) {
    assert.throws(() => calculateFormalPayroll(definition, { ...input, directItems: { ...input.directItems, 个税: invalid } }));
  }
  assert.throws(() => calculateFormalPayroll(definition, {
    ...input, directItems: { ...input.directItems, 单位社保: "9999999999999999.995" },
  }), /non-negative decimal/);
});

test("informational quantities retain precision and employer amounts do not reduce employee net", () => {
  const rules = { ...definition, items: [
    { code: "天数", role: "informational" as const, expression: "[人事系统.缺勤天数]/3" }, ...definition.items,
  ] };
  const result = calculateFormalPayroll(rules, input);
  assert.deepEqual(result.items[0], { code: "天数", role: "informational", decimalValue: "0.1667", amount: null });
  assert.equal(result.netAmount, "4619.66");
});

// Golden hashes were captured from the pre-change kernel at 9a3e739c065d733c906112274b3281a8af738a35.
// These bind serialized field presence/order, interpretation, AST and exact monetary strings.
test("legacy v1 calculation and interpretation preserve their pre-change serialized bytes", () => {
  const legacy: FormalPayrollDefinition = { roundingPolicy: "line_items_half_up", items: [
    { code: "E", role: "earning", expression: null }, { code: "T", role: "tax", expression: "0" },
    { code: "G", role: "gross", expression: "[E]" }, { code: "N", role: "net", expression: "[G]-[T]" },
  ] };
  const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  assert.equal(hash(buildFormalPayrollDefinitionEvidence(legacy)), "607dfc8557718a6a63126e0e058fefed6bfcb974049d9772e865aedcdb792b69");
  assert.equal(hash(calculateFormalPayroll(legacy, { directItems: { E: "100.005" }, hrInputs: {} })), "06f3e4959f05d8425879ad50aaa0dd94a5da7306e1bd2cd9bf238a96ab4c07f2");
});

test("v2 interpretation depends on declared roles at zero and rounds each signed reduction before reuse", () => {
  const rules: FormalPayrollDefinition = { roundingPolicy: "line_items_half_up", items: [
    { code: "E", role: "earning", expression: null }, { code: "R1", role: "gross_reduction", expression: null },
    { code: "R2", role: "gross_reduction", expression: null }, { code: "T", role: "tax", expression: "0" },
    { code: "G", role: "gross", expression: "[E]-[R1]-[R2]" }, { code: "N", role: "net", expression: "[G]-[T]" },
  ] };
  assert.equal(buildFormalPayrollDefinitionEvidence(rules).calculationVersion, "jinhu-formal-payroll-v2");
  for (const [first, second, reduction, gross] of [
    ["0", "0", "0.00", "100.00"], ["0.005", "0.005", "0.02", "99.98"],
    ["-0.005", "-0.005", "-0.02", "100.02"], ["0.005", "-0.005", "0.00", "100.00"],
  ]) {
    const result = calculateFormalPayroll(rules, { directItems: { E: "100", R1: first!, R2: second! }, hrInputs: {} });
    assert.equal(result.calculationVersion, "jinhu-formal-payroll-v2");
    assert.equal(result.grossReductionAmount, reduction); assert.equal(result.grossAmount, gross); assert.equal(result.netAmount, gross);
  }
  const inputs = { directItems: { E: "100", R1: "10", R2: "0" }, hrInputs: {} };
  assert.throws(() => calculateFormalPayroll(rules, { ...inputs, directItems: { E: "100", R1: "0" } }), /Missing project input R2/);
  assert.throws(() => calculateFormalPayroll(rules, { ...inputs, directItems: { ...inputs.directItems, G: "90" } }), /Unexpected or computed/);
  assert.throws(() => calculateFormalPayroll({ ...rules, items: rules.items.map(item => item.code === "G" ? { ...item, expression: "[E]" } : item) }, inputs), /earnings less gross reductions/);
  assert.throws(() => calculateFormalPayroll({ ...rules, items: rules.items.map(item => item.code === "N" ? { ...item, expression: "[G]-[R1]" } : item) }, inputs), /do not balance/);
  assert.throws(() => calculateFormalPayroll(rules, { ...inputs, directItems: { E: "9999999999999999.99", R1: "-0.01", R2: "0" } }), /overflow|non-negative decimal/);
  for (const value of ["9999999999999999.995", "-9999999999999999.995"]) {
    assert.throws(() => calculateFormalPayroll(rules, { ...inputs, directItems: { ...inputs.directItems, R1: value } }), /non-negative decimal/);
  }
});
