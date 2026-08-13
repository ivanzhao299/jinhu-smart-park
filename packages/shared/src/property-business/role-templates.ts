import { TRACK_B_PERMISSION_BUNDLES } from "./permission-bundles";

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
    definitionVersion: 1,
    definitionHash: "c534047821ae825a4104503ae6d5c8df2da625199b6a2471b545c230aba67267",
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
    if (definition.definitionVersion < 1 || !/^[a-f0-9]{64}$/.test(definition.definitionHash)) {
      throw new Error(`invalid-property-role-template-signature:${definition.code}`);
    }
    if (definition.roleScope !== "park" || definition.dataScopeRuleCode !== "current_park") {
      throw new Error(`invalid-property-role-template-scope:${definition.code}`);
    }
    if (definition.isSensitiveComplianceRole) {
      throw new Error(`standard-template-must-not-be-sensitive:${definition.code}`);
    }
  }
}
