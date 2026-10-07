import trainingScorePolicy from "./hr-yuzhou-training-score-policy.json";
export const YUZHOU_TRAINING_SCORE_POLICY = Object.freeze({ ...trainingScorePolicy });
import limits from "./hr-yuzhou-incremental-limits.json";
import { YUZHOU_RECORD_SOURCE_FIELDS } from "./hr-yuzhou-record-incremental";
import { HR_PERMISSIONS } from "./hr";
import { HR_INSURANCE_POLICY_PERMISSIONS } from "./hr-insurance-policy";
export const YUZHOU_INSURANCE_POLICY_IMPORT_MANAGE = [HR_PERMISSIONS.HR_INSURANCE_READ, HR_PERMISSIONS.HR_INSURANCE_AMOUNT_READ, HR_INSURANCE_POLICY_PERMISSIONS.VERSION_CREATE] as const;
export const YUZHOU_INSURANCE_POLICY_KINDS = ["oldage", "remedy", "losework", "fund", "wound", "bear"] as const;
export const YUZHOU_INSURANCE_POLICY_FACTOR_FIELDS = ["baseRate", "baseFixedAmount", "employerRate", "employerFixedAmount", "employeeRate", "employeeFixedAmount", "supplementRate", "supplementFixedAmount"] as const;
export type YuzhouInsurancePolicyBaselineWitness = { operationId: string; source: Record<string, unknown>; policy: { targetId: string; projection: Record<string, unknown> }; items: Array<{ targetId: string; projection: Record<string, unknown> }> };
export const YUZHOU_INCREMENTAL_MAX_PACKAGE_BYTES = limits.maxPackageBytes;
export const YUZHOU_INCREMENTAL_MAX_ITEMS = limits.maxItems;
import type { YuzhouProfileBaselineWitness } from "./hr-yuzhou-profile-baseline";
import type { YuzhouInitialBaselineWitness } from "./hr-yuzhou-initial-baseline";
export const YUZHOU_INCREMENTAL_CONTRACT_STATUSES = ["draft", "active", "expired", "terminated", "cancelled"] as const;

export const YUZHOU_INCREMENTAL_PACKAGE_VERSION = 1 as const;
export const YUZHOU_INCREMENTAL_DOMAINS = ["organization", "position", "employee", "profile", "contract", "family", "skill", "credential", "training_history", "insurance_policy"] as const;
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
  insurancePolicyBaselineWitness?: YuzhouInsurancePolicyBaselineWitness;
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
  family: ["employeeSourceKey", "employeeSourceTable", "relationship", "fullName", "contact", "birthDate", "workUnit", "jobTitle", "politicalStatus"],
  skill: ["employeeSourceKey", "employeeSourceTable", ...YUZHOU_RECORD_SOURCE_FIELDS.skill],
  credential: ["employeeSourceKey", "employeeSourceTable", ...YUZHOU_RECORD_SOURCE_FIELDS.credential],
  training_history: ["employeeSourceKey", "employeeSourceTable", "courseName", "startDate", "endDate", "hours", "memo", "score"],
  insurance_policy: ["name", "scopeDescription", "items"],
  contract: ["employeeSourceKey", "employeeSourceTable", "contractTypeId", "contractStatus", "contractNo", "startDate", "endDate", "probationEndDate", "workType", "positionTitle", "contractTermMonths", "signatureDate", "probationMonths", "renewalCount", "confidentialityAgreement", "nonCompeteAgreement", "trainingServiceAgreement", "probationSalary", "baseSalary"]
};

export function canonicalYuzhouIncrementalPackage(input: YuzhouIncrementalPackage): YuzhouIncrementalPackage {
  const domainOrder: Record<YuzhouIncrementalDomain, number> = { organization: 0, position: 1, employee: 2, profile: 3, contract: 4, family: 5, skill: 6, credential: 7, training_history: 8, insurance_policy: 9 };
  return {
    ...input,
    items: orderYuzhouIncrementalItems([...input.items].map(item => {
      const canonical = { ...item, fields: sortObject(item.fields) };
      if (canonical.sourceUpdatedAt === undefined) delete canonical.sourceUpdatedAt;
      if (canonical.profileBaselineWitness === undefined) delete canonical.profileBaselineWitness;
      if (canonical.profileAliasAcceptance === undefined) delete canonical.profileAliasAcceptance;
      if (canonical.initialBaselineWitness === undefined) delete canonical.initialBaselineWitness;
      if (canonical.insurancePolicyBaselineWitness === undefined) delete canonical.insurancePolicyBaselineWitness;
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
