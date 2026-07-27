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

export function housingLeaseContextStillCurrent(originatingLeaseId: string, currentLeaseId: string): boolean {
  return Boolean(originatingLeaseId) && originatingLeaseId === currentLeaseId;
}

export function canRechargeHousingLease(status: string | undefined): boolean {
  return Boolean(status && ["active", "expiring", "checkout_pending"].includes(status));
}
