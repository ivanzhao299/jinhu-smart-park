const DECIMAL = /^[+-]?[0-9]+(?:\.[0-9]+)?$/u;

function decimalParts(value, label) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const text = String(value).trim();
  if (!DECIMAL.test(text)) throw new Error(`INSURANCE_POLICY_DECIMAL_INVALID:${label}`);
  const negative = text.startsWith("-");
  const unsigned = text.replace(/^[+-]/u, "");
  const [whole, fraction = ""] = unsigned.split(".");
  const digits = `${whole}${fraction}`.replace(/^0+(?=[0-9])/u, "");
  return { negative, digits, scale: fraction.length };
}

function formatDecimal({ negative, digits, scale }) {
  const padded = digits.padStart(scale + 1, "0");
  const split = padded.length - scale;
  const whole = padded.slice(0, split).replace(/^0+(?=[0-9])/u, "") || "0";
  const fraction = padded.slice(split).replace(/0+$/u, "");
  const zero = /^0+$/u.test(digits);
  return `${negative && !zero ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function normalizeLegacyFixedAmount(value, label = "fixed_amount") {
  const parts = decimalParts(value, label);
  return parts ? formatDecimal(parts) : null;
}

export function legacyPercentPointsToFraction(value, label = "percentage_rate") {
  const parts = decimalParts(value, label);
  if (!parts) return null;
  if (parts.negative && !/^0+$/u.test(parts.digits)) throw new Error(`INSURANCE_POLICY_RATE_NEGATIVE:${label}`);
  return formatDecimal({ ...parts, scale: parts.scale + 2 });
}

export function buildLegacyInsurancePolicyItems(source, kinds) {
  if (!source || typeof source !== "object" || !Array.isArray(kinds) || kinds.length === 0 || new Set(kinds).size !== kinds.length) {
    throw new Error("INSURANCE_POLICY_SOURCE_INVALID");
  }
  return kinds.map(kind => ({
    kind,
    variant: 1,
    baseRate: legacyPercentPointsToFraction(source[kind], `${kind}:baseRate`),
    employerRate: legacyPercentPointsToFraction(source[`${kind}_e`], `${kind}:employerRate`),
    employeeRate: legacyPercentPointsToFraction(source[`${kind}_p`], `${kind}:employeeRate`),
    supplementRate: legacyPercentPointsToFraction(source[`${kind}_pc`], `${kind}:supplementRate`),
    baseFixedAmount: normalizeLegacyFixedAmount(source[`${kind}2`], `${kind}:baseFixedAmount`),
    employerFixedAmount: normalizeLegacyFixedAmount(source[`${kind}_e2`], `${kind}:employerFixedAmount`),
    employeeFixedAmount: normalizeLegacyFixedAmount(source[`${kind}_p2`], `${kind}:employeeFixedAmount`),
    supplementFixedAmount: normalizeLegacyFixedAmount(source[`${kind}_pc2`], `${kind}:supplementFixedAmount`),
  }));
}
