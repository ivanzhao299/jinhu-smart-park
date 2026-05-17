import {
  Bot,
  BrainCircuit,
  Building2,
  Cpu,
  FileText,
  Home,
  LayoutDashboard,
  ShieldCheck,
  Video,
  Wrench,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface MenuNode {
  label: string;
  href?: string;
  permission?: string;
  module?: string;
  icon?: LucideIcon;
  children?: MenuNode[];
}

export const dashboardMenus: MenuNode[] = [
  {
    label: "总览",
    icon: Home,
    children: [
      { label: "首页", href: "/dashboard" },
      { label: "总裁驾驶舱", href: "/cockpit/executive", permission: "cockpit:read" }
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
      { label: "退租管理", href: "/leasing/checkouts", permission: "leasing_checkout:read", module: "leasing" },
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
      { label: "IoT 总览", href: "/iot/overview", permission: "iot:read", module: "iot" }
    ]
  },
  {
    label: "能耗管理",
    icon: Zap,
    module: "energy",
    children: [
      { label: "能耗总览", href: "/energy/overview", permission: "energy:read", module: "energy" }
    ]
  },
  {
    label: "机器人运营",
    icon: Bot,
    module: "robot",
    children: [
      { label: "机器人总览", href: "/robots/overview", permission: "robot:read", module: "robot" }
    ]
  },
  {
    label: "视频安防",
    icon: Video,
    module: "video",
    children: [
      { label: "视频总览", href: "/video/overview", permission: "video:read", module: "video" }
    ]
  },
  {
    label: "数字孪生",
    icon: LayoutDashboard,
    module: "bim",
    children: [
      { label: "BIM 总览", href: "/bim/overview", permission: "bim:read", module: "bim" }
    ]
  },
  {
    label: "工单管理",
    icon: Wrench,
    module: "workorder",
    children: [
      { label: "工单中心", href: "/workorders", permission: "wo:read", module: "workorder" },
      { label: "工单统计", href: "/workorders/statistics", permission: "wo:read", module: "workorder" }
    ]
  },
  {
    label: "AI 助手",
    icon: BrainCircuit,
    module: "ai",
    children: [
      { label: "AI 助手", href: "/ai/assistant", permission: "ai:read", module: "ai" }
    ]
  },
  {
    label: "经营驾驶舱",
    icon: LayoutDashboard,
    permission: "cockpit:read",
    children: [
      { label: "招商驾驶舱", href: "/cockpit/invest", permission: "cockpit:read" },
      { label: "资产驾驶舱", href: "/cockpit/assets", permission: "cockpit:read" },
      { label: "财务驾驶舱", href: "/cockpit/finance", permission: "cockpit:read" },
      { label: "物业安全驾驶舱", href: "/cockpit/safety", permission: "cockpit:read" }
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
      { label: "模块授权", href: "/system/modules", permission: "module:read", module: "system" },
      { label: "字典管理", href: "/system/dicts", permission: "dict:read", module: "system" },
      { label: "附件中心", href: "/system/files", permission: "file:read", module: "system" },
      { label: "操作日志", href: "/system/audit/op-logs", permission: "audit:read", module: "system" },
      { label: "登录日志", href: "/system/audit/login-logs", permission: "audit:read", module: "system" }
    ]
  }
];

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
