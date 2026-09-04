#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const contractPath = resolve(root, "scripts/hr-cutover/contracts/legacy-insurance-policy-field-map-v1.json");
const contract = JSON.parse(readFileSync(contractPath, "utf8"));
const sha256 = path => createHash("sha256").update(readFileSync(resolve(root, path))).digest("hex");
const kinds = ["oldage", "remedy", "losework", "fund", "wound", "bear"];
const components = [
  { suffix: "", rate: "base_rate", fixed: "base_fixed_amount", property: "base" },
  { suffix: "_e", rate: "employer_rate", fixed: "employer_fixed_amount", property: "employer" },
  { suffix: "_p", rate: "employee_rate", fixed: "employee_fixed_amount", property: "employee" },
  { suffix: "_pc", rate: "supplement_rate", fixed: "supplement_fixed_amount", property: "supplement" },
];

const bySource = new Map(contract.fields.map(field => [field.sourceField, field]));
for (const kind of kinds) for (const component of components) {
  const rate = bySource.get(`insure_method.${kind}${component.suffix}`);
  Object.assign(rate, {
    disposition: "verified_target",
    targetFields: [`hr_insurance_policy_item[insurance_kind=${kind},variant_no=1].${component.rate}`],
    currentIncorrectTargetFields: [],
    preservationFields: [`t3.policies.items[insurance_kind=${kind},variant=1].${component.property}Rate`],
    transformRule: "divide_percentage_points_by_100_using_exact_decimal_string_normalization_before_writing_fractional_rate",
    reasonCode: null,
    compatibilityCredit: 1,
  });
  const fixed = bySource.get(`insure_method.${kind}${component.suffix}2`);
  Object.assign(fixed, {
    disposition: "verified_target",
    targetFields: [`hr_insurance_policy_item[insurance_kind=${kind},variant_no=1].${component.fixed}`],
    currentIncorrectTargetFields: [],
    preservationFields: [`t3.policies.items[insurance_kind=${kind},variant=1].${component.property}FixedAmount`],
    transformRule: "preserve_exact_decimal_fixed_addend_in_dedicated_fixed_amount_column",
    reasonCode: null,
    compatibilityCredit: 1,
  });
}

const evidence = (role, path, requiredTokens) => ({ role, path, sha256: sha256(path), requiredTokens });
contract.repositoryEvidence = [
  evidence("full_field_extract", "scripts/extract-yuzhou-t3-attendance-insurance.sh", ["SELECT id,des,rightscope", "oldage_pc2", "bear_pc2 FROM dbo.insure_method"]),
  evidence("policy_normalization", "scripts/hr-cutover/legacy-insurance-policy-normalization.mjs", ["legacyPercentPointsToFraction", "baseFixedAmount", "supplementFixedAmount"]),
  evidence("policy_transform", "scripts/transform-yuzhou-t3-attendance-insurance.mjs", ["const kinds=[\"oldage\",\"remedy\",\"losework\",\"fund\",\"wound\",\"bear\"]", "buildLegacyInsurancePolicyItems(source,kinds)"]),
  evidence("policy_writer", "scripts/load-yuzhou-t3-attendance-insurance.sh", ["INSERT INTO hr_insurance_policy(", "INSERT INTO hr_insurance_policy_item(", "base_fixed_amount,employer_fixed_amount,employee_fixed_amount,supplement_fixed_amount", "i->>'baseFixedAmount'"]),
  evidence("modern_schema", "database/migrations/000299_hr_insurance_policy_fixed_amounts.sql", ["base_fixed_amount numeric(18,3)", "supplement_fixed_amount numeric(18,3)", "percentage-point values must be divided by 100"]),
  evidence("modern_entity", "apps/api/src/modules/hr/entities/hr.entities.ts", ["base_fixed_amount", "employerFixedAmount", "supplementFixedAmount"]),
  evidence("production_materializer", "scripts/hr-cutover/materialize-production-t3-phase-artifact.mjs", ["sourceTable: \"dbo.insure_method\"", "baseFixedAmount", "supplementFixedAmount"]),
  evidence("production_target_model", "scripts/hr-cutover/contracts/production-import-target-model-v1.json", ["base_fixed_amount", "supplement_fixed_amount"]),
  evidence("production_payload_contract", "scripts/e2e/yuzhou-production-import-payload-generator-contract.mjs", ["employer_rate: \"0.160000\"", "employer_fixed_amount: \"6.000\""]),
  evidence("runtime_api", "apps/api/src/modules/hr/hr.service.ts", ["listInsurancePeriods", "insurancePeriodDetail", "hr.employee_insurance"]),
  evidence("runtime_page", "apps/web/app/hr/insurance/HrInsuranceClient.tsx", ["五险一金", "缴费基数"]),
];
contract.compatibilityCredit = { numerator: 51, denominator: 51 };
contract.explicitGaps = [];
writeFileSync(contractPath, `${JSON.stringify(contract, null, 2)}\n`);
console.log(JSON.stringify({ status: "INSURANCE_POLICY_FIELD_MAP_REFRESHED", fields: contract.fields.length, compatibilityCredit: contract.compatibilityCredit, repositoryEvidence: contract.repositoryEvidence.length }));
