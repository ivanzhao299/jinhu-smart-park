#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const envFile = resolve(repoRoot, ".env.production");
const composeFile = resolve(repoRoot, "infra/docker/docker-compose.prod.yml");

const failures = [];
const warnings = [];

const goLiveUsers = [
  {
    displayName: "李荣杰",
    requiredPermissions: [
      "ENGINEERING_PROJECT_APPROVE",
      "ENGINEERING_PLAN_APPROVE",
      "ENGINEERING_DAILY_REPORT_REVIEW",
      "ENGINEERING_RECTIFICATION_RECHECK",
      "ENGINEERING_ACCEPTANCE_REVIEW",
      "workorder:assign",
      "safety_hazard:assign_rectify"
    ]
  },
  {
    displayName: "陈国辉",
    requiredPermissions: [
      "ENGINEERING_PROJECT_APPROVE",
      "ENGINEERING_PLAN_APPROVE",
      "ENGINEERING_DAILY_REPORT_REVIEW",
      "ENGINEERING_RECTIFICATION_RECHECK",
      "ENGINEERING_ACCEPTANCE_REVIEW",
      "workorder:assign",
      "safety_hazard:assign_rectify"
    ]
  },
  {
    displayName: "邵明洪",
    requiredPermissions: [
      "ENGINEERING_DAILY_REPORT_CREATE",
      "ENGINEERING_DAILY_REPORT_SUBMIT",
      "ENGINEERING_INSPECTION_CREATE",
      "ENGINEERING_RECTIFICATION_SUBMIT",
      "ENGINEERING_ACCEPTANCE_CREATE",
      "ENGINEERING_ACCEPTANCE_SUBMIT",
      "workorder:create",
      "file:upload"
    ]
  },
  {
    displayName: "郑子勇",
    requiredPermissions: [
      "ENGINEERING_DAILY_REPORT_CREATE",
      "ENGINEERING_DAILY_REPORT_SUBMIT",
      "ENGINEERING_INSPECTION_CREATE",
      "ENGINEERING_RECTIFICATION_SUBMIT",
      "ENGINEERING_ACCEPTANCE_CREATE",
      "ENGINEERING_ACCEPTANCE_SUBMIT",
      "workorder:create",
      "file:upload"
    ]
  },
  {
    displayName: "刘汉涛",
    requiredPermissions: [
      "ENGINEERING_PROJECT_VIEW",
      "ENGINEERING_ACCEPTANCE_REVIEW",
      "ENGINEERING_DAILY_REPORT_REVIEW",
      "leasing_receivable:read",
      "leasing_payment:read"
    ]
  },
  {
    displayName: "宋乾昌",
    requiredPermissions: [
      "ENGINEERING_PROJECT_VIEW",
      "park_tenant:read",
      "park_tenant:360",
      "leasing_lead:read",
      "leasing_lead:create",
      "workorder:create"
    ]
  }
];

const requiredAdminPermissions = [
  "engineering",
  "engineering:dashboard",
  "engineering:projects",
  "engineering:plans",
  "engineering:daily-reports",
  "engineering:inspections",
  "engineering:rectifications",
  "engineering:acceptances",
  "system:read",
  "user:read",
  "role:read",
  "dict:read",
  "module:read"
];

const requiredDictionaries = [
  "workorder_type",
  "workorder_priority",
  "workorder_urgency",
  "workorder_status",
  "workorder_source_type",
  "safety_risk_level",
  "safety_hazard_source_type",
  "safety_hazard_type",
  "safety_hazard_status",
  "unit_usage_type",
  "unit_rental_status",
  "unit_fitting_status"
];

const requiredMigrations = [
  "000164_epdr_admin_visibility_backfill.sql",
  "000165_cockpit_module_visibility_backfill.sql",
  "000166_go_live_decision_permission_hardening.sql",
  "000167_go_live_real_user_role_bridge.sql",
  "000168_go_live_admin_system_alias_permissions.sql",
  "000170_go_live_acceptance_field_execution_bridge.sql",
  "000171_go_live_invest_workorder_create_repair.sql"
];

const requiredRoutes = [
  "/login",
  "/operations/terminal",
  "/engineering/terminal",
  "/engineering",
  "/engineering/dashboard",
  "/engineering/projects",
  "/engineering/plans",
  "/engineering/daily-reports",
  "/engineering/inspections",
  "/engineering/rectifications",
  "/engineering/acceptances",
  "/system/users",
  "/system/roles",
  "/system/dicts"
];

if (!existsSync(envFile)) {
  failures.push(`missing production env file: ${envFile}`);
} else {
  checkDatabaseState();
}

await checkRoutes();

const report = {
  checked_at: new Date().toISOString(),
  go_live_date: "2026-07-06",
  status: failures.length === 0 ? "PASS" : "FAIL",
  failures,
  warnings,
  users_checked: goLiveUsers.length,
  dictionaries_checked: requiredDictionaries.length,
  migrations_checked: requiredMigrations.length,
  routes_checked: requiredRoutes.length
};

console.log(JSON.stringify(report, null, 2));
if (failures.length > 0) process.exitCode = 1;

