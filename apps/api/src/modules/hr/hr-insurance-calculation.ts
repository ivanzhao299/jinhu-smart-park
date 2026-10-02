import { BadRequestException } from "@nestjs/common";

export const HR_INSURANCE_ENGINE_VERSION = "jinhu-insurance-decimal-v1";
export const HR_INSURANCE_KINDS = ["oldage", "remedy", "losework", "wound", "bear", "fund"] as const;
const COMPONENTS = ["base", "employer", "employee", "supplement"] as const;
type Kind = typeof HR_INSURANCE_KINDS[number];
type Component = typeof COMPONENTS[number];
type Factors = Readonly<Record<Component, { rate: string | null; fixedAmount: string | null }>>;
export type InsuranceCalculationItem = {
  insuranceKind: Kind;
  contributionBase: string | null;
  factors: Factors;
};
const MAX_NUMERIC_18 = 999999999999999999n;

function fail(reason: string): never {
  throw new BadRequestException(`INSURANCE_CALCULATION_INVALID: ${reason}`);
}

function decimal(value: string | null, scale: number, label: string): bigint {
  if (typeof value !== "string" || value.length > 24 || !/^-?\d+(?:\.\d+)?$/u.test(value)) fail(`${label} missing or invalid`);
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".");
  if (fraction.length > scale) fail(`${label} precision exceeds storage scale`);
  const amount = BigInt(whole!) * 10n ** BigInt(scale) + BigInt(fraction.padEnd(scale, "0"));
  if (amount > MAX_NUMERIC_18) fail(`${label} exceeds numeric(18,${scale})`);
  return negative ? -amount : amount;
}

function formatCents(value: bigint): string {
  if (value < 0n || value > MAX_NUMERIC_18) fail("calculated amount outside numeric(18,2)");
  return `${value / 100n}.${(value % 100n).toString().padStart(2, "0")}`;
}

/** Modern calculation only: imported history is never recalculated or mutated. */
export function calculateInsurancePreview(input: {
  policyVersion: number;
  includeFund: boolean;
  items: readonly InsuranceCalculationItem[];
}) {
  if (!Number.isSafeInteger(input.policyVersion) || input.policyVersion < 1) fail("policy version required");
  if (typeof input.includeFund !== "boolean") fail("explicit fund inclusion required");
  if (!Array.isArray(input.items) || input.items.length !== HR_INSURANCE_KINDS.length) fail("six policy kinds required");
  const byKind = new Map<Kind, InsuranceCalculationItem>();
  for (const item of input.items) {
    if (!item || !HR_INSURANCE_KINDS.includes(item.insuranceKind) || byKind.has(item.insuranceKind)) fail("unknown or duplicate policy kind");
    byKind.set(item.insuranceKind, item);
  }
  const totals: Record<Component, bigint> = { base: 0n, employer: 0n, employee: 0n, supplement: 0n };
  const items = HR_INSURANCE_KINDS.map(insuranceKind => {
    const item = byKind.get(insuranceKind);
    if (!item) fail("missing policy kind");
    const contributionBase = decimal(item.contributionBase, 2, "contribution base");
    if (contributionBase < 0n) fail("negative contribution base requires review");
    const amounts = {} as Record<Component, string>;
    for (const component of COMPONENTS) {
      const factor = item.factors?.[component];
      if (!factor) fail("missing policy component");
      const rate = decimal(factor.rate, 6, "fractional rate");
      if (rate < 0n) fail("negative policy rate");
      // Only an explicitly null fixed addend means zero, as in the frozen source rule.
      const fixed = factor.fixedAmount === null ? 0n : decimal(factor.fixedAmount, 3, "fixed addend");
      // Base in cents * rate in millionths + addend in mills. Round once, after addition.
      const numerator = contributionBase * rate + fixed * 100000n;
      if (numerator < 0n) fail("negative calculated amount requires review");
      const cents = numerator / 1000000n + (numerator % 1000000n >= 500000n ? 1n : 0n);
      amounts[component] = formatCents(cents);
      if (insuranceKind !== "fund" || input.includeFund) totals[component] += cents;
    }
    return { insuranceKind, contributionBase: formatCents(contributionBase), amounts };
  });
  return {
    engineVersion: HR_INSURANCE_ENGINE_VERSION,
    policyVersion: input.policyVersion,
    includeFund: input.includeFund,
    items,
    totals: {
      base: formatCents(totals.base), employer: formatCents(totals.employer),
      employee: formatCents(totals.employee), supplement: formatCents(totals.supplement),
    },
  };
}
