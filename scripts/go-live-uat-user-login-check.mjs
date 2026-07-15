#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomBytes } from "node:crypto";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const envFile = resolve(repoRoot, ".env.production");
const composeFile = resolve(repoRoot, "infra/docker/docker-compose.prod.yml");
const defaultCredentialsFile = resolve(repoRoot, "database/import-reports/go-live-uat-users.local.csv");
const defaultAllUsersCredentialsFile = resolve(repoRoot, "database/import-reports/go-live-all-users.local.csv");

const args = new Set(process.argv.slice(2));
const resetPasswords = args.has("--reset-passwords");
const syncCredentials = args.has("--sync-credentials");
const allUsersMode = args.has("--all-users");
const apiBase = readArg("--api-base") ?? "http://127.0.0.1:4330/api/v1";
const webBase = readArg("--web-base") ?? "http://127.0.0.1:4330";
const credentialsFile = resolve(
  repoRoot,
  readArg("--credentials") ?? (allUsersMode ? defaultAllUsersCredentialsFile : defaultCredentialsFile)
);

const tenantId = "10000001";
const parkId = "20000001";

const keyUatUsers = [
  {
    username: "li_rongjie",
    displayName: "李荣杰",
    role: "工程物管负责人",
    requiredPermissions: [
      "ENGINEERING_DASHBOARD_VIEW",
      "ENGINEERING_PROJECT_VIEW",
      "ENGINEERING_PROJECT_APPROVE",
      "ENGINEERING_PLAN_VIEW",
      "ENGINEERING_PLAN_APPROVE",
      "ENGINEERING_DAILY_REPORT_VIEW",
      "ENGINEERING_DAILY_REPORT_REVIEW",
      "ENGINEERING_INSPECTION_VIEW",
      "ENGINEERING_RECTIFICATION_VIEW",
      "ENGINEERING_RECTIFICATION_RECHECK",
      "ENGINEERING_ACCEPTANCE_VIEW",
      "ENGINEERING_ACCEPTANCE_REVIEW",
      "workorder:assign",
      "safety_hazard:assign_rectify"
    ],
    requiredApiReads: [
      "/engineering/dashboard",
      "/engineering/projects?page=1&page_size=5",
      "/engineering/plans?page=1&page_size=5",
      "/engineering/daily-reports?page=1&page_size=5",
      "/engineering/inspections?page=1&page_size=5",
      "/engineering/rectifications?page=1&page_size=5",
      "/engineering/acceptances?page=1&page_size=5"
    ],
    requiredPages: ["/engineering/dashboard", "/engineering/projects", "/engineering/terminal"]
  },
  {
    username: "chen_guohui",
    displayName: "陈国辉",
    role: "物业现场负责人",
    requiredPermissions: [
      "ENGINEERING_DASHBOARD_VIEW",
      "ENGINEERING_PROJECT_VIEW",
      "ENGINEERING_PROJECT_APPROVE",
      "ENGINEERING_PLAN_VIEW",
      "ENGINEERING_PLAN_APPROVE",
      "ENGINEERING_DAILY_REPORT_VIEW",
      "ENGINEERING_DAILY_REPORT_REVIEW",
      "ENGINEERING_INSPECTION_VIEW",
      "ENGINEERING_RECTIFICATION_VIEW",
      "ENGINEERING_RECTIFICATION_RECHECK",
      "ENGINEERING_ACCEPTANCE_VIEW",
      "ENGINEERING_ACCEPTANCE_REVIEW",
      "workorder:assign",
      "safety_hazard:assign_rectify"
    ],
    requiredApiReads: [
      "/engineering/dashboard",
      "/engineering/projects?page=1&page_size=5",
      "/engineering/rectifications?page=1&page_size=5",
      "/work-orders?page=1&page_size=5"
    ],
    requiredPages: ["/operations/terminal", "/engineering/terminal", "/workorders/list", "/safety/hazards"]
  },
  {
    username: "shao_minghong",
    displayName: "邵明洪",
    role: "工程项目经理",
    requiredPermissions: [
      "ENGINEERING_DASHBOARD_VIEW",
      "ENGINEERING_PROJECT_VIEW",
      "ENGINEERING_DAILY_REPORT_VIEW",
      "ENGINEERING_DAILY_REPORT_CREATE",
      "ENGINEERING_DAILY_REPORT_SUBMIT",
      "ENGINEERING_INSPECTION_VIEW",
      "ENGINEERING_INSPECTION_CREATE",
      "ENGINEERING_RECTIFICATION_VIEW",
      "ENGINEERING_RECTIFICATION_SUBMIT",
      "ENGINEERING_ACCEPTANCE_VIEW",
      "ENGINEERING_ACCEPTANCE_CREATE",
      "ENGINEERING_ACCEPTANCE_SUBMIT",
      "workorder:create",
      "file:upload"
    ],
    requiredApiReads: [
      "/engineering/dashboard",
      "/engineering/projects?page=1&page_size=5",
      "/engineering/daily-reports?page=1&page_size=5",
      "/engineering/inspections?page=1&page_size=5",
      "/engineering/rectifications?page=1&page_size=5",
      "/engineering/acceptances?page=1&page_size=5"
    ],
    requiredPages: ["/engineering/terminal", "/engineering/projects", "/engineering/daily-reports", "/engineering/inspections", "/engineering/acceptances"]
  },
  {
    username: "zheng_ziyong",
    displayName: "郑子勇",
    role: "机电安装工程师",
    requiredPermissions: [
      "ENGINEERING_DASHBOARD_VIEW",
      "ENGINEERING_PROJECT_VIEW",
      "ENGINEERING_DAILY_REPORT_VIEW",
      "ENGINEERING_DAILY_REPORT_CREATE",
      "ENGINEERING_DAILY_REPORT_SUBMIT",
      "ENGINEERING_INSPECTION_VIEW",
      "ENGINEERING_INSPECTION_CREATE",
      "ENGINEERING_RECTIFICATION_VIEW",
      "ENGINEERING_RECTIFICATION_SUBMIT",
      "ENGINEERING_ACCEPTANCE_VIEW",
      "ENGINEERING_ACCEPTANCE_CREATE",
      "ENGINEERING_ACCEPTANCE_SUBMIT",
      "workorder:create",
      "file:upload"
    ],
    requiredApiReads: [
      "/engineering/dashboard",
      "/engineering/projects?page=1&page_size=5",
      "/engineering/daily-reports?page=1&page_size=5",
      "/engineering/inspections?page=1&page_size=5",
      "/engineering/rectifications?page=1&page_size=5",
      "/engineering/acceptances?page=1&page_size=5"
    ],
    requiredPages: ["/engineering/terminal", "/engineering/daily-reports", "/engineering/inspections", "/engineering/acceptances", "/iot/devices"]
  },
  {
    username: "liu_hantao",
    displayName: "刘汉涛",
    role: "财务负责人",
    requiredPermissions: [
      "ENGINEERING_DASHBOARD_VIEW",
      "ENGINEERING_PROJECT_VIEW",
      "ENGINEERING_ACCEPTANCE_VIEW",
      "ENGINEERING_ACCEPTANCE_REVIEW",
      "ENGINEERING_DAILY_REPORT_VIEW",
      "ENGINEERING_DAILY_REPORT_REVIEW",
      "leasing_receivable:read",
      "leasing_payment:read"
    ],
    requiredApiReads: [
      "/engineering/dashboard",
      "/engineering/projects?page=1&page_size=5",
      "/engineering/acceptances?page=1&page_size=5",
      "/leasing/receivables?page=1&page_size=5",
      "/leasing/payments?page=1&page_size=5"
    ],
    requiredPages: ["/engineering/dashboard", "/engineering/projects", "/leasing/receivables", "/leasing/payments"]
  },
  {
    username: "song_qianchang",
    displayName: "宋乾昌",
    role: "招商负责人",
    requiredPermissions: [
      "ENGINEERING_DASHBOARD_VIEW",
      "ENGINEERING_PROJECT_VIEW",
      "park_tenant:read",
      "park_tenant:360",
      "leasing_lead:read",
      "leasing_lead:create",
      "workorder:create"
    ],
    requiredApiReads: [
      "/engineering/dashboard",
      "/engineering/projects?page=1&page_size=5",
      "/park-tenants?page=1&page_size=5",
      "/leasing/leads?page=1&page_size=5"
    ],
    requiredPages: ["/engineering/dashboard", "/engineering/projects", "/leasing/tenants", "/leasing/leads"]
  }
];
const uatUsers = allUsersMode ? loadAllEnabledUsers() : keyUatUsers;

