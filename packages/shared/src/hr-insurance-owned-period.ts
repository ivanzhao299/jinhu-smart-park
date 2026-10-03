/** Intentional grants only; no automatic role or module-derived write authority. */
export const HR_INSURANCE_OWNED_PERMISSIONS = {
  PREVIEW_CREATE: "hr:insurance_period:preview_create",
  CONFIRM: "hr:insurance_period:confirm",
  CLOSE: "hr:insurance_period:close",
  CORRECT: "hr:insurance_period:correct",
} as const;

export type HrInsuranceOwnedKind = "oldage" | "remedy" | "losework" | "wound" | "bear" | "fund";
export type HrInsuranceOwnedComponent = "base" | "employer" | "employee" | "supplement";
export interface HrInsuranceOwnedCalculation {
  engineVersion: string; policyVersion: number; includeFund: boolean;
  items: Array<{ insuranceKind: HrInsuranceOwnedKind; contributionBase: string; amounts: Record<HrInsuranceOwnedComponent, string> }>;
  totals: Record<HrInsuranceOwnedComponent, string>;
}
export interface HrInsuranceOwnedPreviewRequest {
  requestId: string; employeeId: string; expectedEmployeeVersion: number;
  policyVersionId: string; expectedDefinitionHash: string; periodMonth: string; includeFund: boolean;
  bases: Array<{ insuranceKind: HrInsuranceOwnedKind; contributionBase: string }>;
}
export interface HrInsuranceOwnedConfirmRequest { requestId: string; previewId: string; expectedPreviewHash: string; reason: string; }
export interface HrInsuranceOwnedCorrectRequest extends HrInsuranceOwnedConfirmRequest { previousRevisionId: string; expectedPeriodVersion: number; }
export interface HrInsuranceOwnedCloseRequest { requestId: string; revisionId: string; expectedPeriodVersion: number; reason: string; }
export interface HrInsuranceOwnedPreview {
  id: string; employeeId: string; employeeVersion: number; policyVersionId: string; periodMonth: string; includeFund: boolean;
  previewHash: string; expiresAt: string; calculation: HrInsuranceOwnedCalculation; mode: "owned_preview"; confirmationRequiresRevalidation: true;
}
export interface HrInsuranceOwnedRevision {
  id: string; employeeId: string; periodMonth: string; revisionNo: number; previewId: string; previousRevisionId: string | null;
  previewHash: string; calculation: HrInsuranceOwnedCalculation; sourceKind: "modern_confirmed";
}
export interface HrInsuranceOwnedPeriod extends HrInsuranceOwnedRevision { status: "confirmed" | "closed"; current: boolean; }
export interface HrInsuranceOwnedPeriodListItem extends HrInsuranceOwnedPeriod { employeeCode: string; fullName: string; }
export interface HrInsuranceOwnedClose { id: string; revisionId: string; revisionNo: number; status: "closed"; }
export interface HrInsuranceOwnedEmployeeOption { id: string; employeeCode: string; fullName: string; version: number; employmentStatus: string; previewEligible: boolean; }
