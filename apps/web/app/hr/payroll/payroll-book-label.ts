import type { FormalPayrollBookOption } from "@jinhu/shared";

export function payrollBookLabel(book: FormalPayrollBookOption): string {
  const name = (book.bookName ?? "").replace(/\p{Default_Ignorable_Code_Point}/gu, "").normalize("NFC").replace(/\s+/gu, " ").trim();
  return /\p{L}/u.test(name) ? `${name} · 账套 ${book.scheme}` : `工资账套 ${book.scheme}`;
}

export function payrollBookOptions(books: FormalPayrollBookOption[]): Array<FormalPayrollBookOption & { label: string }> {
  const unique = [...new Map(books.map(book => [book.id, book])).values()];
  let labels = unique.map(payrollBookLabel);
  for (let pass = 0; pass <= unique.length; pass++) {
    const counts = new Map<string, number>();
    labels.forEach(label => counts.set(label, (counts.get(label) ?? 0) + 1));
    if (labels.every(label => counts.get(label) === 1)) return unique.map((book, index) => ({ ...book, label: labels[index]! }));
    labels = labels.map((label, index) => counts.get(label)! > 1 ? `${label}（${[...unique[index]!.bookCode].map(character => /^[!-~]$/.test(character) && character !== "\\" ? character : `\\u{${character.codePointAt(0)!.toString(16)}}`).join("")}）` : label);
  }
  throw new Error("工资账套业务编号重复，请刷新账套列表");
}