const failures = [];
const warnings = [];
const userResults = [];

if (resetPasswords && syncCredentials) {
  fail("--reset-passwords and --sync-credentials cannot be used together");
} else if ((resetPasswords || syncCredentials) && !existsSync(envFile)) {
  fail(`missing production env file: ${envFile}`);
} else if (resetPasswords) {
  resetUatPasswords();
} else if (syncCredentials) {
  syncUatPasswords();
}

if (!existsSync(credentialsFile)) {
  fail(`missing credentials file: ${credentialsFile}; run with --reset-passwords or pass --credentials`);
} else {
  const credentials = readCredentials(credentialsFile);
  await runUat(credentials);
}

const report = {
  checked_at: new Date().toISOString(),
  go_live_date: "2026-07-06",
  status: failures.length === 0 ? "PASS" : "FAIL",
  mode: allUsersMode ? "all_enabled_users" : "key_go_live_users",
  api_base: apiBase,
  web_base: webBase,
  reset_passwords: resetPasswords,
  sync_credentials: syncCredentials,
  credentials_file: credentialsFile,
  users_checked: userResults.length,
  results: userResults,
  warnings,
  failures
};

console.log(JSON.stringify(report, null, 2));
if (failures.length > 0) process.exitCode = 1;

function resetUatPasswords() {
  mkdirSync(dirname(credentialsFile), { recursive: true });
  const rows = [["username", "display_name", "uat_password", "role", "generated_at"]];
  const generatedRows = [];
  const values = [];

  for (const user of uatUsers) {
    const generatedAt = new Date().toISOString();
    const password = buildPassword(user.username);
    const hash = bcryptHash(password);
    const row = [user.username, user.displayName, password, user.role, generatedAt];
    rows.push(row);
    generatedRows.push(row);
    values.push(`(${sqlString(user.username)}, ${sqlString(hash)})`);
  }

  const updatedRows = psql(`
WITH src(username, password_hash) AS (
  VALUES
    ${values.join(",\n    ")}
),
updated AS (
  UPDATE sys_user u
     SET password_hash = src.password_hash,
         is_enabled = true,
         status = 'enabled',
         password_failed_count = 0,
         password_failed_window_started_at = NULL,
         password_locked_until = NULL,
         last_password_failed_at = NULL,
         update_time = now(),
         remark = COALESCE(NULLIF(u.remark, ''), '') || CASE WHEN COALESCE(u.remark, '') = '' THEN '' ELSE '；' END || 'go-live UAT password initialized'
    FROM src
   WHERE u.tenant_id = ${sqlString(tenantId)}
     AND u.park_id = ${sqlString(parkId)}
     AND u.username = src.username
     AND u.is_deleted = false
   RETURNING u.username
)
SELECT count(*) FROM updated;
`);
  const updatedCount = Number(updatedRows[0] ?? 0);
  if (updatedCount !== uatUsers.length) {
    fail(`UAT password reset affected ${updatedCount} users, expected ${uatUsers.length}`);
    return;
  }
  writeCredentialsFile(credentialsFile, rows);

  if (allUsersMode && credentialsFile !== defaultCredentialsFile) {
    const keyUsernames = new Set(keyUatUsers.map((user) => user.username));
    const keyRows = [rows[0], ...generatedRows.filter((row) => keyUsernames.has(row[0]))];
    writeCredentialsFile(defaultCredentialsFile, keyRows);
  }
}

