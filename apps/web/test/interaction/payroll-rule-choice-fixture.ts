import type { FormalPayrollSourceReference } from "@jinhu/shared";
export const reference: FormalPayrollSourceReference = {
  ruleSetId: "synthetic-rules", book: { id: "synthetic-book", bookName: "合成账套", bookCode: "fixture:1", scheme: 1 },
  items: Array.from({ length: 25 }, (_, index) => ({ id: `item-${index}`, definitionId: `definition-${index}`, code: `ITEM${index}`, legacyName: `原名${index}`, displayName: `项目${index}`, versionNo: 1, valueType: "decimal", enabled: true, sortNo: index, legacyItemType: "原类型", legacyAddOrSub: "+", category: "unclassified", decimalScale: 2 })),
  formulas: [
    { id: "f1", itemVersionId: "item-0", legacyFormulaId: 1, versionNo: 1, expression: "[BASE]+1", condition: null, calculationOrder: 1, reusableSyntax: true, syntaxReason: null },
    { id: "f2", itemVersionId: "item-0", legacyFormulaId: 1, versionNo: 2, expression: "[BASE]+2", condition: null, calculationOrder: 1, reusableSyntax: true, syntaxReason: null },
    { id: "conditional", itemVersionId: "item-0", legacyFormulaId: 2, versionNo: 1, expression: "[BASE]*3", condition: "原条件>0", calculationOrder: 1, reusableSyntax: true, syntaxReason: null },
    { id: "orphan", itemVersionId: null, legacyFormulaId: 3, versionNo: 1, expression: "unknown()", condition: null, calculationOrder: 1, reusableSyntax: false, syntaxReason: "unsupported_syntax" },
  ],
};
