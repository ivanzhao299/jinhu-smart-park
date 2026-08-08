import type { HousingLeaseResponse } from "@jinhu/shared";

export async function housingLeaseProjectionVersion(lease: HousingLeaseResponse): Promise<string> {
  const canonical = JSON.stringify({
    id: lease.id,
    leaseCode: lease.leaseCode,
    unitId: lease.unitId,
    tenantPartyId: lease.tenantPartyId,
    startDate: lease.startDate,
    endDate: lease.endDate,
    status: lease.status,
    paymentCycleMonths: lease.paymentCycleMonths,
    signatureFileId: lease.signatureFileId ?? null,
    monthlyRent: lease.monthlyRent ?? null,
    depositAmount: lease.depositAmount ?? null
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `sha256:${hex}`;
}

export function housingRepairSubmissionBlocked(state: {
  hasLease: boolean;
  queuedUploadCount: number;
  removing: boolean;
  submitting: boolean;
  uploading: boolean;
}): boolean {
  return !state.hasLease || state.queuedUploadCount > 0 || state.removing || state.submitting || state.uploading;
}

export function beginHousingRepairQueueGate(hasLease: boolean, canUpload: boolean): boolean {
  return hasLease && canUpload;
}