function syncUatPasswords() {
  if (!existsSync(credentialsFile)) {
    fail(`missing credentials file for synchronization: ${credentialsFile}`);
    return;
  }

  const credentials = readCredentials(credentialsFile);
  const values = [];
  for (const user of uatUsers) {
    const password = credentials.get(user.username);
    if (!password) {
      fail(`missing password for ${user.username}`);
      continue;
    }
    values.push(`(${sqlString(user.username)}, ${sqlString(bcryptHash(password))})`);
  }
  if (failures.length > 0) return;

  const updatedRows = psql(`
WITH src(username, password_hash) AS (
  VALUES
    ${values.join(",\n    ")}
),
updated AS (
  UPDATE sys_user u
     SET password_hash = src.password_hash,
         is_enabled = true,
         status = 'enabled',
         password_failed_count = 0,
         password_failed_window_started_at = NULL,
         password_locked_until = NULL,
         last_password_failed_at = NULL,
         update_time = now(),
         remark = COALESCE(NULLIF(u.remark, ''), '') || CASE WHEN COALESCE(u.remark, '') = '' THEN '' ELSE '；' END || 'production UAT credential synchronized'
    FROM src
   WHERE u.tenant_id = ${sqlString(tenantId)}
     AND u.park_id = ${sqlString(parkId)}
     AND u.username = src.username
     AND u.is_deleted = false
   RETURNING u.username
)
SELECT count(*) FROM updated;
`);
  const updatedCount = Number(updatedRows[0] ?? 0);
  if (updatedCount !== uatUsers.length) {
    fail(`UAT credential synchronization affected ${updatedCount} users, expected ${uatUsers.length}`);
  }
}

