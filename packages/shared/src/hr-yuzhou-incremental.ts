import limits from "./hr-yuzhou-incremental-limits.json";
export const YUZHOU_INCREMENTAL_MAX_PACKAGE_BYTES = limits.maxPackageBytes;
export const YUZHOU_INCREMENTAL_MAX_ITEMS = limits.maxItems;
import type { YuzhouInitialBaselineWitness } from "./hr-yuzhou-initial-baseline";
export const YUZHOU_INCREMENTAL_CONTRACT_STATUSES = ["draft", "active", "expired", "terminated", "cancelled"] as const;

export const YUZHOU_INCREMENTAL_PACKAGE_VERSION = 1 as const;
export const YUZHOU_INCREMENTAL_DOMAINS = ["employee", "profile", "contract"] as const;
export type YuzhouIncrementalDomain = (typeof YUZHOU_INCREMENTAL_DOMAINS)[number];

export type YuzhouIncrementalItem = {
  domain: YuzhouIncrementalDomain;
  sourceTable: string;
  sourceKey: string;
  sourceUpdatedAt?: string;
  rowDigest: string;
  fields: Record<string, unknown>;
  initialBaselineWitness?: YuzhouInitialBaselineWitness;
};

export type YuzhouIncrementalPackage = {
  version: typeof YUZHOU_INCREMENTAL_PACKAGE_VERSION;
  sourceSystem: "yuzhou-v10";
  manifestId: string;
  extractedAt: string;
  items: YuzhouIncrementalItem[];
};

export const YUZHOU_INCREMENTAL_FIELDS: Record<YuzhouIncrementalDomain, readonly string[]> = {
  employee: ["employeeCode", "fullName", "employmentStatus", "employmentType", "hireDate", "workLocation", "workMobile", "workEmail"],
  profile: ["employeeSourceKey", "employeeSourceTable", "englishName", "gender", "dateOfBirth", "personalMobile", "personalEmail", "address", "idNumber"],
  contract: ["employeeSourceKey", "employeeSourceTable", "contractTypeId", "contractStatus", "contractNo", "startDate", "endDate", "probationEndDate", "workType", "positionTitle"]
};

export function canonicalYuzhouIncrementalPackage(input: YuzhouIncrementalPackage): YuzhouIncrementalPackage {
  const domainOrder: Record<YuzhouIncrementalDomain, number> = { employee: 0, profile: 1, contract: 2 };
  return {
    ...input,
    items: [...input.items].map(item => {
      const canonical = { ...item, fields: sortObject(item.fields) };
      if (canonical.sourceUpdatedAt === undefined) delete canonical.sourceUpdatedAt;
      if (canonical.initialBaselineWitness === undefined) delete canonical.initialBaselineWitness;
      return canonical;
    }).sort((a, b) =>
      domainOrder[a.domain] - domainOrder[b.domain]
      || `${a.sourceTable}:${a.sourceKey}`.localeCompare(`${b.sourceTable}:${b.sourceKey}`))
  };
}

function sortObject(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
}
