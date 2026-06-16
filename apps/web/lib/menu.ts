import {
  Bot,
  BrainCircuit,
  Building2,
  ClipboardCheck,
  Cpu,
  Database,
  FileText,
  FolderTree,
  Home,
  KeyRound,
  LayoutDashboard,
  ScrollText,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Tags,
  Users,
  Video,
  Wrench,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { UserMenuTreeNode } from "@jinhu/shared";

export interface MenuNode {
  label: string;
  href?: string;
  permission?: string;
  module?: string;
  icon?: LucideIcon;
  children?: MenuNode[];
}

const MENU_ICON_MAP: Record<string, LucideIcon> = {
  home: Home,
  "building-2": Building2,
  building: Building2,
  "file-text": FileText,
  file: FileText,
  cpu: Cpu,
  zap: Zap,
  bot: Bot,
  video: Video,
  "layout-dashboard": LayoutDashboard,
  dashboard: LayoutDashboard,
  wrench: Wrench,
  "brain-circuit": BrainCircuit,
  "shield-check": ShieldCheck,
  "shield-alert": ShieldAlert,
  shield: Shield,
  "clipboard-check": ClipboardCheck,
  users: Users,
  user: Users,
  "key-round": KeyRound,
  key: KeyRound,
  settings: Settings,
  database: Database,
  tags: Tags,
  "folder-tree": FolderTree,
  menu: FolderTree,
  "scroll-text": ScrollText,
  audit: ScrollText
};

const LEGACY_MENU_HREF_ALIASES = [
  "/assets/rooms",
  "/iot/overview",
  "/system/attachments",
  "/workorders/statistics"
];

const DISABLED_PLACEHOLDER_HREFS = new Set([
  "/cockpit/executive",
  "/cockpit/invest",
  "/cockpit/assets",
  "/cockpit/finance",
  "/cockpit/safety",
  "/energy/overview",
  "/video/overview",
  "/bim/overview",
  "/ai/assistant"
]);

export const FIRST_RELEASE_MENU_PATHS = [
  "/dashboard",
  "/assets/parks",
  "/assets/buildings",
  "/assets/floors",
  "/assets/units",
  "/assets/unit-status-board",
  "/assets/statistics",
  "/leasing/tenants",
  "/leasing/contracts",
  "/leasing/receivables",
  "/leasing/payments",
  "/workorders",
  "/workorders/list",
  "/workorders/sla-rules",
  "/workorders/overdue",
  "/workorders/stats",
  "/operations/terminal",
  "/safety/dashboard",
  "/safety/inspect-points",
  "/safety/inspect-templates",
  "/safety/inspect-plans",
  "/safety/inspect-tasks",
  "/safety/my-inspect-tasks",
  "/safety/hazards",
  "/safety/hazards/overdue",
  "/system/orgs",
  "/system/users",
  "/system/roles",
  "/system/permissions",
  "/system/dicts",
  "/system/modules",
  "/system/tenants",
  "/system/audit/op-logs",
  "/system/audit/login-logs"
] as const;

export const FIRST_RELEASE_MENU_PATH_SET = new Set<string>(FIRST_RELEASE_MENU_PATHS);

export const dashboardMenus: MenuNode[] = [
  {
    label: "总览",
    icon: Home,
    children: [
      { label: "首页", href: "/dashboard" }
    ]
  },
  {
    label: "资产管理",
    icon: Building2,
    module: "asset",
    children: [
      { label: "园区管理", href: "/assets/parks", permission: "park:read", module: "asset" },
      { label: "楼栋管理", href: "/assets/buildings", permission: "building:read", module: "asset" },
      { label: "楼层管理", href: "/assets/floors", permission: "floor:read", module: "asset" },
      { label: "房间/房源管理", href: "/assets/units", permission: "unit:read", module: "asset" },
      { label: "房源状态看板", href: "/assets/unit-status-board", permission: "asset:status_board", module: "asset" },
      { label: "资产统计", href: "/assets/statistics", permission: "asset:statistics", module: "asset" }
    ]
  },
  {
    label: "招商租赁",
    icon: FileText,
    module: "leasing",
    children: [
      { label: "租户企业档案", href: "/leasing/tenants", permission: "park_tenant:read", module: "leasing" },
      { label: "招商线索", href: "/leasing/leads", permission: "leasing_lead:read", module: "leasing" },
      { label: "公海池", href: "/leasing/lead-pool", permission: "leasing_lead_pool:read", module: "leasing" },
      { label: "招商漏斗", href: "/leasing/funnel", permission: "leasing_statistics:funnel", module: "leasing" },
      { label: "合同管理", href: "/leasing/contracts", permission: "leasing_contract:read", module: "leasing" },
      { label: "合同变更", href: "/leasing/contract-changes", permission: "leasing_contract_change:read", module: "leasing" },
      { label: "退租结算", href: "/leasing/checkouts", permission: "leasing_checkout:read", module: "leasing" },
      { label: "退款登记", href: "/leasing/refunds", permission: "leasing_refund:read", module: "leasing" },
      { label: "应收账单", href: "/leasing/receivables", permission: "leasing_receivable:read", module: "leasing" },
      { label: "收款登记", href: "/leasing/payments", permission: "leasing_payment:read", module: "leasing" },
      { label: "欠费账龄", href: "/leasing/aging", permission: "leasing_receivable:aging", module: "leasing" },
      { label: "豁免管理", href: "/leasing/waivers", permission: "leasing_waiver:read", module: "leasing" },
      { label: "发票登记", href: "/leasing/invoices", permission: "leasing_invoice:read", module: "leasing" }
    ]
  },
  {
    label: "IoT 平台",
    icon: Cpu,
    module: "iot",
    children: [
      { label: "IoT 看板", href: "/iot/dashboard", permission: "iot_dashboard:read", module: "iot" },
      { label: "网关管理", href: "/iot/gateways", permission: "iot_gateway:read", module: "iot" },
      { label: "设备管理", href: "/iot/devices", permission: "iot_device:read", module: "iot" },
      { label: "协议配置", href: "/admin/iot/protocol-configs", permission: "iot_protocol_config:read", module: "iot" },
      { label: "指标管理", href: "/iot/metrics", permission: "iot_metric:read", module: "iot" },
      { label: "告警规则", href: "/iot/alert-rules", permission: "iot_alert_rule:read", module: "iot" },
      { label: "规则引擎", href: "/admin/iot/rules", permission: "iot_rule:read", module: "iot" },
      { label: "场景联动", href: "/admin/iot/scenes", permission: "iot_scene:read", module: "iot" },
      { label: "场景模板库", href: "/admin/iot/scenes/templates", permission: "iot_scene_template:read", module: "iot" },
      { label: "设备告警", href: "/iot/alerts", permission: "iot_alert:read", module: "iot" }
    ]
  },
  {
    label: "能耗管理",
    icon: Zap,
    module: "energy",
    children: [
      { label: "能源监测看板", href: "/energy/dashboard", permission: "energy_dashboard:read", module: "energy" },
      { label: "能源计量表", href: "/energy/meters", permission: "energy_meter:read", module: "energy" },
      { label: "能源读数记录", href: "/energy/readings", permission: "energy_reading:read", module: "energy" },
      { label: "能源异常告警", href: "/energy/alerts", permission: "energy_alert:read", module: "energy" },
      { label: "能源账期管理", href: "/energy/billing-cycles", permission: "energy_billing_cycle:read", module: "energy" },
      { label: "能源账单明细", href: "/energy/billing-items", permission: "energy_billing_item:read", module: "energy" },
      { label: "能源调整红冲", href: "/energy/billing-adjustments", permission: "energy_billing_adjustment:read", module: "energy" },
      { label: "公共能耗分摊规则", href: "/energy/allocation-rules", permission: "energy_allocation_rule:read", module: "energy" }
    ]
  },
  {
    label: "机器人运营",
    icon: Bot,
    module: "robot",
    children: [
      { label: "机器人总览", href: "/robots/overview", permission: "robot:read", module: "robot" },
      { label: "清洁机器人", href: "/robots/cleaning", permission: "robot:read", module: "robot" }
    ]
  },
  {
    label: "视频安防",
    icon: Video,
    module: "video",
    children: [
      { label: "安防指挥中心", href: "/admin/video-security/dashboard", permission: "video_security_dashboard:read", module: "video" },
      { label: "视频点位管理", href: "/admin/video-security/cameras", permission: "video_camera:read", module: "video" },
      { label: "视频告警中心", href: "/admin/video-security/alerts", permission: "video_alert:read", module: "video" },
      { label: "视频平台配置", href: "/admin/video-security/platform-configs", permission: "video_platform_config:read", module: "video" }
    ]
  },
  {
    label: "工单管理",
    icon: Wrench,
    module: "workorder",
    children: [
      { label: "工单看板", href: "/workorders", permission: "workorder:read", module: "workorder" },
      { label: "工单列表", href: "/workorders/list", permission: "workorder:read", module: "workorder" },
      { label: "SLA 规则", href: "/workorders/sla-rules", permission: "workorder_sla:read", module: "workorder" },
      { label: "超时工单", href: "/workorders/overdue", permission: "workorder:overdue", module: "workorder" },
      { label: "工单统计", href: "/workorders/stats", permission: "workorder:stats", module: "workorder" }
    ]
  },
  {
    label: "安全管理",
    icon: ShieldAlert,
    module: "safety",
    children: [
      { label: "安全看板", href: "/safety/dashboard", permission: "safety_statistics:read", module: "safety" },
      { label: "现场工作台", href: "/operations/terminal", permission: "safety_inspect_task:my", module: "safety" },
      { label: "巡检点位", href: "/safety/inspect-points", permission: "safety_inspect_point:read", module: "safety" },
      { label: "巡检模板", href: "/safety/inspect-templates", permission: "safety_inspect_template:read", module: "safety" },
      { label: "巡检计划", href: "/safety/inspect-plans", permission: "safety_inspect_plan:read", module: "safety" },
      { label: "巡检任务", href: "/safety/inspect-tasks", permission: "safety_inspect_task:read", module: "safety" },
      { label: "我的巡检", href: "/safety/my-inspect-tasks", permission: "safety_inspect_task:my", module: "safety" },
      { label: "隐患整改", href: "/safety/hazards", permission: "safety_hazard:read", module: "safety" },
      { label: "超期隐患", href: "/safety/hazards/overdue", permission: "safety_hazard:overdue", module: "safety" },
      { label: "应急联系人", href: "/safety/emergency-contacts", permission: "safety_emergency_contact:read", module: "safety" },
      { label: "应急预案", href: "/safety/emergency-plans", permission: "safety_emergency_plan:read", module: "safety" },
      { label: "应急事件", href: "/safety/emergencies", permission: "safety_emergency:read", module: "safety" },
      { label: "作业许可", href: "/safety/work-permits", permission: "safety_work_permit:read", module: "safety" }
    ]
  },
  {
    label: "系统管理",
    icon: ShieldCheck,
    permission: "system:read",
    module: "system",
    children: [
      { label: "组织管理", href: "/system/orgs", permission: "org:read", module: "system" },
      { label: "用户管理", href: "/system/users", permission: "user:read", module: "system" },
      { label: "角色管理", href: "/system/roles", permission: "role:read", module: "system" },
      { label: "权限点", href: "/system/permissions", permission: "permission:read", module: "system" },
      { label: "数据权限", href: "/system/data-scopes", permission: "data_scope:read", module: "system" },
      { label: "字段权限", href: "/system/field-policies", permission: "field_policy:read", module: "system" },
      { label: "编码规则", href: "/system/code-rules", permission: "system:code-rule:read", module: "system" },
      { label: "租户管理", href: "/system/tenants", permission: "tenant:read", module: "system" },
      { label: "模块授权", href: "/system/modules", permission: "module:read", module: "system" },
      { label: "字典管理", href: "/system/dicts", permission: "dict:read", module: "system" },
      { label: "附件中心", href: "/system/files", permission: "file:read", module: "system" },
      { label: "操作日志", href: "/system/audit/op-logs", permission: "audit:read", module: "system" },
      { label: "登录日志", href: "/system/audit/login-logs", permission: "audit:read", module: "system" }
    ]
  }
];

export function getDashboardMenus(userMenus?: UserMenuTreeNode[] | null): MenuNode[] {
  const menus = normalizeMenuTree(userMenus);
  const mergedMenus = menus.length > 0 ? mergeWithDashboardMenus(menus) : dashboardMenus;
  return filterFirstReleaseMenus(mergedMenus);
}

export function getDashboardAuthorizationMenus(userMenus?: UserMenuTreeNode[] | null): MenuNode[] {
  const menus = normalizeMenuTree(userMenus);
  return menus.length > 0 ? mergeWithDashboardMenus(menus) : dashboardMenus;
}

export function filterFirstReleaseMenus(menus: MenuNode[]): MenuNode[] {
  const filteredMenus: MenuNode[] = [];
  for (const menu of menus) {
    const children = menu.children ? filterFirstReleaseMenus(menu.children) : undefined;
    if (menu.href && !FIRST_RELEASE_MENU_PATH_SET.has(menu.href) && !children?.length) {
      continue;
    }
    if (!menu.href && !children?.length) {
      continue;
    }
    filteredMenus.push({
      ...menu,
      children: children && children.length > 0 ? children : undefined
    });
  }
  return filteredMenus;
}

export function normalizeMenuTree(userMenus?: UserMenuTreeNode[] | null): MenuNode[] {
  if (!userMenus?.length) {
    return [];
  }
  return userMenus
    .map(toMenuNode)
    .map(prunePlaceholderMenus)
    .filter((menu): menu is MenuNode => Boolean(menu?.label));
}

function toMenuNode(node: UserMenuTreeNode): MenuNode {
  const children = node.children?.map(toMenuNode).filter((child) => child.label);
  return {
    label: node.label,
    href: node.href,
    permission: node.permission,
    module: node.module,
    icon: resolveMenuIcon(node.icon),
    children: children && children.length > 0 ? children : undefined
  };
}

function prunePlaceholderMenus(menu: MenuNode): MenuNode | undefined {
  if (menu.href && DISABLED_PLACEHOLDER_HREFS.has(menu.href)) {
    return undefined;
  }
  const children = menu.children
    ?.map(prunePlaceholderMenus)
    .filter((child): child is MenuNode => Boolean(child));
  if (!menu.href && !children?.length) {
    return undefined;
  }
  return { ...menu, children };
}

function mergeWithDashboardMenus(userMenus: MenuNode[]): MenuNode[] {
  const backendNodesByHref = new Map<string, MenuNode>();
  const backendGroupsByLabel = new Map<string, MenuNode>();
  const canonicalHrefs = new Set<string>();
  const usedBackendHrefs = new Set<string>();

  collectMenuNodes(userMenus, (node) => {
    if (node.href) {
      backendNodesByHref.set(node.href, node);
    }
  });

  for (const node of userMenus) {
    backendGroupsByLabel.set(node.label, node);
  }

  collectMenuNodes(dashboardMenus, (node) => {
    if (node.href) {
      canonicalHrefs.add(node.href);
    }
  });
  for (const href of LEGACY_MENU_HREF_ALIASES) {
    canonicalHrefs.add(href);
  }

  return dashboardMenus.map((menu) => {
    const merged = mergeCanonicalMenu(menu, backendNodesByHref, backendGroupsByLabel, usedBackendHrefs);
    const moduleCode = inferMenuModule(merged);
    const extraChildren = moduleCode
      ? collectExtraChildrenForModule(userMenus, moduleCode, canonicalHrefs, usedBackendHrefs)
      : [];
    return extraChildren.length > 0
      ? { ...merged, children: [...(merged.children ?? []), ...extraChildren] }
      : merged;
  });
}

function mergeCanonicalMenu(
  menu: MenuNode,
  backendNodesByHref: Map<string, MenuNode>,
  backendGroupsByLabel: Map<string, MenuNode>,
  usedBackendHrefs: Set<string>
): MenuNode {
  const backendNode = menu.href ? backendNodesByHref.get(menu.href) : backendGroupsByLabel.get(menu.label);
  if (backendNode?.href) {
    usedBackendHrefs.add(backendNode.href);
  }
  return {
    ...menu,
    href: menu.href ?? backendNode?.href,
    permission: menu.permission ?? backendNode?.permission,
    module: menu.module ?? backendNode?.module,
    icon: menu.icon ?? backendNode?.icon,
    children: menu.children?.map((child) =>
      mergeCanonicalMenu(child, backendNodesByHref, backendGroupsByLabel, usedBackendHrefs)
    )
  };
}

function collectExtraChildrenForModule(
  menus: MenuNode[],
  moduleCode: string,
  canonicalHrefs: Set<string>,
  usedBackendHrefs: Set<string>
): MenuNode[] {
  const children: MenuNode[] = [];
  collectMenuNodes(menus, (node) => {
    if (!node.href || canonicalHrefs.has(node.href) || usedBackendHrefs.has(node.href)) {
      return;
    }
    if (inferMenuModule(node) !== moduleCode) {
      return;
    }
    usedBackendHrefs.add(node.href);
    children.push({ ...node, icon: undefined, children: undefined });
  });
  return children;
}

function collectMenuNodes(menus: MenuNode[], visit: (node: MenuNode) => void) {
  for (const menu of menus) {
    visit(menu);
    if (menu.children) {
      collectMenuNodes(menu.children, visit);
    }
  }
}

function inferMenuModule(menu: MenuNode): string | undefined {
  if (menu.module) {
    return menu.module;
  }
  const href = menu.href ?? "";
  const permission = menu.permission ?? "";
  if (href.startsWith("/assets") || startsWithAny(permission, ["asset", "park:", "building:", "floor:", "unit:"])) {
    return "asset";
  }
  if (href.startsWith("/leasing") || startsWithAny(permission, ["leasing", "park_tenant"])) {
    return "leasing";
  }
  if (href.startsWith("/workorders") || permission.startsWith("workorder")) {
    return "workorder";
  }
  if (href.startsWith("/safety") || permission.startsWith("safety")) {
    return "safety";
  }
  if (href.startsWith("/iot") || permission.startsWith("iot")) {
    return "iot";
  }
  if (href.startsWith("/energy") || permission.startsWith("energy")) {
    return "energy";
  }
  if (href.startsWith("/system") || permission.startsWith("system") || permission.startsWith("module:")) {
    return "system";
  }
  if (href.startsWith("/robots") || permission.startsWith("robot")) {
    return "robot";
  }
  if (href.startsWith("/video") || href.startsWith("/admin/video-security") || permission.startsWith("video")) {
    return "video";
  }
  if (href.startsWith("/bim") || permission.startsWith("bim")) {
    return "bim";
  }
  if (href.startsWith("/ai") || permission.startsWith("ai")) {
    return "ai";
  }
  return undefined;
}

function startsWithAny(value: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => value.startsWith(prefix));
}

