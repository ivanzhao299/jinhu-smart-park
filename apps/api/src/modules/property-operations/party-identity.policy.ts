export const PARTY_IDENTITY_DOCUMENT_TYPES = ["id_card", "passport"] as const;

export function normalizePartyIdentityNumber(
  documentType: string | null | undefined,
  identityNumber: string | null | undefined
): string | null {
  const normalized = identityNumber?.trim();
  if (!normalized) return null;
  return documentType === "id_card" ? normalized.toUpperCase() : normalized;
}

export function isValidPartyIdentityNumber(
  documentType: string | null | undefined,
  identityNumber: string | null | undefined
): boolean {
  if (!identityNumber) return true;
  if (documentType === "id_card") return /^\d{17}[\dXx]$/.test(identityNumber);
  if (documentType === "passport") return /^[A-Za-z0-9]{5,20}$/.test(identityNumber);
  return false;
}

export function didPartyIdentityChange(
  previousDocumentType: string | null,
  previousIdentityHash: string | null,
  nextDocumentType: string | null,
  nextIdentityHash: string | null
): boolean {
  return previousDocumentType !== nextDocumentType || previousIdentityHash !== nextIdentityHash;
}
