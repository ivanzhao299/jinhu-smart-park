import type { EnabledModuleContext, RoleContext, UserParkContext } from "./index";

export const MOBILE_BOOTSTRAP_CONTRACT_VERSION = "mobile-bootstrap-v1" as const;

export const MOBILE_PORTALS = ["employee", "owner"] as const;
export type MobilePortal = (typeof MOBILE_PORTALS)[number];

export const MOBILE_CAPABILITIES = [
  "employee.home.view",
  "employee.engineering.view",
  "employee.inspection.view",
  "employee.inspection.execute",
  "employee.workorder.view",
  "employee.workorder.accept",
  "employee.workorder.start",
  "employee.workorder.finish",
  "employee.hazard.create",
  "owner.home.view",
  "owner.service.create",
  "owner.service.view",
  "owner.service.confirm",
  "owner.service.evaluate"
] as const;

export type MobileCapability = (typeof MOBILE_CAPABILITIES)[number];

export interface MobileCapabilityRule {
  capability: MobileCapability;
  portal: MobilePortal;
  module: string;
  anyPermissions: readonly string[];
  ownerIdentityRequired?: boolean;
}

export const MOBILE_OWNER_ROLE_CODES = ["TENANT_USER", "CUSTOMER", "PARK_TENANT"] as const;

export const MOBILE_CAPABILITY_MANIFEST: readonly MobileCapabilityRule[] = [
  {
    capability: "employee.engineering.view",
    portal: "employee",
    module: "engineering",
    anyPermissions: [
      "ENGINEERING_DASHBOARD_VIEW",
      "ENGINEERING_PROJECT_VIEW",
      "ENGINEERING_PLAN_VIEW",
      "ENGINEERING_DAILY_REPORT_VIEW",
      "ENGINEERING_INSPECTION_VIEW",
      "ENGINEERING_RECTIFICATION_VIEW",
      "ENGINEERING_ACCEPTANCE_VIEW"
    ]
  },
  {
    capability: "employee.inspection.view",
    portal: "employee",
    module: "safety",
    anyPermissions: ["safety_inspect_task:my", "safety_inspect_task:read"]
  },
  {
    capability: "employee.inspection.execute",
    portal: "employee",
    module: "safety",
    anyPermissions: [
      "safety_inspect_task:start",
      "safety_inspect_task:check_in",
      "safety_inspect_task:submit_results"
    ]
  },
  {
    capability: "employee.workorder.view",
    portal: "employee",
    module: "workorder",
    anyPermissions: [
      "workorder:accept",
      "workorder:start",
      "workorder:finish",
      "workorder:assign",
      "workorder:reassign",
      "workorder:manage_all"
    ]
  },
  {
    capability: "employee.workorder.accept",
    portal: "employee",
    module: "workorder",
    anyPermissions: ["workorder:accept"]
  },
  {
    capability: "employee.workorder.start",
    portal: "employee",
    module: "workorder",
    anyPermissions: ["workorder:start"]
  },
  {
    capability: "employee.workorder.finish",
    portal: "employee",
    module: "workorder",
    anyPermissions: ["workorder:finish"]
  },
  {
    capability: "employee.hazard.create",
    portal: "employee",
    module: "safety",
    anyPermissions: ["safety_hazard:create"]
  },
  {
    capability: "owner.service.create",
    portal: "owner",
    module: "workorder",
    anyPermissions: ["workorder:create"],
    ownerIdentityRequired: true
  },
  {
    capability: "owner.service.view",
    portal: "owner",
    module: "workorder",
    anyPermissions: ["workorder:read"],
    ownerIdentityRequired: true
  },
  {
    capability: "owner.service.confirm",
    portal: "owner",
    module: "workorder",
    anyPermissions: ["workorder:confirm"],
    ownerIdentityRequired: true
  },
  {
    capability: "owner.service.evaluate",
    portal: "owner",
    module: "workorder",
    anyPermissions: ["workorder:evaluate"],
    ownerIdentityRequired: true
  }
] as const;

export interface MobileCapabilitySubject {
  roles: readonly RoleContext[];
  permissions: readonly string[];
  enabled_modules?: readonly EnabledModuleContext[];
  is_super: boolean;
}

export interface MobileCapabilityProjection {
  portals: MobilePortal[];
  capabilities: MobileCapability[];
}

export function projectMobileCapabilities(subject: MobileCapabilitySubject): MobileCapabilityProjection {
  const permissions = new Set(subject.permissions);
  const enabledModules = new Set(
    (subject.enabled_modules ?? [])
      .filter((module) => module.enabled !== false)
      .map((module) => module.module_code)
  );
  const roleCodes = new Set(subject.roles.map((role) => role.role_code));
  const hasOwnerIdentity = MOBILE_OWNER_ROLE_CODES.some((roleCode) => roleCodes.has(roleCode));
  const bypassPermissionCodes = subject.is_super || permissions.has("*");

  const capabilities = MOBILE_CAPABILITY_MANIFEST
    .filter((rule) => enabledModules.has(rule.module))
    .filter((rule) => !rule.ownerIdentityRequired || hasOwnerIdentity)
    .filter((rule) => bypassPermissionCodes || rule.anyPermissions.some((permission) => permissions.has(permission)))
    .map((rule) => rule.capability);

  if (capabilities.some((capability) => capability.startsWith("employee."))) {
    capabilities.push("employee.home.view");
  }
  if (capabilities.some((capability) => capability.startsWith("owner."))) {
    capabilities.push("owner.home.view");
  }

  const uniqueCapabilities = [...new Set(capabilities)].sort() as MobileCapability[];
  const portals = MOBILE_PORTALS.filter((portal) =>
    uniqueCapabilities.some((capability) => capability.startsWith(`${portal}.`))
  );

  return { portals: [...portals], capabilities: uniqueCapabilities };
}

export interface MobileBootstrapUser {
  id: string;
  username: string;
  real_name: string;
  avatar_url?: string | null;
  org_id: string | null;
  org_name: string | null;
  roles: RoleContext[];
}

export interface MobileClientPolicy {
  minimum_version_code: number;
  force_upgrade: boolean;
  native_features: Record<string, boolean>;
  web_fallback_allowlist: string[];
}

export interface MobileBootstrapResponse {
  contract_version: typeof MOBILE_BOOTSTRAP_CONTRACT_VERSION;
  user: MobileBootstrapUser;
  current_park: UserParkContext | null;
  accessible_parks: UserParkContext[];
  portals: MobilePortal[];
  capabilities: MobileCapability[];
  home: {
    cards: string[];
    unread_count: number;
  };
  client_policy: MobileClientPolicy;
}
