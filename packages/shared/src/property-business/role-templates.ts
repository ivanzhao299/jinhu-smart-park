import { TRACK_B_PERMISSION_BUNDLES, type PropertyPermissionBundle } from "./permission-bundles";

export type PropertyRoleTemplateCode =
  | "PROPERTY_OPERATIONS_MANAGER"
  | "PROPERTY_OPERATIONS_APPROVER"
  | "HOMESTAY_OPERATOR"
  | "HOUSING_OPERATOR"
  | "HOMESTAY_FINANCE"
  | "HOUSING_FINANCE"
  | "PROPERTY_AUDITOR";

export interface PropertyRoleTemplateDefinition {
  code: PropertyRoleTemplateCode;
  name: string;
  description: string;
  definitionVersion: number;
  definitionHash: string;
  bundleCodes: readonly string[];
  additionalPermissions: readonly string[];
  excludedPermissions: readonly string[];
  roleScope: "park";
  dataScopeRuleCode: "current_park";
  isSensitiveComplianceRole: boolean;
}

export interface PropertyPermissionBundleRevision {
  code: string;
  signingName: string;
  definitionVersion: number;
  definitionHash: string;
}

export interface PropertyRoleTemplateBundleReference {
  code: string;
  definitionVersion: number;
  definitionHash: string;
}

export const TRACK_B_PERMISSION_BUNDLE_REVISIONS = {
  "property-bundle:property-homestay-task-operator": {
    code: TRACK_B_PERMISSION_BUNDLES.HOMESTAY_TASK_OPERATOR.code,
    signingName: "民宿任务处理人",
    definitionVersion: 2,
    definitionHash: "7f37a1f402fa331a805e1bb601822ddddfc1a719a1ed723f72c65acdd98f723d"
  },
  "property-bundle:property-housing-operator": {
    code: TRACK_B_PERMISSION_BUNDLES.HOUSING_OPERATOR.code,
    signingName: "住房出租运营人员",
    definitionVersion: 1,
    definitionHash: "25ff2287f99d3c8c3f1db67a6f6ec28bbbed7bbc85cbc014617ffe287df30f33"
  },
  "property-bundle:property-asset-manager": {
    code: TRACK_B_PERMISSION_BUNDLES.ASSET_MANAGER.code,
    signingName: "共享房产资产管理员",
    definitionVersion: 2,
    definitionHash: "171bd526f60587378ee5ff944a84402964e299d683058526ad3f07f973394be7"
  },
  "property-bundle:property-homestay-finance-operator": {
    code: TRACK_B_PERMISSION_BUNDLES.HOMESTAY_FINANCE_OPERATOR.code,
    signingName: "民宿财务操作员",
    definitionVersion: 1,
    definitionHash: "a45cbf14acba5b7eacd82232ed33541746d96dfe1a16207d776a2ec89c0ee58b"
  },
  "property-bundle:property-housing-finance-operator": {
    code: TRACK_B_PERMISSION_BUNDLES.HOUSING_FINANCE_OPERATOR.code,
    signingName: "住房出租财务操作员",
    definitionVersion: 1,
    definitionHash: "08ad4214fe579d92203a2bae75e55c0257c40d391947ce11c9db9ba313d552ef"
  },
  "property-bundle:property-homestay-approver": {
    code: TRACK_B_PERMISSION_BUNDLES.HOMESTAY_APPROVER.code,
    signingName: "民宿审批人",
    definitionVersion: 1,
    definitionHash: "a332f427d5ebd7aab985041c72ba9e26ddd85b53647b00394e5d346c3167ea3c"
  },
  "property-bundle:property-housing-approver": {
    code: TRACK_B_PERMISSION_BUNDLES.HOUSING_APPROVER.code,
    signingName: "住房出租审批人",
    definitionVersion: 1,
    definitionHash: "ebc48ebd63433714db7049f69135f4296d3ef94be98b94e07e3ee37cea0725ff"
  },
  "property-bundle:property-auditor": {
    code: TRACK_B_PERMISSION_BUNDLES.AUDITOR.code,
    signingName: "房产业务审计员",
    definitionVersion: 1,
    definitionHash: "e54977e87bff8b36ff06bd2532da7d462fc76657cc3534e77831f39074fffa24"
  }
} as const satisfies Record<string, PropertyPermissionBundleRevision>;

