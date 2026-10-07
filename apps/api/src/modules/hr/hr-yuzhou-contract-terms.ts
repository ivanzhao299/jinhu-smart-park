import { BadRequestException } from "@nestjs/common";

/** Existing formal columns only; original years and signature history stay separate. */
export const incrementalContractTermColumns: Record<string, string> = {
  contractTermMonths: "contract_term_months",
  signatureDate: "signature_date",
  probationMonths: "probation_months",
  renewalCount: "renewal_count",
  confidentialityAgreement: "confidentiality_agreement",
  nonCompeteAgreement: "non_compete_agreement",
  trainingServiceAgreement: "training_service_agreement",
};

export function validateIncrementalContractTerm(field: string, value: unknown): boolean {
  if (!Object.prototype.hasOwnProperty.call(incrementalContractTermColumns, field)) return false;
  if (field.endsWith("Agreement")) {
    if (typeof value !== "boolean") throw new BadRequestException("CONTRACT_AGREEMENT_INVALID");
  } else if (field === "signatureDate") {
    if (value !== null && (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)
      || !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0,10) !== value)) {
      throw new BadRequestException("CONTRACT_SIGNATURE_DATE_INVALID");
    }
  } else {
    const maximum = field === "probationMonths" ? 120 : field === "contractTermMonths" ? 1200 : 2147483647;
    if ((value === null && field === "renewalCount") || (value !== null && (!Number.isInteger(value)
      || Number(value) < 0 || Number(value) > maximum))) throw new BadRequestException("CONTRACT_TERM_INTEGER_INVALID");
  }
  return true;
}
