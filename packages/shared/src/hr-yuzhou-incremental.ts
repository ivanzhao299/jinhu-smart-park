import limits from "./hr-yuzhou-incremental-limits.json";
export const YUZHOU_INCREMENTAL_MAX_PACKAGE_BYTES = limits.maxPackageBytes;
export const YUZHOU_INCREMENTAL_MAX_ITEMS = limits.maxItems;
import type { YuzhouProfileBaselineWitness } from "./hr-yuzhou-profile-baseline";
import type { YuzhouInitialBaselineWitness } from "./hr-yuzhou-initial-baseline";
export const YUZHOU_INCREMENTAL_CONTRACT_STATUSES = ["draft", "active", "expired", "terminated", "cancelled"] as const;

export const YUZHOU_INCREMENTAL_PACKAGE_VERSION = 1 as const;
export const YUZHOU_INCREMENTAL_DOMAINS = ["organization", "position", "employee", "profile", "contract"] as const;
export type YuzhouIncrementalDomain = (typeof YUZHOU_INCREMENTAL_DOMAINS)[number];

export type YuzhouIncrementalItem = {
  domain: YuzhouIncrementalDomain;
  sourceTable: string;
  sourceKey: string;
  sourceUpdatedAt?: string;
  rowDigest: string;
  fields: Record<string, unknown>;
  initialBaselineWitness?: YuzhouInitialBaselineWitness;
  profileBaselineWitness?: YuzhouProfileBaselineWitness;
  profileAliasAcceptance?: {
    version: 1;
    proof: "original_t5_alias_fields_v1";
    operationId: string;
    bindingSha256: string;
    fields: Array<"nativePlace" | "degree">;
  };
};

export type YuzhouIncrementalPackage = {
  version: typeof YUZHOU_INCREMENTAL_PACKAGE_VERSION;
  sourceSystem: "yuzhou-v10";
  manifestId: string;
  extractedAt: string;
  items: YuzhouIncrementalItem[];
};

export const YUZHOU_INCREMENTAL_FIELDS: Record<YuzhouIncrementalDomain, readonly string[]> = {
  organization: ["orgCode", "orgName", "orgType", "sortOrder", "status", "remark", "contactPhone", "plannedHeadcount", "legacySourceId", "legacyHierarchyLevel", "legacyManagerReference", "parentSourceKey"],
  position: ["positionCode", "positionName", "jobFamily", "jobLevel", "headcountLimit", "status", "remark", "authority", "legacyDepartmentReference", "legacyParentReference", "legacySourceId", "legacyUptoCode", "positionManual", "qualification", "responsibilities", "hierarchyLevel", "sortOrder", "orgSourceKey", "parentPositionSourceKey"],
  employee: ["orgSourceKey", "positionSourceKey", "employeeCode", "fullName", "employmentStatus", "employmentType", "hireDate", "workLocation", "workMobile", "workEmail"],
  profile: ["employeeSourceKey", "employeeSourceTable", "englishName", "gender", "dateOfBirth", "personalMobile", "personalEmail", "address", "idNumber", "nativePlace", "degree"],
  contract: ["employeeSourceKey", "employeeSourceTable", "contractTypeId", "contractStatus", "contractNo", "startDate", "endDate", "probationEndDate", "workType", "positionTitle"]
};

export function canonicalYuzhouIncrementalPackage(input: YuzhouIncrementalPackage): YuzhouIncrementalPackage {
  const domainOrder: Record<YuzhouIncrementalDomain, number> = { organization: 0, position: 1, employee: 2, profile: 3, contract: 4 };
  return {
    ...input,
    items: orderYuzhouIncrementalItems([...input.items].map(item => {
      const canonical = { ...item, fields: sortObject(item.fields) };
      if (canonical.sourceUpdatedAt === undefined) delete canonical.sourceUpdatedAt;
      if (canonical.profileBaselineWitness === undefined) delete canonical.profileBaselineWitness;
      if (canonical.profileAliasAcceptance === undefined) delete canonical.profileAliasAcceptance;
      if (canonical.initialBaselineWitness === undefined) delete canonical.initialBaselineWitness;
      return canonical;
    }).sort((a, b) =>
      domainOrder[a.domain] - domainOrder[b.domain]
      || `${a.sourceTable}:${a.sourceKey}`.localeCompare(`${b.sourceTable}:${b.sourceKey}`)))
  };
}

function sortObject(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
}

/** Stable dependency order survives canonicalization and package chunking. */
export function orderYuzhouIncrementalItems(items: YuzhouIncrementalItem[]): YuzhouIncrementalItem[] {
  const indexed = new Map<string, YuzhouIncrementalItem>();
  for (const item of items) {
    const key = `${item.domain}:${item.sourceKey}`;
    if (indexed.has(key)) throw new Error("YUZHOU_REUSABLE_INCREMENTAL_SOURCE_DUPLICATE");
    indexed.set(key, item);
  }
  const visiting = new Set<string>(), done = new Set<string>(), ordered: YuzhouIncrementalItem[] = [];
  function visit(item: YuzhouIncrementalItem) {
    const key = `${item.domain}:${item.sourceKey}`;
    if (visiting.has(key)) throw new Error("YUZHOU_SOURCE_DEPENDENCY_CYCLE");
    if (done.has(key)) return;
    visiting.add(key);
    for (const [field, domain] of [["parentSourceKey", "organization"], ["orgSourceKey", "organization"], ["parentPositionSourceKey", "position"], ["positionSourceKey", "position"], ["employeeSourceKey", "employee"]]) {
      const dependency = indexed.get(`${domain}:${item.fields[field!]}`);
      if (dependency) visit(dependency);
    }
    visiting.delete(key); done.add(key); ordered.push(item);
  }
  items.forEach(visit);
  return ordered;
}