async function runUat(credentials) {
  for (const user of uatUsers) {
    const password = credentials.get(user.username);
    const result = {
      username: user.username,
      display_name: user.displayName,
      role: user.role,
      login: "FAIL",
      users_me: "FAIL",
      permission_check: "FAIL",
      menu_check: "FAIL",
      api_read_check: "FAIL",
      page_route_check: "FAIL",
      missing_permissions: [],
      missing_menus: [],
      failed_api_reads: [],
      failed_pages: [],
      checked_menu_pages: 0
    };
    userResults.push(result);

    if (!password) {
      fail(`missing password for ${user.username}`);
      continue;
    }

    const login = await requestJson(`${apiBase}/auth/login`, {
      method: "POST",
      body: { tenantId, parkId, username: user.username, password }
    });
    if (login.status !== 200 || !login.body?.data?.accessToken) {
      fail(`login failed for ${user.username}: ${login.status}`);
      continue;
    }
    result.login = "PASS";
    const token = login.body.data.accessToken;

    const me = await requestJson(`${apiBase}/users/me`, { token });
    if (me.status !== 200 || !me.body?.data) {
      fail(`/users/me failed for ${user.username}: ${me.status}`);
      continue;
    }
    result.users_me = "PASS";

    const context = me.body.data;
    const permissions = new Set(context.permissions ?? []);
    const hasAll = permissions.has("*");
    if (user.allUserSmoke) {
      if (hasAll || permissions.size > 0) {
        result.permission_check = "PASS";
      } else {
        result.missing_permissions = ["NO_EFFECTIVE_PERMISSION"];
        fail(`${user.username} has no effective permissions`);
      }
    } else {
      result.missing_permissions = user.requiredPermissions.filter((permission) => !hasAll && !permissions.has(permission));
      if (result.missing_permissions.length === 0) {
        result.permission_check = "PASS";
      } else {
        fail(`${user.username} missing permissions: ${result.missing_permissions.join(", ")}`);
      }
    }

    const menuHrefs = new Set(flattenMenuHrefs(context.menu_tree ?? context.menus ?? []));
    const pagesToCheck = user.allUserSmoke ? Array.from(menuHrefs).map(normalizeMenuHref).filter(Boolean) : user.requiredPages;
    result.checked_menu_pages = pagesToCheck.length;
    if (user.allUserSmoke) {
      if (pagesToCheck.length > 0) {
        result.menu_check = "PASS";
      } else {
        result.missing_menus = ["NO_VISIBLE_MENU"];
        fail(`${user.username} has no visible menu pages`);
      }
    } else {
      result.missing_menus = user.requiredPages.filter((page) => !menuHrefs.has(page));
      if (result.missing_menus.length === 0) {
        result.menu_check = "PASS";
      } else {
        fail(`${user.username} missing menu pages: ${result.missing_menus.join(", ")}`);
      }
    }

    for (const path of user.requiredApiReads) {
      const response = await requestJson(`${apiBase}${path}`, { token });
      if (response.status < 200 || response.status >= 300) {
        result.failed_api_reads.push(`${path} (${response.status})`);
      }
    }
    if (result.failed_api_reads.length === 0) {
      result.api_read_check = "PASS";
    } else {
      fail(`${user.username} API read failures: ${result.failed_api_reads.join(", ")}`);
    }

    for (const page of pagesToCheck) {
      const response = await requestText(`${webBase}${page}`);
      if (![200, 307, 308].includes(response.status)) {
        result.failed_pages.push(`${page} (${response.status})`);
      }
    }
    if (result.failed_pages.length === 0) {
      result.page_route_check = "PASS";
    } else {
      fail(`${user.username} page route failures: ${result.failed_pages.join(", ")}`);
    }
  }
}