const TRACK_B_PERMISSION_BUNDLE_REVISION_BY_CODE: Readonly<Record<string, PropertyPermissionBundleRevision>> =
  TRACK_B_PERMISSION_BUNDLE_REVISIONS;

export const PROPERTY_ROLE_FIELD_ACTION_CONTRACT = {
  sensitivePartyFields: ["mobile", "email", "identityDocumentType", "identityNumberMasked", "identityNumber"] as const,
  sensitiveReadPermission: "party:sensitive_read",
  defaultStandardTemplatesGrantSensitiveRead: false,
  approvalProjection: "minimal_summary" as const,
  fieldPolicyReadProjectionEnforced: ["hidden", "masked"] as const,
  fieldPolicyWriteEnforcementAvailable: false,
  financialActionsRequireExplicitPermissions: true,
  auditorReadOnlyByDefault: true
} as const;

export const PROPERTY_ROLE_TEMPLATE_DEFINITIONS = [
  {
    code: "PROPERTY_OPERATIONS_MANAGER",
    name: "房源经营管理员",
    description: "配置房源经营模式并管理统一占用；可发起审批，不可审批",
    definitionVersion: 1,
    definitionHash: "b99a427b74a2a08e256c9c6c76946df063813ab68458e60e67b2d8fbbc0b0b9e",
    bundleCodes: [TRACK_B_PERMISSION_BUNDLES.ASSET_MANAGER.code],
    additionalPermissions: [],
    excludedPermissions: ["property_approval:decide"],
    roleScope: "park",
    dataScopeRuleCode: "current_park",
    isSensitiveComplianceRole: false
  },
  {
    code: "PROPERTY_OPERATIONS_APPROVER",
    name: "房源经营审批人",
    description: "审批房产业务变更并读取必要任务摘要；不可发起经营变更",
    definitionVersion: 1,
    definitionHash: "ec8371f75e168bb260873f135d9ab1677123714770cff7ccea83e115a8015102",
    bundleCodes: [
      TRACK_B_PERMISSION_BUNDLES.HOMESTAY_APPROVER.code,
      TRACK_B_PERMISSION_BUNDLES.HOUSING_APPROVER.code
    ],
    additionalPermissions: [
      "asset:property-operations:page",
      "asset:property-occupancies:page",
      "asset:property-mode-transitions:page",
      "property_operation:read",
      "property_occupancy:read"
    ],
    excludedPermissions: [
      "property_approval:create",
      "property_approval:withdraw",
      "property_operation:update",
      "property_operation:transition_mode",
      "property_occupancy:create",
      "property_occupancy:activate",
      "property_occupancy:release",
      "property_occupancy:force_release"
    ],
    roleScope: "park",
    dataScopeRuleCode: "current_park",
    isSensitiveComplianceRole: false
  },
  {
    code: "HOMESTAY_OPERATOR",
    name: "民宿经办",
    description: "处理民宿任务；可发起所需业务申请，不可审批",
    definitionVersion: 2,
    definitionHash: "8e36158a12eff2a8ad38aa0a418463d72b3b00b433a7a547a7217c2cd71ec4e7",
    bundleCodes: [TRACK_B_PERMISSION_BUNDLES.HOMESTAY_TASK_OPERATOR.code],
    additionalPermissions: [
      "property_approval:create",
      "property_approval:read",
      "property_approval:withdraw"
    ],
    excludedPermissions: ["property_approval:decide"],
    roleScope: "park",
    dataScopeRuleCode: "current_park",
    isSensitiveComplianceRole: false
  },
  {
    code: "HOUSING_OPERATOR",
    name: "住房经办",
    description: "处理住房业务与任务；可发起申请，不可审批",
    definitionVersion: 1,
    definitionHash: "c5e76001d2a51adffda88b4f5138e5a68c1c7ba032822498decc6430a65ece95",
    bundleCodes: [TRACK_B_PERMISSION_BUNDLES.HOUSING_OPERATOR.code],
    additionalPermissions: [],
    excludedPermissions: ["property_approval:decide"],
    roleScope: "park",
    dataScopeRuleCode: "current_park",
    isSensitiveComplianceRole: false
  },
  {
    code: "HOMESTAY_FINANCE",
    name: "民宿财务",
    description: "民宿财务读取、登记与受审批约束的减免能力",
    definitionVersion: 1,
    definitionHash: "8bd6a8a04c21835375164f72dcb2cfd808ecabfc64b4ff409745c3806fdc8a05",
    bundleCodes: [TRACK_B_PERMISSION_BUNDLES.HOMESTAY_FINANCE_OPERATOR.code],
    additionalPermissions: [],
    excludedPermissions: ["property_approval:decide", "party:sensitive_read"],
    roleScope: "park",
    dataScopeRuleCode: "current_park",
    isSensitiveComplianceRole: false
  },
  {
    code: "HOUSING_FINANCE",
    name: "住房财务",
    description: "住房财务读取、登记与受审批约束的减免能力",
    definitionVersion: 1,
    definitionHash: "de2cc04dedcb6416ae1ffba66f6e81d15774344dcf7b20538f9047e8d80e2f1d",
    bundleCodes: [TRACK_B_PERMISSION_BUNDLES.HOUSING_FINANCE_OPERATOR.code],
    additionalPermissions: [],
    excludedPermissions: ["property_approval:decide", "party:sensitive_read"],
    roleScope: "park",
    dataScopeRuleCode: "current_park",
    isSensitiveComplianceRole: false
  },
  {
    code: "PROPERTY_AUDITOR",
    name: "房产业务审计",
    description: "房产业务只读审计；默认不读取住客或租客敏感身份资料",
    definitionVersion: 1,
    definitionHash: "30b072e062cfd05e72b89deb17238ed01fd31685d0077eb706d80b6a5c46f05b",
    bundleCodes: [TRACK_B_PERMISSION_BUNDLES.AUDITOR.code],
    additionalPermissions: ["property_operation:read", "property_occupancy:read"],
    excludedPermissions: ["party:sensitive_read"],
    roleScope: "park",
    dataScopeRuleCode: "current_park",
    isSensitiveComplianceRole: false
  }
] as const satisfies readonly PropertyRoleTemplateDefinition[];

