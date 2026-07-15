#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);

const requiredRoutes = [
  "apps/web/app/operations/terminal/page.tsx",
  "apps/web/app/engineering/page.tsx",
  "apps/web/app/engineering/terminal/page.tsx",
  "apps/web/app/engineering/dashboard/page.tsx",
  "apps/web/app/engineering/projects/page.tsx",
  "apps/web/app/engineering/plans/page.tsx",
  "apps/web/app/engineering/daily-reports/page.tsx",
  "apps/web/app/engineering/inspections/page.tsx",
  "apps/web/app/engineering/rectifications/page.tsx",
  "apps/web/app/engineering/acceptances/page.tsx",
  "apps/web/app/system/orgs/page.tsx",
  "apps/web/app/system/users/page.tsx",
  "apps/web/app/system/roles/page.tsx",
  "apps/web/app/system/dicts/page.tsx",
  "apps/web/app/workorders/list/page.tsx",
  "apps/web/app/safety/hazards/page.tsx"
];

const requiredMenuPaths = [
  "/operations/terminal",
  "/engineering",
  "/engineering/terminal",
  "/engineering/dashboard",
  "/engineering/projects",
  "/engineering/plans",
  "/engineering/daily-reports",
  "/engineering/inspections",
  "/engineering/rectifications",
  "/engineering/acceptances",
  "/system/orgs",
  "/system/users",
  "/system/roles",
  "/system/dicts",
  "/workorders/list",
  "/safety/hazards"
];

const requiredMigrations = [
  "database/migrations/000157_epdr_rbac_menu_permissions.sql",
  "database/migrations/000161_safety_hazard_dictionary_defaults.sql",
  "database/migrations/000164_epdr_admin_visibility_backfill.sql",
  "database/migrations/000166_go_live_decision_permission_hardening.sql",
  "database/migrations/000167_go_live_real_user_role_bridge.sql",
  "database/migrations/000168_go_live_admin_system_alias_permissions.sql",
  "database/migrations/000170_go_live_acceptance_field_execution_bridge.sql",
  "database/migrations/000171_go_live_invest_workorder_create_repair.sql",
  "database/migrations/000172_go_live_uat_user_baseline.sql"
];

const requiredDecisionRoles = [
  "JH_GROUP_PRESIDENT",
  "JH_GROUP_VP",
  "JH_ENGINEERING_PROPERTY_MANAGER",
  "JH_ENGINEERING_PROJECT_MANAGER",
  "JH_INSTALLATION_ENGINEER",
  "JH_PROPERTY_SITE_MANAGER",
  "JH_FINANCE_MANAGER",
  "JH_LEASING_LEAD"
];

const requiredDecisionPermissions = [
  "ENGINEERING_PROJECT_APPROVE",
  "ENGINEERING_PLAN_APPROVE",
  "ENGINEERING_DAILY_REPORT_REVIEW",
  "ENGINEERING_RECTIFICATION_RECHECK",
  "ENGINEERING_ACCEPTANCE_REVIEW",
  "workorder:confirm",
  "workorder:evaluate",
  "file:upload"
];

const requiredOperationalRoles = [
  "PROPERTY_MANAGER",
  "SAFETY_MANAGER",
  "MAINTENANCE_ENGINEER",
  "PROPERTY_STAFF",
  "IOT_MANAGER",
  "IOT_OPERATOR",
  "FINANCE_MANAGER",
  "INVEST_MANAGER"
];

const deadActionPatterns = [
  { label: "href=\"#\"", pattern: /href=["']#["']/ },
  { label: "javascript:void(0)", pattern: /javascript:void\(0\)/ },
  { label: "TODO alert", pattern: /alert\(["'`](TODO|待实现|coming soon|敬请期待)/i },
  { label: "empty onClick", pattern: /onClick=\{\(\)\s*=>\s*\{\s*\}\}/ }
];

const failures = [];
const warnings = [];

function read(relativePath) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

function assertFile(relativePath) {
  if (!existsSync(join(repoRoot, relativePath))) {
    failures.push(`missing file: ${relativePath}`);
  }
}

for (const route of requiredRoutes) assertFile(route);
for (const migration of requiredMigrations) assertFile(migration);

const menuFile = read("apps/web/lib/menu.ts");
for (const path of requiredMenuPaths) {
  if (!menuFile.includes(path)) {
    failures.push(`menu missing path: ${path}`);
  }
}

const operationsTerminal = read("apps/web/components/operations/OperationsTerminalClient.tsx");
for (const token of ["MOBILE_ROLE_MODULES", "/engineering/terminal", "/tenant/service", "/workflow/inbox"]) {
  if (!operationsTerminal.includes(token)) {
    failures.push(`operations terminal missing token: ${token}`);
  }
}

const engineeringTerminal = read("apps/web/app/engineering/terminal/EngineeringMobileTerminalClient.tsx");
for (const token of ["快速新建日报", "engineeringDailyReportsApi.createDailyReport", "/engineering/inspections/new", "/engineering/rectifications", "/engineering/acceptances"]) {
  if (!engineeringTerminal.includes(token)) {
    failures.push(`engineering terminal missing token: ${token}`);
  }
}

const decisionMigration = read("database/migrations/000166_go_live_decision_permission_hardening.sql");
for (const role of requiredDecisionRoles) {
  if (!decisionMigration.includes(role)) {
    failures.push(`decision migration missing role: ${role}`);
  }
}
for (const permission of requiredDecisionPermissions) {
  if (!decisionMigration.includes(permission)) {
    failures.push(`decision migration missing permission: ${permission}`);
  }
}

const realUserRoleBridgeMigration = read("database/migrations/000167_go_live_real_user_role_bridge.sql");
for (const role of requiredOperationalRoles) {
  if (!realUserRoleBridgeMigration.includes(role)) {
    failures.push(`real user role bridge migration missing role: ${role}`);
  }
}

for (const finding of scanDeadActions(join(repoRoot, "apps/web/app"))) {
  warnings.push(finding);
}
for (const finding of scanDeadActions(join(repoRoot, "apps/web/components"))) {
  warnings.push(finding);
}

const report = {
  checked_at: new Date().toISOString(),
  go_live_date: "2026-07-06",
  status: failures.length === 0 ? "PASS" : "FAIL",
  failures,
  warnings,
  required_routes: requiredRoutes.length,
  required_menu_paths: requiredMenuPaths.length,
  required_migrations: requiredMigrations.length,
  decision_roles: requiredDecisionRoles.length,
  operational_roles: requiredOperationalRoles.length,
  decision_permissions: requiredDecisionPermissions.length
};

console.log(JSON.stringify(report, null, 2));

if (failures.length > 0) {
  process.exitCode = 1;
}

function scanDeadActions(root) {
  const findings = [];
  if (!existsSync(root)) return findings;
  for (const file of walk(root)) {
    if (!/\.(tsx|ts|jsx|js)$/.test(file)) continue;
    const rel = relative(repoRoot, file);
    const content = readFileSync(file, "utf8");
    for (const item of deadActionPatterns) {
      if (item.pattern.test(content)) {
        findings.push(`${rel}: ${item.label}`);
      }
    }
  }
  return findings;
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === "dist") continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      yield* walk(full);
    } else {
      yield full;
    }
  }
}
