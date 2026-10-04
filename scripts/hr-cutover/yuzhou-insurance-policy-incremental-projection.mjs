import { createHash } from "node:crypto";
import { readT5RetainedSource } from "./t5-retained-source-reader.mjs";
import { canonicalProfile } from "./yuzhou-profile-incremental-projection.mjs";
import { buildLegacyInsurancePolicyItems } from "./legacy-insurance-policy-normalization.mjs";

const kinds = Object.freeze(["oldage", "remedy", "losework", "fund", "wound", "bear"]);
const slots = Object.freeze([["", "base"], ["_e", "employer"], ["_p", "employee"], ["_pc", "supplement"]]);
const amountColumns = kinds.flatMap(kind => slots.flatMap(([suffix]) => [`${kind}${suffix}`, `${kind}${suffix}2`]));
const columns = ["id", "des", "rightscope", ...amountColumns];
const hash = value => createHash("sha256").update(value).digest("hex");
const fail = code => { throw Object.assign(new Error(code), { code }); };
const plain = value => value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
const nullableText = (value, max) => value === null || (typeof value === "string" && value.length <= max && !value.includes("\0") && value.isWellFormed());

export const YUZHOU_INSURANCE_POLICY_FIELD_COVERAGE = Object.freeze([
  ...[["id", "sourceIdentity"], ["des", "name"], ["rightscope", "scopeDescription"]].map(([sourceField, targetField]) => Object.freeze({ sourceField, targetField })),
  ...kinds.flatMap(kind => slots.flatMap(([suffix, component]) => [
    Object.freeze({ sourceField: `${kind}${suffix}`, targetField: `items.${kind}.${component}.rate`, transform: "percentage_points_divided_by_100" }),
    Object.freeze({ sourceField: `${kind}${suffix}2`, targetField: `items.${kind}.${component}.fixedAmount`, transform: "exact_fixed_addend" }),
  ])),
]);

/** Raw SQL numeric(18,3) values must remain strings; never round or use Number. */
function verifyAmount(value) {
  if (value === null) return;
  if (typeof value !== "string" || !/^[+-]?\d+(?:\.\d{1,3})?$/u.test(value)) fail("YUZHOU_INSURANCE_POLICY_AMOUNT_INVALID");
  const whole = value.replace(/^[+-]/u, "").split(".")[0].replace(/^0+/u, "") || "0";
  if (whole.length > 15) fail("YUZHOU_INSURANCE_POLICY_AMOUNT_INVALID");
}

export function verifyInsurancePolicySource(row) {
  if (!plain(row) || row.sourceTable !== "dbo.insure_method" || !plain(row.source)) fail("YUZHOU_INSURANCE_POLICY_SOURCE_INVALID");
  let source;
  try { ({ source } = readT5RetainedSource(row)); }
  catch { fail("YUZHOU_INSURANCE_POLICY_SOURCE_INVALID"); }
  if (!Number.isInteger(source.id) || source.id < -2147483648 || source.id > 2147483647
    || row.sourceKey !== String(source.id) || row.sourceIdentitySha256 !== hash(`dbo.insure_method\0${source.id}`)) fail("YUZHOU_INSURANCE_POLICY_SOURCE_INVALID");
  if (columns.some(key => !Object.hasOwn(source, key)) || Object.entries(source).some(([key, value]) => !columns.includes(key) && value !== null)) fail("YUZHOU_INSURANCE_POLICY_SCHEMA_CHANGED");
  if (!nullableText(source.des, 50) || !nullableText(source.rightscope, 30)) fail("YUZHOU_INSURANCE_POLICY_METADATA_INVALID");
  amountColumns.forEach(key => verifyAmount(source[key]));
  return { ...row, source };
}

/** Offline candidate only: no eligibility, effective dates, activation or posting. */
export function projectYuzhouInsurancePolicy(row) {
  const verified = verifyInsurancePolicySource(row);
  let items;
  try { items = buildLegacyInsurancePolicyItems(verified.source, kinds); }
  catch { fail("YUZHOU_INSURANCE_POLICY_NORMALIZATION_INVALID"); }
  const fields = { name: verified.source.des, scopeDescription: verified.source.rightscope, items };
  const candidate = { domain: "insurance_policy", sourceTable: "dbo.insure_method", sourceKey: `sha256:${row.sourceIdentitySha256}`, fields, rowDigest: "" };
  candidate.rowDigest = hash(canonicalProfile({ domain: candidate.domain, sourceTable: candidate.sourceTable, sourceKey: candidate.sourceKey, sourceUpdatedAt: null, fields }));
  return {
    candidate,
    admission: "pending_insurance_policy_api_executor",
    declaration: { sourceIdentitySha256: row.sourceIdentitySha256, sourceRowSha256: row.sourceRowSha256, disposition: "candidate_only", fieldCount: columns.length, personnelApplicability: "not_inferred", activated: false },
  };
}