function resolveMenuIcon(icon?: string | null): LucideIcon | undefined {
  if (!icon) {
    return undefined;
  }
  const normalized = icon.toLowerCase().replace(/^.*:/, "").replace(/_/g, "-");
  return MENU_ICON_MAP[normalized] ?? MENU_ICON_MAP[icon.toLowerCase()];
}

export function findMenuByPath(pathname: string, menus: MenuNode[] = dashboardMenus): MenuNode | undefined {
  if (pathname === "/system/attachments") {
    return { label: "附件中心", href: "/system/attachments", permission: "file:read", module: "system" };
  }
  if (pathname === "/system/permissions") {
    return { label: "权限点", href: "/system/permissions", permission: "permission:read", module: "system" };
  }
  if (pathname === "/system/audit") {
    return { label: "审计中心", href: "/system/audit", permission: "audit:read", module: "system" };
  }
  if (pathname === "/assets/rooms") {
    return { label: "房间/房源管理", href: "/assets/rooms", permission: "unit:read", module: "asset" };
  }
  for (const menu of menus) {
    if (menu.href === pathname) {
      return menu;
    }
    const child = menu.children ? findMenuByPath(pathname, menu.children) : undefined;
    if (child) {
      return child.module || !menu.module ? child : { ...child, module: menu.module };
    }
  }
  return undefined;
}
