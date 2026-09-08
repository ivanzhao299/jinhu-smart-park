export const TERMINAL_ROUTE_PREFIXES = [
  "/operations/terminal",
  "/preview/operations-terminal",
  "/engineering/terminal",
  "/tenant/service",
  "/preview/tenant-service",
  "/safety/my-inspect-tasks"
] as const;

export interface DynamicWebRoute {
  pattern: string;
  menuHref: string;
  fallbackLabel: string;
}

export const DYNAMIC_WEB_ROUTES = [
  ...dynamicCrudRoutes("/engineering/projects", "项目详情"),
  ...dynamicCrudRoutes("/engineering/plans", "计划详情"),
  ...dynamicCrudRoutes("/engineering/daily-reports", "日报详情"),
  ...dynamicCrudRoutes("/engineering/inspections", "巡检详情"),
  { pattern: "/engineering/rectifications/:id", menuHref: "/engineering/rectifications", fallbackLabel: "整改详情" },
  ...dynamicCrudRoutes("/engineering/acceptances", "验收详情"),
  { pattern: "/iot/devices/:id", menuHref: "/iot/devices", fallbackLabel: "设备详情" },
  { pattern: "/workorders/:id", menuHref: "/workorders", fallbackLabel: "工单详情" },
  { pattern: "/assets/identity-submissions/:id", menuHref: "/assets/identity-submissions", fallbackLabel: "身份核验详情" },
  { pattern: "/assets/parties/:id", menuHref: "/assets/parties", fallbackLabel: "相对方详情" },
  { pattern: "/assets/property-occupancies/:id", menuHref: "/assets/property-occupancies", fallbackLabel: "占用详情" },
  { pattern: "/assets/property-operations/:id", menuHref: "/assets/property-operations", fallbackLabel: "经营配置详情" },
  { pattern: "/homestay/bookings/:id", menuHref: "/homestay/bookings", fallbackLabel: "订单详情" },
  { pattern: "/homestay/stays/:id", menuHref: "/homestay/stays", fallbackLabel: "入住详情" },
  { pattern: "/homestay/turnovers/:id", menuHref: "/homestay/turnovers", fallbackLabel: "周转详情" },
  { pattern: "/housing/handovers/:id", menuHref: "/housing/handovers", fallbackLabel: "交割详情" },
  { pattern: "/housing/leases/:id", menuHref: "/housing/leases", fallbackLabel: "租约详情" },
  { pattern: "/housing/purchases/:id", menuHref: "/housing/purchases", fallbackLabel: "采购详情" },
  { pattern: "/housing/repairs/:id", menuHref: "/housing/repairs", fallbackLabel: "报修详情" },
  { pattern: "/housing/tenants/:id", menuHref: "/housing/tenants", fallbackLabel: "租客详情" },
  { pattern: "/property/approval-incidents/:id", menuHref: "/property/approval-incidents", fallbackLabel: "审批异常详情" },
  { pattern: "/property/approvals/:id", menuHref: "/property/approvals", fallbackLabel: "审批详情" },
  { pattern: "/property/event-delivery-incidents/:id", menuHref: "/property/event-delivery-incidents", fallbackLabel: "事件异常详情" },
  { pattern: "/property/notifications/:id", menuHref: "/property/notifications", fallbackLabel: "通知详情" }
] as const satisfies readonly DynamicWebRoute[];

export interface ResolvedWebRoute {
  route: DynamicWebRoute;
  params: Readonly<Record<string, string>>;
}

export function isTerminalRoute(pathname: string | null | undefined): boolean {
  return Boolean(pathname && TERMINAL_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)));
}

export function resolveDynamicWebRoute(pathname: string): ResolvedWebRoute | undefined {
  for (const route of DYNAMIC_WEB_ROUTES) {
    const names: string[] = [];
    const pattern = route.pattern
      .split("/")
      .map((segment) => {
        if (!segment.startsWith(":")) return escapeRegExp(segment);
        names.push(segment.slice(1));
        return "([^/]+)";
      })
      .join("/");
    const match = new RegExp(`^${pattern}/?$`).exec(pathname);
    if (!match) continue;
    return {
      route,
      params: Object.fromEntries(names.map((name, index) => [name, safeDecodeURIComponent(match[index + 1] ?? "")]))
    };
  }
  return undefined;
}

export function buildRouteHref(pattern: string, params: Readonly<Record<string, string>>): string {
  return pattern.split("/").map((segment) => {
    if (!segment.startsWith(":")) return segment;
    const value = params[segment.slice(1)];
    if (!value) throw new Error(`Missing route parameter: ${segment.slice(1)}`);
    return encodeURIComponent(value);
  }).join("/");
}

export function resolveDynamicBreadcrumbLabel(route: DynamicWebRoute, resolvedLabel?: string | null): string {
  const label = resolvedLabel?.replace(/\s+/g, " ").trim();
  return label ? label.slice(0, 80) : route.fallbackLabel;
}

function dynamicCrudRoutes(menuHref: string, fallbackLabel: string): DynamicWebRoute[] {
  return [
    { pattern: `${menuHref}/:id`, menuHref, fallbackLabel },
    { pattern: `${menuHref}/:id/edit`, menuHref, fallbackLabel: `编辑${fallbackLabel.replace(/详情$/, "")}` }
  ];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
