import assert from "node:assert/strict";
import test from "node:test";
import { parsePayrollFormula } from "./hr-payroll-formula-dsl";
import { projectApprovedLeavePayrollInput, projectApprovedIntervalPayrollInput, requiresPayrollAttendanceInputs, sumApprovedLeaveMinutes } from "./hr-payroll-attendance-input";

test("leave facts sum exact whole minutes while missing, fractional and overflowing values remain errors", () => {
  assert.equal(sumApprovedLeaveMinutes([{approvedLeaveMinutes:0},{approvedLeaveMinutes:120},{approvedLeaveMinutes:45}]),165);
  for(const value of [undefined,null,"120",-1,0.5,NaN,2147483648]) assert.throws(()=>sumApprovedLeaveMinutes([{approvedLeaveMinutes:value}]),/批准请假分钟/);
  assert.throws(()=>sumApprovedLeaveMinutes([{approvedLeaveMinutes:2147483647},{approvedLeaveMinutes:1}]),/超出/);
});
test("payroll requires an explicit exact leave source and never derives unknown as zero", () => {
  assert.equal(projectApprovedLeavePayrollInput(0),"0.0000");
  assert.equal(projectApprovedLeavePayrollInput("125"),"125.0000");
  for(const value of [null,undefined,"",false,"1.5","1.0000","01",-1,2147483648]) assert.throws(()=>projectApprovedLeavePayrollInput(value),/未提供有效/);
  assert.equal(requiresPayrollAttendanceInputs(["hr:批准请假分钟"]),true);
  assert.equal(requiresPayrollAttendanceInputs(["hr:基本工资"]),false);
});
test("leave expressions have distinct reviewed parser evidence without changing old expression versions", () => {
  const leave=parsePayrollFormula("[人事系统.批准请假分钟]/60");
  assert.equal(leave.parserVersion,"jinhu-payroll-dsl-v3");assert.deepEqual(leave.dependencies,["hr:批准请假分钟"]);assert.equal(leave.requiresManualReview,true);
  assert.equal(parsePayrollFormula("[人事系统.工作分钟]").parserVersion,"jinhu-payroll-dsl-v1");
  assert.equal(parsePayrollFormula("[人事系统.养老保险个人金额]").parserVersion,"jinhu-payroll-dsl-v2");
});

test("interval minute inputs preserve exact millisecond evidence and use four-place half-up only at the formula boundary", () => {
  for (const [value, expected] of [["0", "0.0000"], ["1", "0.0000"], ["3", "0.0001"], ["60000", "1.0000"], ["2678400000", "44640.0000"]]) assert.equal(projectApprovedIntervalPayrollInput(value), expected);
  for (const value of [null, undefined, "01", "1.5", -1, false, "2678400001"]) assert.throws(() => projectApprovedIntervalPayrollInput(value));
  for (const code of ["批准加班区间分钟", "批准出差区间分钟"]) {
    assert.equal(requiresPayrollAttendanceInputs([`hr:${code}`]), true);
    const parsed = parsePayrollFormula(`[人事系统.${code}]/60`);
    assert.equal(parsed.parserVersion, "jinhu-payroll-dsl-v4");
    assert.equal(parsed.requiresManualReview, true);
    assert.deepEqual(parsed.dependencies, [`hr:${code}`]);
  }
});
