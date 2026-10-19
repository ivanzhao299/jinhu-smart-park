export type PayrollRuleHandoffIntent = {
  legacyBatchId: string;
  month: string;
  bookId: string;
  bookName: string;
  scheme: number;
};

export function samePayrollRuleHandoff(
  left: PayrollRuleHandoffIntent,
  right: { legacyBatchId: string; month: string; bookId: string; scheme: number },
): boolean {
  return left.legacyBatchId === right.legacyBatchId
    && left.month === right.month
    && left.bookId === right.bookId
    && left.scheme === right.scheme;
}
