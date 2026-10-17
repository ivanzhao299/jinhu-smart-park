import { webcrypto, createHash } from "node:crypto";
import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { payrollRuleChoiceCsv, previewPayrollRuleChoiceCsv, blankRuleChoice, type RuleChoices } from "../../app/hr/payroll/payroll-rule-choice-csv";
import { csvDocument } from "../../lib/scoped-csv-export";
import { parsePayrollInputCsv } from "../../app/hr/payroll/payroll-input-csv";
import { reference } from "./payroll-rule-choice-fixture";
beforeAll(() => vi.stubGlobal("crypto", webcrypto));
afterAll(() => vi.unstubAllGlobals());
async function sheet(value = reference) { return parsePayrollInputCsv(await payrollRuleChoiceCsv(value, {}), { maxCellLength: 65536 }); }
const direct = ["纳入", "收入", "直接录入", "", "", ""];
it("exports complete SHA-bound source and incomplete draft choices without UUIDs or invented roles", async () => {
  const choices: RuleChoices = { "item-0": { ...blankRuleChoice(), included: true } };
  const rows = parsePayrollInputCsv(await payrollRuleChoiceCsv(reference, choices), { maxCellLength: 65536 });
  expect(rows).toHaveLength(28); expect(rows[0]![2]).toBe(`'${createHash("sha256").update(JSON.stringify(reference)).digest("hex")}`);
  expect(rows[3]!.slice(13)).toEqual(["纳入", "", "", "", "", ""]);
  expect(rows.at(-1)![1]).toBe("'ITEM24"); expect(rows[3]![12]).toContain("原条件>0");
  const csv = await payrollRuleChoiceCsv(reference, choices); expect(csv).not.toContain("item-0"); expect(csv).not.toContain("synthetic-rules");
});
it("roundtrips all 25 versions, exact formula version and a 2000-character multiline rewrite with safe text", async () => {
  const rows = await sheet(); rows.slice(3).forEach(row => row.splice(13, 6, ...direct));
  rows[3]!.splice(15, 4, "原公式", "1", "2", "");
  const rewrite = "=\"原条件\"\n" + "x".repeat(1993); expect(rewrite).toHaveLength(2000);
  rows[4]!.splice(15, 4, "人工改写", "", "", rewrite);
  const result = await previewPayrollRuleChoiceCsv(csvDocument(rows), reference, {});
  expect(result.changes).toHaveLength(25); expect(result.choices["item-0"]!.formulaId).toBe("f2");
  expect(result.choices["item-1"]!.rewrite).toBe(rewrite); expect(result.choices["item-24"]!.role).toBe("earning");
  const exported = await payrollRuleChoiceCsv(reference, result.choices); expect(exported).toContain("'=\"\"原条件");
  expect((await previewPayrollRuleChoiceCsv(exported, reference, result.choices)).changes).toEqual([]);
});
it("blank rows preserve current choices; explicit exclusions clear only their item", async () => {
  const previous: RuleChoices = { "item-0": { ...blankRuleChoice(), included: true, role: "earning", source: "direct" } };
  const rows = await sheet(); rows[3]!.splice(13, 6, "", "", "", "", "", "");
  expect((await previewPayrollRuleChoiceCsv(csvDocument(rows), reference, previous)).choices["item-0"]).toEqual(previous["item-0"]);
  rows[3]![13] = "排除"; expect((await previewPayrollRuleChoiceCsv(csvDocument(rows), reference, previous)).choices["item-0"]!.included).toBe(false);
});
it.each(["missing", "duplicate", "foreign", "readonly", "condition", "version", "role", "source", "excluded", "blank", "tooLong", "directFormula"])("rejects %s atomically", async mode => {
  const rows = await sheet(); rows[3]!.splice(13, 6, ...direct);
  if (mode === "missing") rows.pop();
  if (mode === "duplicate") rows[4] = [...rows[3]!];
  if (mode === "foreign") rows.at(-1)![0] = "99";
  if (mode === "readonly") rows.at(-1)![12] = "[]changed";
  if (mode === "condition") rows[3]!.splice(15, 4, "原公式", "2", "1", "");
  if (mode === "version") rows[3]!.splice(15, 4, "原公式", "1", "99", "");
  if (mode === "role") rows[3]![14] = "guess";
  if (mode === "source") rows[3]![15] = "guess";
  if (mode === "excluded") rows[3]![13] = "排除";
  if (mode === "blank") rows[3]![13] = "";
  if (mode === "tooLong") rows[3]!.splice(15, 4, "人工改写", "", "", "x".repeat(2001));
  if (mode === "directFormula") rows[3]![16] = "1";
  const previous: RuleChoices = {}; await expect(previewPayrollRuleChoiceCsv(csvDocument(rows), reference, previous)).rejects.toThrow(); expect(previous).toEqual({});
});
it.each(["rule", "book", "itemVersion", "orphanFormula", "condition", "disabled", "nondecimal", "duplicateCode"])("rejects changed %s", async mode => {
  const rows = await sheet(), changed = structuredClone(reference);
  if (mode === "rule") changed.ruleSetId = "new";
  if (mode === "book") changed.book.id = "new";
  if (mode === "itemVersion") changed.items[0]!.versionNo++;
  if (mode === "orphanFormula") changed.formulas.at(-1)!.expression = "changed()";
  if (mode === "condition") changed.formulas[0]!.condition = "changed";
  if (mode === "disabled") changed.items[0]!.enabled = false;
  if (mode === "nondecimal") changed.items[0]!.valueType = "text";
  if (mode === "duplicateCode") changed.items[1]!.code = changed.items[0]!.code;
  rows[3]!.splice(13, 6, ...direct);
  await expect(previewPayrollRuleChoiceCsv(csvDocument(rows), changed, {})).rejects.toThrow();
  if (["disabled", "nondecimal", "duplicateCode"].includes(mode)) {
    const fresh = await sheet(changed); fresh[3]!.splice(13, 6, ...direct); fresh[4]!.splice(13, 6, ...direct);
    await expect(previewPayrollRuleChoiceCsv(csvDocument(fresh), changed, {})).rejects.toThrow();
  }
});
it("retains bounded input parser defaults and rejects unsupported configuration", () => {
  expect(() => parsePayrollInputCsv("x".repeat(1025))).toThrow("单元格");
  expect(parsePayrollInputCsv("x".repeat(2000), { maxCellLength: 2001 })[0]![0]).toHaveLength(2000);
  expect(() => parsePayrollInputCsv("x", { maxCellLength: Infinity })).toThrow();
});
it("roundtrips complete source formula catalogues above 64 KiB within the existing file budget", async () => {
  const large = structuredClone(reference);
  large.formulas.push(...Array.from({ length: 50 }, (_, index) => ({ ...reference.formulas[0]!, id: `large-${index}`, legacyFormulaId: 100 + index,
    expression: `="${"原文".repeat(800)}"`, condition: `条件${index}`, reusableSyntax: false, syntaxReason: "legacy_condition" as const })));
  const csv = await payrollRuleChoiceCsv(large, {});
  expect(csv.length).toBeGreaterThan(65536); expect(csv).toContain("条件49");
  expect((await previewPayrollRuleChoiceCsv(csv, large, {})).changes).toEqual([]);
  expect(() => parsePayrollInputCsv(csv)).toThrow("单元格");
  expect(() => parsePayrollInputCsv("x", { maxCellLength: 32 * 1024 * 1024 + 1 })).toThrow("限制");
});
it("exports excluded choices without any dormant effective fields", async () => {
  const previous: RuleChoices = { "item-0": { included: false, role: "tax", source: "rewrite", formulaId: "f2", rewrite: "[OLD]+1" } };
  const csv = await payrollRuleChoiceCsv(reference, previous);
  expect(parsePayrollInputCsv(csv, { maxCellLength: 65536 })[3]!.slice(13)).toEqual(["排除", "", "", "", "", ""]);
  expect((await previewPayrollRuleChoiceCsv(csv, reference, previous)).choices["item-0"]).toEqual(blankRuleChoice());
});
