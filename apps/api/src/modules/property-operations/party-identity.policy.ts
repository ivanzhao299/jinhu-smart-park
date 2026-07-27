export const PARTY_IDENTITY_DOCUMENT_TYPES = ["id_card", "passport"] as const;

export function isValidPartyIdentityNumber(
  documentType: string | null | undefined,
  identityNumber: string | null | undefined
): boolean {
  if (!identityNumber) return true;
  if (documentType === "id_card") return /^\d{17}[\dXx]$/.test(identityNumber);
  if (documentType === "passport") return /^[A-Za-z0-9]{5,20}$/.test(identityNumber);
  return false;
}
