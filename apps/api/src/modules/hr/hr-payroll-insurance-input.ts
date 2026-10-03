import { ConflictException } from "@nestjs/common";

const KIND_NAMES = {
  oldage: "养老保险", remedy: "医疗保险", losework: "失业保险",
  wound: "工伤保险", bear: "生育保险", fund: "住房公积金",
} as const;
const COMPONENT_NAMES = {
  totalAmount: "政策合计金额", employerAmount: "单位金额",
  employeeAmount: "个人金额", supplementAmount: "补充金额",
} as const;
type Component = keyof typeof COMPONENT_NAMES;
type Kind = keyof typeof KIND_NAMES;
export type PayrollInsuranceAmountFact = {
  insuranceKind: string;
  totalAmount: string | null;
  employerAmount: string | null;
  employeeAmount: string | null;
  supplementAmount: string | null;
};
const REFERENCES = new Map<string, { kinds: Kind[]; component: Component }>();
for (const [kind, label] of Object.entries(KIND_NAMES)) {
  for (const [component, suffix] of Object.entries(COMPONENT_NAMES)) {
    REFERENCES.set(`${label}${suffix}`, { kinds: [kind as Kind], component: component as Component });
  }
}
for (const [component, suffix] of Object.entries(COMPONENT_NAMES)) {
  REFERENCES.set(`五险${suffix}`, {
    kinds: ["oldage", "remedy", "losework", "wound", "bear"], component: component as Component,
  });
}
export const HR_PAYROLL_INSURANCE_REFERENCE_CODES: ReadonlySet<string> = new Set(REFERENCES.keys());

/** Project only reviewed formula dependencies. Missing facts never imply zero.
 * Policy total is an independent source component, not the sum of other columns.
 * Five-insurance aggregates deliberately exclude the housing fund.
 */
export function projectPayrollInsuranceInputs(
  facts: ReadonlyArray<PayrollInsuranceAmountFact>, dependencies: ReadonlyArray<string>,
): Record<string, string> {
  const output: Record<string, string> = {};
  for (const dependency of new Set(dependencies)) {
    if (!dependency.startsWith("hr:")) continue;
    const reference = REFERENCES.get(dependency.slice(3));
    if (!reference) continue;
    let scaled = 0n;
    for (const kind of reference.kinds) {
      const matches = facts.filter(fact => fact.insuranceKind === kind);
      if (matches.length !== 1) throw new ConflictException("Required insurance amount kind is missing or ambiguous");
      const value = matches[0]![reference.component];
      if (value == null || !/^-?\d{1,16}(?:\.\d{1,4})?$/u.test(value)) {
        throw new ConflictException("Required insurance amount is missing or invalid");
      }
      const negative = value.startsWith("-");
      const [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".");
      const amount = BigInt(whole!) * 10000n + BigInt(fraction.padEnd(4, "0"));
      scaled += negative ? -amount : amount;
    }
    if (scaled > 99999999999999999999n || scaled < -99999999999999999999n) {
      throw new ConflictException("Required insurance amount overflows payroll precision");
    }
    const absolute = scaled < 0n ? -scaled : scaled;
    output[dependency] = `${scaled < 0n ? "-" : ""}${absolute / 10000n}.${(absolute % 10000n).toString().padStart(4, "0")}`;
  }
  return output;
}
