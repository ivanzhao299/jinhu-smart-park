interface ChargeTypeSource {
  id: string;
  chargeType: string;
}

interface LeaseSignatureState {
  status: string;
  signatureFileId: string | null;
}

export function housingLedgerChargeType(
  entryType: string,
  receivableId: string,
  receivables: ChargeTypeSource[]
): string {
  if (entryType.startsWith("deposit_")) return "deposit";
  return receivables.find((item) => item.id === receivableId)?.chargeType ?? "";
}

export function canActivateHousingLease(lease: LeaseSignatureState): boolean {
  return lease.status === "pending_signature" && Boolean(lease.signatureFileId);
}

export function housingSelectionAfterLoad(currentId: string, loadedIds: string[]): string {
  return loadedIds.includes(currentId) ? currentId : loadedIds[0] ?? "";
}
