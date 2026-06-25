import type { UserContext } from "@jinhu/shared";

export interface WorkOrderPrefillTenant {
  id: string;
  companyName: string;
  parkTenantCode?: string | null;
  contactName?: string | null;
  contactMobile?: string | null;
}

export interface WorkOrderPrefillUnit {
  id: string;
  unitCode?: string | null;
  unitName?: string | null;
  buildingId?: string | null;
  floorId?: string | null;
  currentTenantId?: string | null;
  currentTenantName?: string | null;
  current_tenant_id?: string | null;
  current_tenant_name?: string | null;
  building?: { buildingName?: string | null; buildingCode?: string | null } | null;
  floor?: { floorName?: string | null; floorCode?: string | null } | null;
}

export interface WorkOrderPrefill {
  parkTenantId: string;
  unitId: string;
  buildingId: string;
  floorId: string;
  roomLabel: string;
  location: string;
  reporterName: string;
  reporterMobile: string;
}

export function buildWorkOrderPrefill(
  authUser: UserContext | null,
  parkTenants: WorkOrderPrefillTenant[],
  units: WorkOrderPrefillUnit[]
): WorkOrderPrefill {
  const tenant = findLoginTenant(authUser, parkTenants);
  const unit = findLoginUnit(authUser, tenant, units);
  const tenantUser = isTenantUser(authUser);
  const reporterName = firstText(
    tenantUser ? tenant?.contactName : undefined,
    authUser?.real_name,
    authUser?.username
  );
  const reporterMobile = firstText(
    tenantUser ? tenant?.contactMobile : undefined,
    authUser?.mobile
  );
  return {
    parkTenantId: tenant?.id ?? "",
    unitId: unit?.id ?? "",
    buildingId: unit?.buildingId ?? "",
    floorId: unit?.floorId ?? "",
    roomLabel: getUnitName(unit),
    location: formatUnitLocation(unit),
    reporterName,
    reporterMobile
  };
}

export function tenantForUnit(
  unit: WorkOrderPrefillUnit | undefined,
  parkTenants: WorkOrderPrefillTenant[]
): WorkOrderPrefillTenant | undefined {
  if (!unit) return undefined;
  const tenantId = getUnitTenantId(unit);
  const tenantName = getUnitTenantName(unit);
  if (tenantId) {
    const byId = parkTenants.find((tenant) => tenant.id === tenantId);
    if (byId) return byId;
  }
  if (tenantName) {
    return parkTenants.find((tenant) => sameText(tenant.companyName, tenantName));
  }
  return undefined;
}

export function formatUnitLocation(unit?: WorkOrderPrefillUnit | null): string {
  if (!unit) return "";
  return [
    unit.building?.buildingName,
    unit.floor?.floorName,
    getUnitName(unit)
  ].filter(Boolean).join(" / ");
}

export function patchContactFromTenant<T extends { reporterName?: string; reporterMobile?: string }>(
  patch: T,
  tenant?: WorkOrderPrefillTenant
): T {
  if (tenant?.contactName) {
    patch.reporterName = tenant.contactName;
  }
  if (tenant?.contactMobile) {
    patch.reporterMobile = tenant.contactMobile;
  }
  return patch;
}

function findLoginTenant(authUser: UserContext | null, parkTenants: WorkOrderPrefillTenant[]): WorkOrderPrefillTenant | undefined {
  if (!authUser || !isTenantUser(authUser)) return undefined;
  const mobile = normalizeText(authUser.mobile);
  const realName = normalizeText(authUser.real_name);
  const orgName = normalizeText(authUser.org_name);
  const byMobile = mobile ? parkTenants.find((tenant) => normalizePhone(tenant.contactMobile) === normalizePhone(mobile)) : undefined;
  if (byMobile) return byMobile;
  const byOrg = orgName ? parkTenants.find((tenant) => sameText(tenant.companyName, orgName) || sameText(tenant.parkTenantCode, orgName)) : undefined;
  if (byOrg) return byOrg;
  const byContact = realName ? parkTenants.find((tenant) => sameText(tenant.contactName, realName)) : undefined;
  if (byContact) return byContact;
  return parkTenants.length === 1 ? parkTenants[0] : undefined;
}

function findLoginUnit(
  authUser: UserContext | null,
  tenant: WorkOrderPrefillTenant | undefined,
  units: WorkOrderPrefillUnit[]
): WorkOrderPrefillUnit | undefined {
  if (!authUser || !isTenantUser(authUser)) return undefined;
  if (tenant) {
    const byTenant = units.filter((unit) => {
      const tenantId = getUnitTenantId(unit);
      const tenantName = getUnitTenantName(unit);
      return tenantId === tenant.id || sameText(tenantName, tenant.companyName);
    });
    if (byTenant.length === 1) return byTenant[0];
  }
  return units.length === 1 ? units[0] : undefined;
}

function isTenantUser(authUser: UserContext | null): boolean {
  if (!authUser) return false;
  return authUser.roles.some((role) => {
    const code = role.role_code.toUpperCase();
    const name = role.role_name.toUpperCase();
    return code.includes("TENANT") || name.includes("租户") || name.includes("业主");
  });
}

function getUnitTenantId(unit: WorkOrderPrefillUnit): string {
  return firstText(unit.currentTenantId, unit.current_tenant_id);
}

function getUnitTenantName(unit: WorkOrderPrefillUnit): string {
  return firstText(unit.currentTenantName, unit.current_tenant_name);
}

function getUnitName(unit?: WorkOrderPrefillUnit | null): string {
  return firstText(unit?.unitName);
}

function normalizeText(value?: string | null): string {
  return value?.trim() ?? "";
}

function normalizePhone(value?: string | null): string {
  return normalizeText(value).replace(/\D/g, "");
}

function sameText(left?: string | null, right?: string | null): boolean {
  const normalizedLeft = normalizeText(left);
  const normalizedRight = normalizeText(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

function firstText(...values: Array<string | null | undefined>): string {
  return values.map((value) => value?.trim() ?? "").find(Boolean) ?? "";
}
