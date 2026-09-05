import type { ParkBusinessScopeContext } from "@jinhu/shared";

export const BUSINESS_SCOPE_PARK_ADAPTER = Symbol("BUSINESS_SCOPE_PARK_ADAPTER");

export interface BusinessScopeParkResolution {
  tenantId: string;
  scopeId: string;
  userId: string;
}

export interface BusinessScopeParkAdapter {
  resolveParkScope(input: BusinessScopeParkResolution): Promise<ParkBusinessScopeContext | null>;
}
