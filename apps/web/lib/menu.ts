import {
  Building2,
  FileText,
  Gauge,
  Home,
  LayoutDashboard,
  ShieldCheck,
  Siren,
  Wrench
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface MenuNode {
  label: string;
  href?: string;
  permission?: string;
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
    label: "系统管理",
    icon: ShieldCheck,
    permission: "system:read",
    children: [
      { label: "组织管理", href: "/system/orgs", permission: "org:read" },
      { label: "用户管理", href: "/system/users", permission: "user:read" },
      { label: "角色管理", href: "/system/roles", permission: "role:read" },
      { label: "字典管理", href: "/system/dicts", permission: "dict:read" },
      { label: "附件中心", href: "/system/files", permission: "file:read" },
      { label: "操作日志", href: "/system/audit/op-logs", permission: "audit:read" },
      { label: "登录日志", href: "/system/audit/login-logs", permission: "audit:read" }
    ]
  },
  {
    label: "资产经营",
    icon: Building2,
    children: [
      { label: "园区管理", href: "/assets/parks", permission: "asset:read" },
      { label: "楼栋管理", href: "/assets/buildings", permission: "asset:read" },
      { label: "楼层管理", href: "/assets/floors", permission: "asset:read" },
      { label: "房源管理", href: "/assets/units", permission: "unit:read" },
      { label: "资产统计", href: "/assets/statistics", permission: "asset:read" }
    ]
  },
  {
    label: "招商运营",
    icon: Gauge,
    children: [
      { label: "招商线索", href: "/invest/leads", permission: "invest:read" },
      { label: "公海池", href: "/invest/lead-pool", permission: "invest:read" },
      { label: "招商漏斗", href: "/invest/funnel", permission: "invest:read" }
    ]
  },
  {
    label: "合同财务",
    icon: FileText,
    children: [
      { label: "合同管理", href: "/contracts", permission: "contract:read" },
      { label: "应收账单", href: "/finance/receivables", permission: "ar:read" },
      { label: "收款登记", href: "/finance/payments", permission: "ar:read" },
      { label: "发票管理", href: "/finance/invoices", permission: "ar:read" },
      { label: "欠费账龄", href: "/finance/aging", permission: "ar:read" }
    ]
  },
  {
    label: "物业服务",
    icon: Wrench,
    children: [
      { label: "工单中心", href: "/workorders", permission: "wo:read" },
      { label: "工单统计", href: "/workorders/statistics", permission: "wo:read" }
    ]
  },
  {
    label: "安全管理",
    icon: Siren,
    children: [
      { label: "巡检点位", href: "/safety/inspect-points", permission: "hazard:read" },
      { label: "巡检计划", href: "/safety/inspect-plans", permission: "hazard:read" },
      { label: "巡检任务", href: "/safety/inspect-tasks", permission: "hazard:read" },
      { label: "隐患整改", href: "/safety/hazards", permission: "hazard:read" },
      { label: "应急事件", href: "/safety/emergencies", permission: "hazard:read" },
      { label: "作业许可", href: "/safety/work-permits", permission: "hazard:read" }
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
  }
];

export function findMenuByPath(pathname: string, menus: MenuNode[] = dashboardMenus): MenuNode | undefined {
  if (pathname === "/system/attachments") {
    return { label: "附件中心", href: "/system/attachments", permission: "file:read" };
  }
  if (pathname === "/system/permissions") {
    return { label: "权限点", href: "/system/permissions", permission: "permission:read" };
  }
  if (pathname === "/system/audit") {
    return { label: "审计中心", href: "/system/audit", permission: "audit:read" };
  }
  for (const menu of menus) {
    if (menu.href === pathname) {
      return menu;
    }
    const child = menu.children ? findMenuByPath(pathname, menu.children) : undefined;
    if (child) {
      return child;
    }
  }
  return undefined;
}
