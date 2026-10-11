import assert from "node:assert/strict";
import test from "node:test";
import type { FormalPayrollDefinition } from "@jinhu/shared";
import { calculateFormalPayrollWithSources } from "./hr-payroll-formal-source-calculation";

const definition: FormalPayrollDefinition = { roundingPolicy: "line_items_half_up", compensationPolicy: "calendar_day_prorated", items: [
  { code: "工资", role: "earning", expression: "[人事系统.基本工资]" },
  { code: "缺勤", role: "deduction", expression: "[人事系统.缺勤天数]*100" },
  { code: "社保", role: "deduction", expression: "[人事系统.养老保险个人金额]" },
  { code: "税", role: "tax", expression: null },
  { code: "应发", role: "gross", expression: "[工资]" },
  { code: "实发", role: "net", expression: "[应发]-[缺勤]-[社保]-[税]" },
] };
const source = {
  periodStart: "2026-10-01", periodEnd: "2026-10-31",
  employee: { id: "employee", version: 2, hireDate: "2026-10-16", departureDate: null },
  input: { employeeId: "employee", expectedEmployeeVersion: 2, directItems: { 税: "80.10" } },
  compensations: [{ id: "salary", version: 3, planId: "plan", planVersion: 4, effectiveFrom: "2026-10-01", effectiveThrough: null, baseSalary: "6200.00", allowanceAmount: "0.00", variableTarget: "0.00" }],
  attendance: { id: "attendance", batchId: "closed-batch", workedMinutes: "1000", lateMinutes: "0", earlyMinutes: "0", absenceDays: "0.5", missingPunchDays: "0" },
  insurance: { id: "insurance", revisionNo: 5, snapshotHash: "frozen-insurance-hash", items: [{ insuranceKind: "oldage", totalAmount: "900.00", employerAmount: "600.00", employeeAmount: "300.00", supplementAmount: "0.00" }] },
};
test("formal employee calculation composes partial-month salary, closed attendance and confirmed insurance without old wages", () => {
  const result = calculateFormalPayrollWithSources(definition, source);
  assert.equal(result.calculation.grossAmount, "3200.00");
  assert.equal(result.calculation.deductionAmount, "350.00");
  assert.equal(result.calculation.personalTax, "80.10");
  assert.equal(result.calculation.netAmount, "2769.90");
  assert.equal(result.frozenSources.compensations[0]!.version, 3);
  assert.equal(result.frozenSources.insurance!.revisionNo, 5);
  assert.equal(result.frozenSources.eligibility.eligibleStart, "2026-10-16");
  source.insurance.items[0]!.employeeAmount = "301.00";
  assert.equal(result.frozenSources.insurance!.items[0]!.employeeAmount, "300.00");
  source.insurance.items[0]!.employeeAmount = "300.00";
});
test("missing required sources and stale employee selection cannot produce a payroll result", () => {
  assert.throws(() => calculateFormalPayrollWithSources(definition, { ...source, attendance: undefined }), /attendance source is missing/);
  assert.throws(() => calculateFormalPayrollWithSources(definition, { ...source, insurance: undefined }), /insurance source is missing/);
  assert.throws(() => calculateFormalPayrollWithSources(definition, { ...source, compensations: [] }), /incomplete/);
  assert.throws(() => calculateFormalPayrollWithSources(definition, { ...source, employee: { ...source.employee, version: 3 } }), /employee source changed/);
  assert.throws(() => calculateFormalPayrollWithSources(definition, { ...source, attendance: { ...source.attendance, absenceDays: "NaN" } }), /attendance source value/);
});

test("formal leave dependency consumes and freezes actual whole minutes; old unavailable sources cannot stand in for zero", () => {
  const leaveDefinition=structuredClone(definition);
  leaveDefinition.items.find(item=>item.code==="工资")!.expression="[人事系统.批准请假分钟]/60*10";
  const prepared={...structuredClone(source),input:{...source.input,directItems:{税:"0.00"}},attendance:{...source.attendance,absenceDays:"0",approvedLeaveMinutes:"120"},insurance:{...structuredClone(source.insurance),items:[{...source.insurance.items[0]!,employeeAmount:"0.00"}]}};
  const result=calculateFormalPayrollWithSources(leaveDefinition,prepared);
  assert.equal(result.calculation.netAmount,"20.00");
  assert.equal(result.frozenSources.hrInputs["批准请假分钟"],"120.0000");
  assert.equal(result.frozenSources.attendance!.approvedLeaveMinutes,"120");
  for(const value of [null,undefined,"0.5","-1"]){assert.throws(()=>calculateFormalPayrollWithSources(leaveDefinition,{...prepared,attendance:{...prepared.attendance,approvedLeaveMinutes:value}}));}
  assert.equal(calculateFormalPayrollWithSources(leaveDefinition,{...prepared,attendance:{...prepared.attendance,approvedLeaveMinutes:"0"}}).calculation.netAmount,"0.00");
  assert.doesNotThrow(()=>calculateFormalPayrollWithSources(definition,{...source,attendance:{...source.attendance,approvedLeaveMinutes:null}}));
});

test("formal calculation consumes only explicitly referenced frozen interval quantities, preserving milliseconds", () => {
  const rule = structuredClone(definition);
  rule.items.find(item => item.code === "工资")!.expression = "[人事系统.批准加班区间分钟]+[人事系统.批准出差区间分钟]";
  const prepared = { ...structuredClone(source), input: { ...source.input, directItems: { 税: "0.00" } }, attendance: { ...source.attendance, absenceDays: "0", approvedOvertimeMs: "60000", approvedBusinessTripMs: "120000" }, insurance: { ...structuredClone(source.insurance), items: [{ ...source.insurance.items[0]!, employeeAmount: "0.00" }] } };
  const result = calculateFormalPayrollWithSources(rule, prepared);
  assert.equal(result.calculation.netAmount, "3.00");
  assert.equal(result.frozenSources.hrInputs["批准加班区间分钟"], "1.0000");
  assert.equal(result.frozenSources.attendance!.approvedOvertimeMs, "60000");
  for (const value of [null, undefined, "1.5", "2678400001"]) assert.throws(() => calculateFormalPayrollWithSources(rule, { ...prepared, attendance: { ...prepared.attendance, approvedOvertimeMs: value } }));
  assert.doesNotThrow(() => calculateFormalPayrollWithSources(definition, { ...source, attendance: { ...source.attendance, approvedOvertimeMs: null, approvedBusinessTripMs: null } }));
});

test("formal consumer freezes explicit declared days and rejects unknown instead of deriving from duration",()=>{
  const rule=structuredClone(definition);rule.items.find(item=>item.code==="工资")!.expression="[人事系统.批准出差申报天数]";
  const prepared={...structuredClone(source),input:{...source.input,directItems:{税:"0.00"}},attendance:{...source.attendance,absenceDays:"0",approvedBusinessTripDeclaredDays:"3"},insurance:{...structuredClone(source.insurance),items:[{...source.insurance.items[0]!,employeeAmount:"0.00"}]}};
  const result=calculateFormalPayrollWithSources(rule,prepared);assert.equal(result.calculation.netAmount,"3.00");assert.equal(result.frozenSources.attendance!.approvedBusinessTripDeclaredDays,"3");
  for(const value of [null,undefined,"-1","1.5"])assert.throws(()=>calculateFormalPayrollWithSources(rule,{...prepared,attendance:{...prepared.attendance,approvedBusinessTripDeclaredDays:value}}));
});