function loadAllEnabledUsers() {
  const rows = psql(`
SELECT
  u.username,
  COALESCE(NULLIF(u.display_name, ''), u.username) AS display_name,
  COALESCE(string_agg(DISTINCT r.name || ':' || r.code, ', ' ORDER BY r.name || ':' || r.code), '') AS roles
FROM sys_user u
LEFT JOIN rel_user_role ur
  ON ur.user_id = u.id
 AND ur.tenant_id = u.tenant_id
 AND ur.park_id = u.park_id
 AND ur.is_deleted = false
LEFT JOIN sys_role r
  ON r.id = ur.role_id
 AND r.tenant_id = u.tenant_id
 AND r.park_id = u.park_id
 AND r.is_deleted = false
WHERE u.tenant_id = ${sqlString(tenantId)}
  AND u.park_id = ${sqlString(parkId)}
  AND u.is_deleted = false
  AND u.is_enabled = true
  AND u.status = 'enabled'
GROUP BY u.username, u.display_name
ORDER BY u.username;
`);
  return rows.map((row) => {
    const [username, displayName, roleSummary] = row.split("|");
    return {
      username,
      displayName,
      role: roleSummary || "未配置角色",
      allUserSmoke: true,
      requiredPermissions: [],
      requiredApiReads: [],
      requiredPages: []
    };
  });
}

function readCredentials(file) {
  const content = readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  const [headerLine, ...lines] = content.split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(headerLine);
  const usernameIndex = headers.indexOf("username");
  const passwordIndex = headers.findIndex((header) => ["uat_password", "initial_password", "password"].includes(header));
  if (usernameIndex < 0 || passwordIndex < 0) {
    throw new Error(`credentials file must include username and password column: ${file}`);
  }
  const credentials = new Map();
  for (const line of lines) {
    const cells = parseCsvLine(line);
    const username = cells[usernameIndex];
    const password = cells[passwordIndex];
    if (username && password && password !== "保留原密码") credentials.set(username, password);
  }
  return credentials;
}

async function requestJson(url, options = {}) {
  const headers = {
    accept: "application/json",
    ...(options.body ? { "content-type": "application/json" } : {}),
    ...(options.token ? { authorization: `Bearer ${options.token}` } : {})
  };
  try {
    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  } catch (error) {
    return { status: 0, body: { message: error.message } };
  }
}

async function requestText(url) {
  try {
    const response = await fetch(url, { redirect: "manual" });
    return { status: response.status };
  } catch (error) {
    return { status: 0, error };
  }
}

function flattenMenuHrefs(nodes) {
  const hrefs = [];
  for (const node of nodes) {
    if (node?.href) hrefs.push(node.href);
    if (Array.isArray(node?.children)) hrefs.push(...flattenMenuHrefs(node.children));
  }
  return hrefs;
}

function normalizeMenuHref(href) {
  if (typeof href !== "string" || !href.startsWith("/")) return null;
  const [path] = href.split("?");
  if (!path || path.includes(":")) return null;
  return path;
}

function bcryptHash(password) {
  const script = `
let bcrypt;
for (const name of ["/app/apps/api/node_modules/bcrypt", "/app/node_modules/bcrypt", "bcrypt"]) {
  try { bcrypt = require(name); break; } catch {}
}
if (!bcrypt) throw new Error("bcrypt module not found");
const rounds = Number(process.env.BCRYPT_SALT_ROUNDS || 12);
bcrypt.hash(process.argv[1], rounds).then((hash) => process.stdout.write(hash));
`;
  return execFileSync("docker", [
    "compose",
    "--env-file",
    ".env.production",
    "-f",
    "infra/docker/docker-compose.prod.yml",
    "exec",
    "-T",
    "api",
    "node",
    "-e",
    script,
    password
  ], { cwd: repoRoot, encoding: "utf8", maxBuffer: 1024 * 1024 }).trim();
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

function buildPassword(username) {
  return `JhUat@${randomBytes(7).toString("hex")}${username.slice(0, 2).toUpperCase()}!`;
}

function fail(message) {
  failures.push(message);
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function csvCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function writeCredentialsFile(file, rows) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, rows.map((row) => row.map(csvCell).join(",")).join("\n"), { encoding: "utf8", mode: 0o600 });
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}
