import type { HrPayrollInsuranceEvidence } from "@jinhu/shared";

/** Read only the run's frozen identity; never substitute a current revision. */
export function payrollInsuranceEvidence(row: Record<string, unknown>): HrPayrollInsuranceEvidence | null {
  const historical = row.insuranceHistoricalId;
  const modern = row.insuranceModernId;
  if (Boolean(historical) === Boolean(modern)) return null;
  const sourceId = modern || historical;
  const version = row.insuranceFrozenVersion;
  if (typeof sourceId !== "string" || sourceId !== row.insuranceFrozenId
    || typeof version !== "string" || !/^[1-9]\d{0,9}$/u.test(version)
    || BigInt(version) > 2147483647n) return null;
  if (modern) {
    const snapshotHash = row.insuranceFrozenHash;
    if (row.insuranceFrozenFormat !== "insurance-modern-v1" || typeof snapshotHash !== "string"
      || !/^[0-9a-f]{64}$/u.test(snapshotHash)) return null;
    return { sourceKind: "modern_confirmed", sourceId, version, snapshotHash };
  }
  if (row.insuranceFrozenFormat != null && row.insuranceFrozenFormat !== "insurance-facts-v1") return null;
  return { sourceKind: "historical", sourceId, version };
}
