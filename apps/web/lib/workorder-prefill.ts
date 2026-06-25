import type { UserContext } from "@jinhu/shared";

export type WorkOrderAudience = "tenant" | "property" | "engineering" | "security" | "it" | "management";
export type WorkOrderSourceType = "manual" | "tenant_request" | "inspection" | "alert" | "system";

export interface WorkOrderAudienceProfile {
  audience: WorkOrderAudience;
  label: string;
  eyebrow: string;
  title: string;
  description: string;
  primaryActionLabel: string;
  sourceType: WorkOrderSourceType;
  defaultType: string;
  defaultTitle: string;
  defaultDescription: string;
}

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

export function resolveWorkOrderAudience(authUser: UserContext | null): WorkOrderAudienceProfile {
  if (isTenantUser(authUser)) {
    return {
      audience: "tenant",
      label: "业主 / 租户",
      eyebrow: "服务请求",
      title: "提交园区服务请求",
      description: "面向企业租户和业主联系人，用于报修、保洁、安防、通行、咨询等诉求提交。",
      primaryActionLabel: "提交服务请求",
      sourceType: "tenant_request",
      defaultType: "repair",
      defaultTitle: "园区服务请求",
      defaultDescription: "请说明诉求事项、现场位置、影响范围和期望处理时间。"
    };
  }
  if (hasUserKeyword(authUser, ["ENGINEER", "ENGINEERING", "MAINTENANCE", "工程", "维修", "维保"])) {
    return {
      audience: "engineering",
      label: "工程部门",
      eyebrow: "工程处置",
      title: "登记工程维修任务",
      description: "面向工程维修人员，用于设备、水电、门禁、公共设施等内部维修处置登记。",
      primaryActionLabel: "提交工程任务",
      sourceType: "manual",
      defaultType: "maintenance",
      defaultTitle: "工程维修处理",
      defaultDescription: "请说明设备/设施名称、故障现象、位置、影响范围和处理要求。"
    };
  }
  if (hasUserKeyword(authUser, ["SECURITY", "GUARD", "安保", "安防", "保安"])) {
    return {
      audience: "security",
      label: "安保 / 安防",
      eyebrow: "安防事件",
      title: "登记安防处置任务",
      description: "面向安保和安防岗位，用于通行、巡逻、门禁、车辆秩序和异常事件处置。",
      primaryActionLabel: "提交安防任务",
      sourceType: "manual",
      defaultType: "security",
      defaultTitle: "安防现场处理",
      defaultDescription: "请说明事件位置、涉及人员/车辆、风险情况和处置建议。"
    };
  }
  if (hasUserKeyword(authUser, ["IT", "INFORMATION", "DIGITAL", "信息化", "数字化", "弱电", "网络"])) {
    return {
      audience: "it",
      label: "信息化部门",
      eyebrow: "信息化支持",
      title: "登记信息化支持任务",
      description: "面向信息化人员，用于网络、门禁系统、监控、平台账号和数字化设备支持。",
      primaryActionLabel: "提交支持任务",
      sourceType: "manual",
      defaultType: "request",
      defaultTitle: "信息化支持处理",
      defaultDescription: "请说明系统/设备名称、账号或点位、故障现象和影响范围。"
    };
  }
  if (hasUserKeyword(authUser, ["MANAGER", "ADMIN", "OPERATOR", "运营", "园区", "管理", "生产"])) {
    return {
      audience: "management",
      label: "园区管理方",
      eyebrow: "运营工单",
      title: "登记园区运营工单",
      description: "面向园区管理方，用于客户诉求分派、现场任务、跨部门协同和闭环跟踪。",
      primaryActionLabel: "提交运营工单",
      sourceType: "manual",
      defaultType: "request",
      defaultTitle: "园区运营协同",
      defaultDescription: "请说明事项背景、关联对象、责任部门和期望完成时间。"
    };
  }
  return {
    audience: "property",
    label: "物业服务方",
    eyebrow: "物业处置",
    title: "登记物业服务任务",
    description: "面向物业人员，用于保洁、维修、巡检发现问题、客户上门服务和消案登记。",
    primaryActionLabel: "提交物业任务",
    sourceType: "manual",
    defaultType: "request",
    defaultTitle: "物业服务处理",
    defaultDescription: "请说明现场事项、关联客户或位置、处理要求和完成标准。"
  };
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

function hasUserKeyword(authUser: UserContext | null, keywords: string[]): boolean {
  if (!authUser) return false;
  const corpus = [
    authUser.username,
    authUser.real_name,
    authUser.org_name,
    ...authUser.roles.flatMap((role) => [role.role_code, role.role_name])
  ].filter(Boolean).join(" ").toUpperCase();
  return keywords.some((keyword) => corpus.includes(keyword.toUpperCase()));
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