export function findPropertyRoleTemplateDefinition(
  code: string | null | undefined
): PropertyRoleTemplateDefinition | null {
  if (!code) return null;
  return PROPERTY_ROLE_TEMPLATE_DEFINITIONS.find((definition) => definition.code === code) ?? null;
}

export function resolvePropertyRoleTemplatePermissionCodes(
  definitionOrCode: PropertyRoleTemplateDefinition | PropertyRoleTemplateCode
): readonly string[] {
  const definition =
    typeof definitionOrCode === "string"
      ? findPropertyRoleTemplateDefinition(definitionOrCode)
      : definitionOrCode;
  if (!definition) {
    throw new Error(`unknown-property-role-template:${definitionOrCode}`);
  }
  const bundlesByCode: Map<string, PropertyPermissionBundle> = new Map(
    Object.values(TRACK_B_PERMISSION_BUNDLES).map((bundle) => [bundle.code, bundle])
  );
  const permissions = new Set<string>();
  for (const bundleCode of definition.bundleCodes) {
    const bundle = bundlesByCode.get(bundleCode);
    if (!bundle) {
      throw new Error(`unknown-property-role-template-bundle:${definition.code}:${bundleCode}`);
    }
    for (const permission of bundle.permissions) {
      permissions.add(permission);
    }
  }
  for (const permission of definition.additionalPermissions) {
    permissions.add(permission);
  }
  for (const permission of definition.excludedPermissions) {
    permissions.delete(permission);
  }
  return [...permissions].sort();
}