function checkDatabaseState() {
  const userRows = psql(`
WITH effective AS (
  SELECT
    u.display_name,
    u.username,
    u.is_enabled,
    array_remove(array_agg(DISTINCT r.code ORDER BY r.code), NULL) AS role_codes,
    array_remove(array_agg(DISTINCT p.code ORDER BY p.code), NULL) AS permission_codes
  FROM sys_user u
  LEFT JOIN rel_user_role ur
    ON ur.user_id = u.id
   AND ur.is_deleted = false
  LEFT JOIN sys_role r
    ON r.id = ur.role_id
   AND r.is_deleted = false
  LEFT JOIN rel_role_perm rp
    ON rp.role_id = r.id
   AND rp.is_deleted = false
  LEFT JOIN sys_permission p
    ON p.id = rp.permission_id
   AND p.is_deleted = false
  WHERE u.tenant_id = '10000001'
    AND u.park_id = '20000001'
    AND u.is_deleted = false
    AND u.display_name IN (${goLiveUsers.map((user) => sqlString(user.displayName)).join(", ")})
  GROUP BY u.display_name, u.username, u.is_enabled
)
SELECT display_name || '|' || username || '|' || is_enabled || '|' || COALESCE(array_to_string(role_codes, ','), '') || '|' || COALESCE(array_to_string(permission_codes, ','), '')
FROM effective
ORDER BY display_name;
`);

  const byDisplayName = new Map();
  for (const row of userRows) {
    if (!row.trim()) continue;
    const [displayName, username, enabled, rolesRaw, permsRaw] = row.split("|");
    byDisplayName.set(displayName, {
      username,
      enabled: enabled === "t" || enabled === "true",
      roles: rolesRaw ? rolesRaw.split(",") : [],
      permissions: new Set(permsRaw ? permsRaw.split(",") : [])
    });
  }

  for (const user of goLiveUsers) {
    const actual = byDisplayName.get(user.displayName);
    if (!actual) {
      failures.push(`missing go-live user: ${user.displayName}`);
      continue;
    }
    if (!actual.enabled) failures.push(`disabled go-live user: ${user.displayName}`);
    if (actual.roles.length === 0) failures.push(`go-live user has no roles: ${user.displayName}`);
    for (const permission of user.requiredPermissions) {
      if (!actual.permissions.has(permission)) {
        failures.push(`go-live user ${user.displayName} missing permission: ${permission}`);
      }
    }
  }

  const adminPermissionRows = psql(`
WITH admin_perms AS (
  SELECT DISTINCT p.code
  FROM sys_role r
  JOIN rel_role_perm rp
    ON rp.role_id = r.id
   AND rp.is_deleted = false
  JOIN sys_permission p
    ON p.id = rp.permission_id
   AND p.is_deleted = false
  WHERE r.tenant_id = '10000001'
    AND r.park_id = '20000001'
    AND r.is_deleted = false
    AND r.code IN ('SUPER_ADMIN', 'SYSTEM_ADMIN')
)
SELECT code FROM admin_perms ORDER BY code;
`);
  const adminPermissions = new Set(adminPermissionRows.filter(Boolean));
  for (const permission of requiredAdminPermissions) {
    if (!adminPermissions.has(permission)) {
      failures.push(`admin roles missing permission: ${permission}`);
    }
  }

  const dictionaryRows = psql(`
SELECT dt.dict_code || '|' || count(di.id) FILTER (WHERE di.is_deleted = false AND di.status = 'enabled')
FROM sys_dict_type dt
LEFT JOIN sys_dict_item di
  ON di.dict_type_id = dt.id
 AND di.tenant_id = dt.tenant_id
 AND di.park_id = dt.park_id
WHERE dt.tenant_id = '10000001'
  AND dt.park_id = '20000001'
  AND dt.is_deleted = false
  AND dt.dict_code IN (${requiredDictionaries.map(sqlString).join(", ")})
GROUP BY dt.dict_code
ORDER BY dt.dict_code;
`);
  const dictionaryCounts = new Map();
  for (const row of dictionaryRows) {
    if (!row.trim()) continue;
    const [code, count] = row.split("|");
    dictionaryCounts.set(code, Number(count));
  }
  for (const dictCode of requiredDictionaries) {
    const count = dictionaryCounts.get(dictCode) ?? 0;
    if (count <= 0) failures.push(`dictionary has no enabled items: ${dictCode}`);
  }

  const migrationRows = psql(`
SELECT filename || '|' || status
FROM public.schema_migrations
WHERE filename IN (${requiredMigrations.map(sqlString).join(", ")})
ORDER BY filename;
`);
  const migrationStatus = new Map();
  for (const row of migrationRows) {
    if (!row.trim()) continue;
    const [filename, status] = row.split("|");
    migrationStatus.set(filename, status);
  }
  for (const filename of requiredMigrations) {
    if (migrationStatus.get(filename) !== "succeeded") {
      failures.push(`migration not succeeded: ${filename}`);
    }
  }
}

async function checkRoutes() {
  for (const route of requiredRoutes) {
    try {
      const response = await fetch(`http://127.0.0.1:4330${route}`, { redirect: "manual" });
      if (!response.ok && response.status !== 307 && response.status !== 308) {
        failures.push(`route not reachable (${response.status}): ${route}`);
      }
    } catch (error) {
      failures.push(`route check failed: ${route} ${error.message}`);
    }
  }
}

function psql(sql) {
  const command = `
set -a
. ${shellQuote(envFile)}
set +a
docker compose --env-file ${shellQuote(envFile)} -f ${shellQuote(composeFile)} exec -T postgres \\
  psql -X -A -t -F '|' -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"
`;
  const output = execFileSync("sh", ["-lc", command], {
    cwd: repoRoot,
    input: sql,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 10
  });
  return output.split(/\r?\n/).filter((line) => line.length > 0);
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}
