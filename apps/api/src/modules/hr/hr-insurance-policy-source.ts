import { createHash } from "node:crypto";
import { normalizeInsurancePolicyFactors } from "./hr-insurance-calculation";

// Both displayed-source checks and durable copies hash the same ordered projection.
export const HR_INSURANCE_SOURCE_FACTOR_COLUMNS = "id,version,insurance_kind,base_rate,employer_rate,employee_rate,supplement_rate,base_fixed_amount,employer_fixed_amount,employee_fixed_amount,supplement_fixed_amount";
export interface InsuranceSourceFactor {
  id: string; version: number; insurance_kind: Parameters<typeof normalizeInsurancePolicyFactors>[0][number]["insuranceKind"];
  base_rate: string | null; employer_rate: string | null; employee_rate: string | null; supplement_rate: string | null;
  base_fixed_amount: string | null; employer_fixed_amount: string | null; employee_fixed_amount: string | null; supplement_fixed_amount: string | null;
}
export const insuranceSourceFactorsHash = (rows: InsuranceSourceFactor[]) => createHash("sha256").update(JSON.stringify(rows)).digest("hex");
export const insuranceSourceFactorItems = (rows: InsuranceSourceFactor[]) => rows.map(f => ({ insuranceKind: f.insurance_kind, factors: {
  base: { rate: f.base_rate, fixedAmount: f.base_fixed_amount }, employer: { rate: f.employer_rate, fixedAmount: f.employer_fixed_amount },
  employee: { rate: f.employee_rate, fixedAmount: f.employee_fixed_amount }, supplement: { rate: f.supplement_rate, fixedAmount: f.supplement_fixed_amount },
} }));