export function resolvePropertyRoleTemplateBundleReferences(
  definitionOrCode: PropertyRoleTemplateDefinition | PropertyRoleTemplateCode
): readonly PropertyRoleTemplateBundleReference[] {
  const definition =
    typeof definitionOrCode === "string"
      ? findPropertyRoleTemplateDefinition(definitionOrCode)
      : definitionOrCode;
  if (!definition) {
    throw new Error(`unknown-property-role-template:${definitionOrCode}`);
  }
  return [...definition.bundleCodes].sort().map((bundleCode) => {
    const revision = TRACK_B_PERMISSION_BUNDLE_REVISION_BY_CODE[bundleCode];
    if (!revision) {
      throw new Error(`unknown-property-role-template-bundle-revision:${definition.code}:${bundleCode}`);
    }
    return {
      code: revision.code,
      definitionVersion: revision.definitionVersion,
      definitionHash: revision.definitionHash
    };
  });
}

export function canonicalizePropertyRoleTemplateBundleSignature(
  definitionOrCode: PropertyRoleTemplateDefinition | PropertyRoleTemplateCode
): string {
  return resolvePropertyRoleTemplateBundleReferences(definitionOrCode)
    .map((reference) => `${reference.code}@${reference.definitionVersion}:${reference.definitionHash}`)
    .join("\n");
}

export function canonicalizeTrackBPermissionBundleRevision(bundleCode: string): string {
  const revision = TRACK_B_PERMISSION_BUNDLE_REVISION_BY_CODE[bundleCode];
  const bundle = Object.values(TRACK_B_PERMISSION_BUNDLES).find((item) => item.code === bundleCode);
  if (!revision || !bundle) {
    throw new Error(`unknown-track-b-permission-bundle-revision:${bundleCode}`);
  }
  return [
    "property-bundle-v1",
    `${revision.code}\t${revision.signingName}`,
    bundle.permissions.map((permission, index) =>
      `${String(index + 1).padStart(4, "0")}\t${permission}\n`
    ).join("")
  ].join("\n");
}

export function canonicalizePropertyRoleTemplate(
  definition: Omit<PropertyRoleTemplateDefinition, "definitionHash">
): string {
  return [
    "property-role-template-v1",
    definition.code,
    definition.name,
    definition.description,
    String(definition.definitionVersion),
    definition.roleScope,
    definition.dataScopeRuleCode,
    definition.isSensitiveComplianceRole ? "sensitive" : "standard",
    [...definition.bundleCodes].sort().join(","),
    [...definition.additionalPermissions].sort().join(","),
    [...definition.excludedPermissions].sort().join(",")
  ].join("\n");
}

export function validatePropertyRoleTemplates(): void {
  const codes = new Set<string>();
  for (const definition of PROPERTY_ROLE_TEMPLATE_DEFINITIONS) {
    if (codes.has(definition.code)) {
      throw new Error(`duplicate-property-role-template:${definition.code}`);
    }
    codes.add(definition.code);
    if (
      definition.definitionVersion < 1
      || !/^[a-f0-9]{64}$/.test(definition.definitionHash)
    ) {
      throw new Error(`invalid-property-role-template-signature:${definition.code}`);
    }
    for (const reference of resolvePropertyRoleTemplateBundleReferences(definition)) {
      if (reference.definitionVersion < 1 || !/^[a-f0-9]{64}$/.test(reference.definitionHash)) {
        throw new Error(`invalid-property-role-template-bundle-signature:${definition.code}:${reference.code}`);
      }
    }
    if (definition.roleScope !== "park" || definition.dataScopeRuleCode !== "current_park") {
      throw new Error(`invalid-property-role-template-scope:${definition.code}`);
    }
    if (definition.isSensitiveComplianceRole) {
      throw new Error(`standard-template-must-not-be-sensitive:${definition.code}`);
    }
  }
}
