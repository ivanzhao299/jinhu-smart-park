import { expect, it } from "vitest";
import type { FormalPayrollSourceItem } from "@jinhu/shared";
import { bindSelectedPayrollSourceReferences as bind } from "../../app/hr/payroll/payroll-source-formula-binding";

const base: FormalPayrollSourceItem = {
  id: "base-v1", definitionId: "base", code: "BASE", legacyName: "基本工资", displayName: "基本收入",
  versionNo: 1, valueType: "decimal", enabled: true, sortNo: 1, legacyItemType: "fixture", legacyAddOrSub: "fixture",
  category: "unclassified", decimalScale: 2,
};
const reduction: FormalPayrollSourceItem = { ...base, id: "reduction-v1", definitionId: "reduction", code: "REDUCTION", legacyName: "缺勤扣款", displayName: "应发扣减" };

it("binds only exact selected code/name identities while retaining source text and arithmetic order", () => {
  const source = " ([ 基本工资 ]+[基本收入]+[BASE]) - ([缺勤扣款]*2) ";
  const selected = [structuredClone(base), structuredClone(reduction)];
  const before = JSON.stringify(selected);
  expect(bind(source, selected)).toBe(" ([BASE]+[BASE]+[BASE]) - ([REDUCTION]*2) ");
  expect(source).toBe(" ([ 基本工资 ]+[基本收入]+[BASE]) - ([缺勤扣款]*2) ");
  expect(JSON.stringify(selected)).toBe(before);
});

it("never guesses case, partial names, excluded identities, or HR aliases", () => {
  for (const reference of ["base", "基本", "缺勤扣款", "养老保险个人金额"]) {
    expect(() => bind(`[${reference}]`, [base])).toThrow(`原公式引用“${reference}”未对应已选择的启用数值项目。`);
  }
  expect(bind("[人事系统.基本工资]+[BASE]", [base])).toBe("[人事系统.基本工资]+[BASE]");
  // An explicit HR reference remains subject to the existing server parser and policy;
  // the local binder neither invents nor approves cross-domain fields.
  expect(bind("[人事系统.未知字段]", [base])).toBe("[人事系统.未知字段]");
});

it("trims parser reference whitespace without normalizing catalog aliases", () => {
  expect(bind("[ 基本工资 ]", [base])).toBe("[BASE]");
  expect(() => bind("[基本工资]", [{ ...base, legacyName: " 基本工资 " }])).toThrow(/未对应/);
  expect(() => bind("[基本收入]", [{ ...base, displayName: "基本收入 " }])).toThrow(/未对应/);
});

it("rejects disabled, nondecimal, duplicate-code versions and ambiguous cross-alias identities", () => {
  expect(() => bind("[BASE]", [{ ...base, enabled: false }])).toThrow(/不是启用数值项目/);
  expect(() => bind("[BASE]", [{ ...base, valueType: "text" }])).toThrow(/不是启用数值项目/);
  expect(() => bind("[BASE]", [base, { ...base, id: "base-v2", versionNo: 2 }])).toThrow(/多个所选项目版本/);
  expect(() => bind("[BASE]", [base, { ...reduction, displayName: "BASE" }])).toThrow(/多个所选项目版本/);
  expect(() => bind("[基本工资]", [base, { ...reduction, legacyName: "基本工资" }])).toThrow(/多个所选项目版本/);
});
