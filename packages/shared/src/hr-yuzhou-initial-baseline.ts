/** Frozen subset of the original v1 production target model; parity is contract-tested. */
export const YUZHOU_INITIAL_CANONICALIZATION = "yuzhou-production-import-canonical-json-v1" as const;
export type YuzhouInitialBaselineWitness = {
  version: 1;
  operationId: string;
  phase: "T0" | "T2";
  canonicalizationVersion: typeof YUZHOU_INITIAL_CANONICALIZATION;
  targetId: string;
  projection: Record<string, unknown>;
};
export const YUZHOU_INITIAL_PROJECTION_FIELDS = {
  "hr_employee": [
    "tenant_id",
    "park_id",
    "employee_code",
    "full_name",
    "employment_type",
    "employment_status",
    "hire_date",
    "probation_end_date",
    "departure_date",
    "work_location",
    "work_mobile",
    "work_email",
    "remark",
    "primary_org_id",
    "position_id",
    "legacy_jobstate_code",
    "legacy_jobstate_name"
  ],
  "hr_contract": [
    "tenant_id",
    "park_id",
    "contract_no",
    "start_date",
    "end_date",
    "probation_end_date",
    "status",
    "contract_term_months",
    "signature_date",
    "effective_date",
    "position_title",
    "work_type",
    "department_name_snapshot",
    "first_signature_date",
    "last_signature_date",
    "cumulative_term_months",
    "renewal_count",
    "probation_months",
    "probation_salary",
    "base_salary",
    "confidentiality_agreement",
    "non_compete_agreement",
    "training_service_agreement",
    "legacy_file_reference",
    "legacy_text_present",
    "is_historical_import",
    "legacy_source_identity_sha256",
    "legacy_source_row_sha256",
    "source_snapshot",
    "remark",
    "employee_id",
    "contract_type_id"
  ]
} as const;

/** Match original JSON.stringify(canonicalize(...)), including integer-like object keys. */
export function canonicalYuzhouInitialJson(value: unknown): string {
  function canonical(input: unknown): unknown {
    if (input === null || typeof input === "string" || typeof input === "boolean") return input;
    if (typeof input === "number" && Number.isSafeInteger(input)) return input;
    if (Array.isArray(input)) return input.map(canonical);
    if (input && typeof input === "object" && Object.getPrototypeOf(input) === Object.prototype) {
      return Object.fromEntries(Object.keys(input).sort().map(key => [key, canonical((input as Record<string, unknown>)[key])]));
    }
    throw new Error("Invalid original canonical JSON value");
  }
  return JSON.stringify(canonical(value));
}
