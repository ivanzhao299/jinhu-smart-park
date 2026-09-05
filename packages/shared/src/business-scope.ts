export const BUSINESS_SCOPE_KINDS = ["enterprise", "park"] as const;
export type BusinessScopeKind = (typeof BUSINESS_SCOPE_KINDS)[number];

export const HR_BUSINESS_SCOPE_MODULE_CODE = "hr" as const;

interface BusinessScopeContextBase {
  tenantId: string;
  scopeId: string;
}

export interface EnterpriseBusinessScopeContext extends BusinessScopeContextBase {
  kind: "enterprise";
  parkId: null;
}

export interface ParkBusinessScopeContext extends BusinessScopeContextBase {
  kind: "park";
  parkId: string;
}

export type BusinessScopeContext = EnterpriseBusinessScopeContext | ParkBusinessScopeContext;
