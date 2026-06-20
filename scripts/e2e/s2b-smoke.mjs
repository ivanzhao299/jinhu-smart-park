import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const requireFromApi = createRequire(resolve(rootDir, "apps/api/package.json"));
const XLSX = requireFromApi("xlsx");
const execFileAsync = promisify(execFile);
const apiBase = process.env.E2E_API_BASE ?? "http://127.0.0.1:3001/api/v1";
const composeFile = process.env.COMPOSE_FILE ?? resolve(rootDir, "infra/docker/docker-compose.yml");
const postgresUser = process.env.POSTGRES_USER ?? "jinhu";
const postgresDb = process.env.POSTGRES_DB ?? "jinhu_smart_park";
const tenantId = process.env.E2E_TENANT_ID ?? "10000001";
const parkId = process.env.E2E_PARK_ID ?? "20000001";
const adminUser = process.env.E2E_ADMIN_USERNAME ?? "admin";
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? "Jinhu@123456";
const normalUser = process.env.E2E_NORMAL_USERNAME ?? "s1_user";
const normalPassword = process.env.E2E_NORMAL_PASSWORD ?? "Jinhu@123456";
const stamp = Date.now();

let apiProcess = null;

function getPnpmBin() {
  if (process.env.PNPM_BIN) {
    return process.env.PNPM_BIN;
  }
  const bundled = resolve(rootDir, ".tools/pnpm");
  return existsSync(bundled) ? bundled : "pnpm";
}

function logStep(message) {
  console.log(`[s2b-smoke] ${message}`);
}

async function request(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, options);
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await response.json().catch(() => null) : await response.arrayBuffer();
  return { response, body };
}

async function login(username, password) {
  return request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": `s2b-login-${randomUUID()}` },
    body: JSON.stringify({ tenantId, parkId, username, password })
  });
}

async function jsonRequest(path, token, method, body) {
  return request(path, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      "x-idempotency-key": `s2b-${stamp}-${randomUUID()}`
    },
    body: JSON.stringify(body)
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertStatus(name, actual, expected) {
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (!allowed.includes(actual)) {
    throw new Error(`${name} expected HTTP ${allowed.join(" or ")}, got ${actual}`);
  }
  logStep(`${name}: HTTP ${actual}`);
}

function assertClose(name, actual, expected, tolerance = 0.01) {
  if (Math.abs(Number(actual) - Number(expected)) > tolerance) {
    throw new Error(`${name} expected ${expected}, got ${actual}`);
  }
}

function assertUniformResponse(name, body) {
  assert(body && typeof body === "object" && !(body instanceof ArrayBuffer), `${name} did not return JSON`);
  for (const key of ["code", "message", "data", "request_id", "server_time"]) {
    assert(Object.hasOwn(body, key), `${name} response is missing ${key}`);
  }
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function dbScalar(sql) {
  const { stdout } = await execFileAsync("docker", [
    "compose",
    "-f",
    composeFile,
    "exec",
    "-T",
    "postgres",
    "psql",
    "-U",
    postgresUser,
    "-d",
    postgresDb,
    "-t",
    "-A",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    sql
  ]);
  return stdout.trim();
}

async function dbExec(sql) {
  await dbScalar(sql);
}

async function isApiReachable() {
  try {
    const { response } = await request("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId, parkId, username: adminUser, password: "bad-password" })
    });
    return response.status === 401;
  } catch {
    return false;
  }
}

async function waitForApi() {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (await isApiReachable()) {
      return;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 1000));
  }
  throw new Error(`API did not become reachable at ${apiBase}`);
}

async function ensureApiStarted() {
  if (await isApiReachable()) {
    logStep(`API reachable: ${apiBase}`);
    return;
  }
  if (process.env.E2E_NO_API_START === "1") {
    throw new Error(`API is not reachable at ${apiBase}`);
  }
  logStep("API not reachable, starting @jinhu/api for S2-B smoke test");
  apiProcess = spawn(getPnpmBin(), ["--filter", "@jinhu/api", "start"], {
    cwd: rootDir,
    detached: true,
    stdio: "ignore",
    env: { ...process.env }
  });
  apiProcess.unref();
  await waitForApi();
}

function dataItems(body) {
  return body?.data?.items ?? [];
}

async function getFirstBuildingAndFloors(token) {
  const buildings = await request("/buildings?page=1&page_size=20", { headers: { authorization: `Bearer ${token}` } });
  assertStatus("list buildings", buildings.response.status, 200);
  assertUniformResponse("list buildings", buildings.body);
  const building = dataItems(buildings.body).find((item) => item.buildingCode === "JH-B01") ?? dataItems(buildings.body)[0];
  assert(building?.id, "No building found for S2-B smoke");

  const floors = await request(`/floors?building_id=${building.id}&page=1&page_size=20`, {
    headers: { authorization: `Bearer ${token}` }
  });
  assertStatus("list floors", floors.response.status, 200);
  assertUniformResponse("list floors", floors.body);
  const floor = dataItems(floors.body).find((item) => item.floorCode === "JH-B01-F01") ?? dataItems(floors.body)[0];
  assert(floor?.id, "No floor found for S2-B smoke");

  const mismatchFloors = await request("/floors?page=1&page_size=50", {
    headers: { authorization: `Bearer ${token}` }
  });
  assertStatus("list mismatch floors", mismatchFloors.response.status, 200);
  const mismatchFloor = dataItems(mismatchFloors.body).find((item) => item.buildingId !== building.id);
  assert(mismatchFloor?.id, "No mismatched floor found for S2-B smoke");

  return { building, floor, mismatchFloor };
}

async function createUnit(token, buildingId, floorId, rentalStatus = 10) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const suffix = String(1000 + Math.floor(Math.random() * 9000));
    const unitCode = `JH-B01-F01-R${suffix}`;
    const created = await jsonRequest("/park-units", token, "POST", {
      unitCode,
      buildingId,
      floorId,
      unitName: `S2B自测房源${suffix}`,
      usageType: 10,
      unitArea: 88,
      useArea: 76,
      rentalStatus,
      fittingStatus: 20,
      refPrice: 35,
      availableDate: "2026-06-01",
      status: 1,
      remark: "S2-B smoke test"
    });
    if (created.response.status === 201) {
      assertUniformResponse("create unit", created.body);
      logStep(`create unit: ${unitCode}`);
      return created.body.data;
    }
    if (created.response.status !== 409) {
      throw new Error(`create unit failed with HTTP ${created.response.status}: ${JSON.stringify(created.body)}`);
    }
  }
  throw new Error("Unable to create a unique S2-B smoke unit");
}

function makeImportWorkbook(rows) {
  const headers = [
    "code",
    "unit_code",
    "building_code",
    "floor_code",
    "unit_name",
    "usage_type",
    "unit_area",
    "use_area",
    "rental_status",
    "fitting_status",
    "ref_price",
    "available_date",
    "remark"
  ];
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "房源导入");
  return XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
}

async function importWorkbook(token, buffer) {
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "s2b-import.xlsx");
  return request("/park-units/import", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "x-idempotency-key": `s2b-import-${stamp}-${randomUUID()}`
    },
    body: form
  });
}

function readWorkbookRows(arrayBuffer) {
  const workbook = XLSX.read(Buffer.from(arrayBuffer), { type: "buffer" });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  assert(worksheet, "export workbook has no worksheet");
  return XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
}

function assertExcelColumnEquals(name, arrayBuffer, columnName, expectedValue) {
  const rows = readWorkbookRows(arrayBuffer);
  const headers = rows[0] ?? [];
  const columnIndex = headers.indexOf(columnName);
  assert(columnIndex >= 0, `${name} missing column ${columnName}`);
  const dataRows = rows.slice(1);
  assert(dataRows.length > 0, `${name} has no data rows`);
  assert(
    dataRows.every((row) => String(row[columnIndex]) === expectedValue),
    `${name} contains rows outside ${columnName}=${expectedValue}`
  );
}

function assertExcelColumnBlank(name, arrayBuffer, columnName) {
  const rows = readWorkbookRows(arrayBuffer);
  const headers = rows[0] ?? [];
  const columnIndex = headers.indexOf(columnName);
  assert(columnIndex >= 0, `${name} missing column ${columnName}`);
  const dataRows = rows.slice(1);
  assert(dataRows.length > 0, `${name} has no data rows`);
  assert(dataRows.every((row) => row[columnIndex] === ""), `${name} leaked hidden column ${columnName}`);
}

async function createScopedAssetUser(buildingId) {
  const userId = randomUUID();
  const roleId = randomUUID();
  const dataScopeRuleId = randomUUID();
  const roleDataScopeId = randomUUID();
  const fieldPolicyId = randomUUID();
  const roleFieldPolicyId = randomUUID();
  const userRoleId = randomUUID();
  const username = `s2b_scope_${stamp}`;
  const roleCode = `s2b_scope_role_${stamp}`;
  const ruleCode = `s2b_building_scope_${stamp}`;
  const policyRemark = `S2-B smoke hidden ref_price ${stamp}`;
  const permissionCodes = ["unit:read", "unit:export"];
  const permissionGrants = permissionCodes.map((code) => ({ id: randomUUID(), code }));

  await dbExec(`
    WITH normal_password AS (
      SELECT password_hash FROM sys_user
      WHERE tenant_id = ${sqlLiteral(tenantId)}
        AND park_id = ${sqlLiteral(parkId)}
        AND username = ${sqlLiteral(normalUser)}
        AND is_deleted = false
      LIMIT 1
    )
    INSERT INTO sys_user (
      id, tenant_id, park_id, username, display_name, password_hash, mobile, email,
      is_enabled, status, create_by, create_time, update_by, update_time, is_deleted, version, remark
    )
    SELECT
      ${sqlLiteral(userId)}, ${sqlLiteral(tenantId)}, ${sqlLiteral(parkId)}, ${sqlLiteral(username)}, 'S2B数据范围用户', password_hash, NULL, NULL,
      true, 'enabled', NULL, now(), NULL, now(), false, 1, 'S2-B smoke data scope'
    FROM normal_password;

    INSERT INTO sys_role (
      id, tenant_id, park_id, code, name, parent_id, role_path, role_level, level, sort_no,
      role_type, role_scope, data_scope, data_scope_config, is_template, is_system, is_builtin,
      is_super, editable, is_editable, is_deletable, is_enabled, status,
      create_by, create_time, update_by, update_time, is_deleted, version, remark
    ) VALUES (
      ${sqlLiteral(roleId)}, ${sqlLiteral(tenantId)}, ${sqlLiteral(parkId)}, ${sqlLiteral(roleCode)}, 'S2B数据范围角色',
      NULL, NULL, 1, 1, 0, 'custom', 'park', '60', '{}'::jsonb, false, false, false,
      false, true, true, true, true, 'enabled',
      NULL, now(), NULL, now(), false, 1, 'S2-B smoke data scope'
    );

    ${permissionGrants
      .map(
        (grant) => `
          INSERT INTO rel_role_perm (
            id, tenant_id, park_id, role_id, permission_id, create_by, create_time, update_by, update_time, is_deleted, version, remark
          )
          SELECT ${sqlLiteral(grant.id)}, ${sqlLiteral(tenantId)}, ${sqlLiteral(parkId)}, ${sqlLiteral(roleId)}, id, NULL, now(), NULL, now(), false, 1, 'S2-B smoke permission'
          FROM sys_permission
          WHERE tenant_id = ${sqlLiteral(tenantId)}
            AND park_id = ${sqlLiteral(parkId)}
            AND code = ${sqlLiteral(grant.code)}
            AND is_deleted = false
            AND is_enabled = true;
        `
      )
      .join("\n")}

    INSERT INTO sys_data_scope_rule (
      id, tenant_id, park_id, rule_code, rule_name, dimension, scope_type, scope_config, status,
      create_by, create_time, update_by, update_time, is_deleted, version, remark
    ) VALUES (
      ${sqlLiteral(dataScopeRuleId)}, ${sqlLiteral(tenantId)}, ${sqlLiteral(parkId)}, ${sqlLiteral(ruleCode)}, 'S2B楼栋数据范围',
      'building', 'custom', ${sqlLiteral(JSON.stringify({ buildingIds: [buildingId] }))}::jsonb, 'enabled',
      NULL, now(), NULL, now(), false, 1, 'S2-B smoke data scope'
    );

    INSERT INTO rel_role_data_scope (
      id, tenant_id, park_id, role_id, rule_id, create_by, create_time, update_by, update_time, is_deleted, version, remark
    ) VALUES (
      ${sqlLiteral(roleDataScopeId)}, ${sqlLiteral(tenantId)}, ${sqlLiteral(parkId)}, ${sqlLiteral(roleId)}, ${sqlLiteral(dataScopeRuleId)},
      NULL, now(), NULL, now(), false, 1, 'S2-B smoke data scope'
    );

    INSERT INTO sys_field_policy (
      id, tenant_id, park_id, module, entity, field_key, field_name, policy_type, mask_rule, status,
      create_by, create_time, update_by, update_time, is_deleted, version, remark
    ) VALUES (
      ${sqlLiteral(fieldPolicyId)}, ${sqlLiteral(tenantId)}, ${sqlLiteral(parkId)}, 'asset', 'unit', 'biz_unit.ref_price', '参考租金',
      'hidden', NULL, 'enabled', NULL, now(), NULL, now(), false, 1, ${sqlLiteral(policyRemark)}
    );

    INSERT INTO rel_role_field_policy (
      id, tenant_id, park_id, role_id, field_policy_id, create_by, create_time, update_by, update_time, is_deleted, version, remark
    ) VALUES (
      ${sqlLiteral(roleFieldPolicyId)}, ${sqlLiteral(tenantId)}, ${sqlLiteral(parkId)}, ${sqlLiteral(roleId)}, ${sqlLiteral(fieldPolicyId)},
      NULL, now(), NULL, now(), false, 1, 'S2-B smoke field policy'
    );

    INSERT INTO rel_user_role (
      id, tenant_id, park_id, user_id, role_id, create_by, create_time, update_by, update_time, is_deleted, version, remark
    ) VALUES (
      ${sqlLiteral(userRoleId)}, ${sqlLiteral(tenantId)}, ${sqlLiteral(parkId)}, ${sqlLiteral(userId)}, ${sqlLiteral(roleId)},
      NULL, now(), NULL, now(), false, 1, 'S2-B smoke user role'
    );
  `);

  const permissionCount = Number(
    await dbScalar(`
      SELECT count(*) FROM rel_role_perm rp
      JOIN sys_permission p ON p.id = rp.permission_id
      WHERE rp.role_id = ${sqlLiteral(roleId)}
        AND p.code IN (${permissionCodes.map(sqlLiteral).join(", ")})
        AND rp.is_deleted = false;
    `)
  );
  assert(permissionCount === permissionCodes.length, "scoped asset smoke role permissions were not created");

  return { username, userId, roleId, dataScopeRuleId, fieldPolicyId };
}

async function cleanupScopedAssetUser(context) {
  if (!context) return;
  await dbExec(`
    UPDATE rel_user_role SET is_deleted = true, update_time = now() WHERE user_id = ${sqlLiteral(context.userId)};
    UPDATE rel_role_perm SET is_deleted = true, update_time = now() WHERE role_id = ${sqlLiteral(context.roleId)};
    UPDATE rel_role_data_scope SET is_deleted = true, update_time = now() WHERE role_id = ${sqlLiteral(context.roleId)};
    UPDATE rel_role_field_policy SET is_deleted = true, update_time = now() WHERE role_id = ${sqlLiteral(context.roleId)};
    UPDATE sys_data_scope_rule SET is_deleted = true, update_time = now() WHERE id = ${sqlLiteral(context.dataScopeRuleId)};
    UPDATE sys_field_policy SET is_deleted = true, update_time = now() WHERE id = ${sqlLiteral(context.fieldPolicyId)};
    UPDATE sys_role SET is_deleted = true, update_time = now() WHERE id = ${sqlLiteral(context.roleId)};
    UPDATE sys_user SET is_deleted = true, update_time = now() WHERE id = ${sqlLiteral(context.userId)};
  `);
}

async function createUserForSeedRole(roleCode) {
  const userId = randomUUID();
  const userRoleId = randomUUID();
  const username = `s2b_${roleCode.toLowerCase()}_${stamp}`;
  await dbExec(`
    WITH normal_password AS (
      SELECT password_hash FROM sys_user
      WHERE tenant_id = ${sqlLiteral(tenantId)}
        AND park_id = ${sqlLiteral(parkId)}
        AND username = ${sqlLiteral(normalUser)}
        AND is_deleted = false
      LIMIT 1
    ),
    target_role AS (
      SELECT id FROM sys_role
      WHERE tenant_id = ${sqlLiteral(tenantId)}
        AND park_id = ${sqlLiteral(parkId)}
        AND code = ${sqlLiteral(roleCode)}
        AND is_deleted = false
      LIMIT 1
    ),
    inserted_user AS (
      INSERT INTO sys_user (
        id, tenant_id, park_id, username, display_name, password_hash, mobile, email,
        is_enabled, status, create_by, create_time, update_by, update_time, is_deleted, version, remark
      )
      SELECT
        ${sqlLiteral(userId)}, ${sqlLiteral(tenantId)}, ${sqlLiteral(parkId)}, ${sqlLiteral(username)}, ${sqlLiteral(`S2B ${roleCode}`)}, normal_password.password_hash, NULL, NULL,
        true, 'enabled', NULL, now(), NULL, now(), false, 1, 'S2-B smoke seed role user'
      FROM normal_password
      RETURNING id
    )
    INSERT INTO rel_user_role (
      id, tenant_id, park_id, user_id, role_id, create_by, create_time, update_by, update_time, is_deleted, version, remark
    )
    SELECT
      ${sqlLiteral(userRoleId)}, ${sqlLiteral(tenantId)}, ${sqlLiteral(parkId)}, inserted_user.id, target_role.id,
      NULL, now(), NULL, now(), false, 1, 'S2-B smoke seed role binding'
    FROM inserted_user
    CROSS JOIN target_role;
  `);
  const roleCount = Number(
    await dbScalar(`
      SELECT count(*)
      FROM rel_user_role link
      JOIN sys_role role ON role.id = link.role_id
      WHERE link.user_id = ${sqlLiteral(userId)}
        AND role.code = ${sqlLiteral(roleCode)}
        AND link.is_deleted = false;
    `)
  );
  assert(roleCount === 1, `${roleCode} seed role user was not created`);
  return { userId, username };
}

async function cleanupSeedRoleUser(context) {
  if (!context) return;
  await dbExec(`
    UPDATE rel_user_role SET is_deleted = true, update_time = now() WHERE user_id = ${sqlLiteral(context.userId)};
    UPDATE sys_user SET is_deleted = true, update_time = now() WHERE id = ${sqlLiteral(context.userId)};
  `);
}

function flattenMenuHrefs(nodes = []) {
  return nodes.flatMap((node) => [node.href, ...flattenMenuHrefs(node.children ?? [])]).filter(Boolean);
}

async function validateSeedRoleMenusAndPermissions(adminToken) {
  const adminMe = await request("/users/me", { headers: { authorization: `Bearer ${adminToken}` } });
  assertStatus("admin users/me for asset menus", adminMe.response.status, 200);
  assertUniformResponse("admin users/me for asset menus", adminMe.body);
  const adminHrefs = new Set(flattenMenuHrefs(adminMe.body.data?.menu_tree ?? adminMe.body.data?.menus ?? []));
  for (const href of ["/assets/parks", "/assets/buildings", "/assets/floors", "/assets/units", "/assets/unit-status-board", "/assets/statistics"]) {
    assert(adminHrefs.has(href), `super admin asset menu missing ${href}`);
  }

  const roleChecks = [
    {
      roleCode: "EXECUTIVE",
      expectedPermissions: ["asset:read", "asset:statistics", "asset:status_board", "unit:read", "unit:status_log"],
      forbiddenPermissions: ["unit:create", "unit:import", "unit:export"],
      expectedMenus: ["/assets/unit-status-board", "/assets/statistics"]
    },
    {
      roleCode: "OPERATIONS_OWNER",
      expectedPermissions: ["unit:change_status", "unit:force_change_status", "unit:import", "unit:import_template", "unit:export", "asset:statistics", "asset:status_board"],
      forbiddenPermissions: [],
      expectedMenus: ["/assets/parks", "/assets/buildings", "/assets/floors", "/assets/units", "/assets/unit-status-board", "/assets/statistics"]
    },
    {
      roleCode: "INVEST_SPECIALIST",
      expectedPermissions: ["unit:read", "asset:status_board"],
      forbiddenPermissions: ["unit:import", "unit:import_template", "unit:export"],
      expectedMenus: ["/assets/unit-status-board"]
    }
  ];

  for (const check of roleChecks) {
    const context = await createUserForSeedRole(check.roleCode);
    try {
      const roleLogin = await login(context.username, normalPassword);
      assertStatus(`${check.roleCode} login`, roleLogin.response.status, 200);
      const roleToken = roleLogin.body?.data?.accessToken;
      assert(roleToken, `${check.roleCode} login did not return accessToken`);
      const me = await request("/users/me", { headers: { authorization: `Bearer ${roleToken}` } });
      assertStatus(`${check.roleCode} users/me`, me.response.status, 200);
      assertUniformResponse(`${check.roleCode} users/me`, me.body);
      const permissions = new Set(me.body.data?.permissions ?? []);
      for (const permission of check.expectedPermissions) {
        assert(permissions.has(permission), `${check.roleCode} missing permission ${permission}`);
      }
      for (const permission of check.forbiddenPermissions) {
        assert(!permissions.has(permission), `${check.roleCode} unexpectedly has permission ${permission}`);
      }
      const hrefs = new Set(flattenMenuHrefs(me.body.data?.menu_tree ?? me.body.data?.menus ?? []));
      for (const href of check.expectedMenus) {
        assert(hrefs.has(href), `${check.roleCode} asset menu missing ${href}`);
      }
    } finally {
      await cleanupSeedRoleUser(context);
    }
  }
  logStep("seed role permissions and asset menus verified");
}

async function run() {
  await ensureApiStarted();

  const adminLogin = await login(adminUser, adminPassword);
  assertStatus("admin login", adminLogin.response.status, 200);
  assertUniformResponse("admin login", adminLogin.body);
  const adminToken = adminLogin.body?.data?.accessToken;
  assert(adminToken, "admin login did not return accessToken");

  const normalLogin = await login(normalUser, normalPassword);
  assertStatus("normal login", normalLogin.response.status, 200);
  const normalToken = normalLogin.body?.data?.accessToken;
  assert(normalToken, "normal login did not return accessToken");

  await validateSeedRoleMenusAndPermissions(adminToken);

  const { building, floor, mismatchFloor } = await getFirstBuildingAndFloors(adminToken);
  const unit = await createUnit(adminToken, building.id, floor.id, 10);

  const lockStatus = await jsonRequest(`/park-units/${unit.id}/change-status`, adminToken, "POST", {
    after_status: 20,
    reason: "S2-B 自测锁定",
    lock_reason: "自测客户临时锁定",
    lock_expire_time: "2026-06-01T18:00:00+08:00"
  });
  assertStatus("admin change status 10 -> 20", lockStatus.response.status, 201);
  assertUniformResponse("admin change status 10 -> 20", lockStatus.body);
  assert(lockStatus.body.data.before_status === 10 && lockStatus.body.data.after_status === 20, "unexpected 10 -> 20 status payload");

  const lockedDetail = await request(`/park-units/${unit.id}`, { headers: { authorization: `Bearer ${adminToken}` } });
  assertStatus("unit detail after lock", lockedDetail.response.status, 200);
  assert(lockedDetail.body?.data?.rentalStatus === 20, "biz_unit.rental_status was not updated to 20");

  const statusLogCount = Number(
    await dbScalar(`SELECT count(*) FROM biz_unit_status_log WHERE unit_id = ${sqlLiteral(unit.id)} AND before_status = 10 AND after_status = 20 AND is_deleted = false;`)
  );
  assert(statusLogCount >= 1, "biz_unit_status_log did not record status change");
  logStep(`status log count for 10 -> 20: ${statusLogCount}`);

  const opLogCount = Number(
    await dbScalar(`SELECT count(*) FROM sys_op_log WHERE biz_id = ${sqlLiteral(unit.id)} AND action = '状态流转' AND is_deleted = false;`)
  );
  assert(opLogCount >= 1, "sys_op_log did not record status change");
  logStep(`operation log count for status change: ${opLogCount}`);

  const normalChange = await jsonRequest(`/park-units/${unit.id}/change-status`, normalToken, "POST", {
    after_status: 10,
    reason: "普通用户尝试释放"
  });
  assertStatus("normal change status denied", normalChange.response.status, 403);

  const rentStatus = await jsonRequest(`/park-units/${unit.id}/change-status`, adminToken, "POST", {
    after_status: 30,
    reason: "S2-B 自测转已出租"
  });
  assertStatus("admin change status 20 -> 30", rentStatus.response.status, 201);

  const normalRentedToRentable = await jsonRequest(`/park-units/${unit.id}/change-status`, normalToken, "POST", {
    after_status: 10,
    reason: "普通用户尝试已出租转可招商"
  });
  assertStatus("normal 30 -> 10 denied", normalRentedToRentable.response.status, 403);

  const missingReason = await jsonRequest(`/park-units/${unit.id}/change-status`, adminToken, "POST", {
    after_status: 10,
    reason: ""
  });
  assertStatus("force change without reason denied", missingReason.response.status, 400);

  const forceRelease = await jsonRequest(`/park-units/${unit.id}/change-status`, adminToken, "POST", {
    after_status: 10,
    reason: "S2-B 超管强制释放自测"
  });
  assertStatus("admin force change 30 -> 10", forceRelease.response.status, 201);

  const logs = await request(`/park-units/${unit.id}/status-logs?page=1&page_size=10`, {
    headers: { authorization: `Bearer ${adminToken}` }
  });
  assertStatus("unit status logs", logs.response.status, 200);
  assert((logs.body?.data?.items?.length ?? 0) >= 3, "status logs did not return expected records");

  const template = await request("/park-units/import-template", { headers: { authorization: `Bearer ${adminToken}` } });
  assertStatus("download unit import template", template.response.status, 200);
  assert(template.body instanceof ArrayBuffer && template.body.byteLength > 0, "import template is empty");

  const importSuffix = String(1000 + Math.floor(Math.random() * 9000));
  const importCode = `JH-B01-F01-R${importSuffix}`;
  const importBuffer = makeImportWorkbook([
    ["", importCode, "JH-B01", "JH-B01-F01", `导入房源${importSuffix}`, "10", 66, 60, "10", "20", 33, "2026-07-01", "合法导入"],
    ["", "JH-B01-F01-R0101", "JH-B01", "JH-B01-F01", "重复房源", "10", 80, 70, "10", "20", 30, "2026-07-01", "重复编码"],
    ["", `JH-B01-F01-R${String(Number(importSuffix) + 1).padStart(4, "0").slice(-4)}`, "JH-B01", "JH-B02-F01", "楼层不匹配", "10", 80, 70, "10", "20", 30, "2026-07-01", "楼栋楼层不匹配"]
  ]);
  const normalImport = await importWorkbook(normalToken, importBuffer);
  assertStatus("normal import denied", normalImport.response.status, 403);

  const importResult = await importWorkbook(adminToken, importBuffer);
  assertStatus("unit import mixed rows", importResult.response.status, 201);
  assertUniformResponse("unit import mixed rows", importResult.body);
  assert(importResult.body.data.success_count === 1, "unit import did not import exactly one valid row");
  assert(importResult.body.data.fail_count === 2, "unit import did not return two failed rows");
  assert(
    importResult.body.data.rows.some((row) => row.unit_code === "JH-B01-F01-R0101" && row.success === false && row.errors.length > 0),
    "duplicate unit_code row-level error missing"
  );
  assert(
    importResult.body.data.rows.some((row) => row.success === false && row.errors.some((error) => error.includes("楼层") || error.includes("building"))),
    "building/floor mismatch row-level error missing"
  );

  const exportResult = await jsonRequest("/park-units/export", adminToken, "POST", { building_id: building.id });
  assertStatus("export units by building", exportResult.response.status, 201);
  assert(exportResult.body instanceof ArrayBuffer && exportResult.body.byteLength > 0, "unit export file is empty");
  assertExcelColumnEquals("export units by building", exportResult.body, "楼栋编码", building.buildingCode);

  const exportByStatus = await jsonRequest("/park-units/export", adminToken, "POST", { rental_status: 10 });
  assertStatus("export units by rental status", exportByStatus.response.status, 201);
  assertExcelColumnEquals("export units by rental status", exportByStatus.body, "出租状态", "可招商");

  const exportLogCount = Number(
    await dbScalar("SELECT count(*) FROM sys_op_log WHERE action = '数据导出' AND path LIKE '%/park-units/export%' AND is_deleted = false;")
  );
  assert(exportLogCount >= 1, "sys_op_log did not record unit export");
  logStep(`operation log count for export: ${exportLogCount}`);

  const normalExport = await jsonRequest("/park-units/export", normalToken, "POST", { building_id: building.id });
  assertStatus("normal export denied", normalExport.response.status, 403);

  const scopedContext = await createScopedAssetUser(building.id);
  try {
    const scopedLogin = await login(scopedContext.username, normalPassword);
    assertStatus("scoped asset user login", scopedLogin.response.status, 200);
    const scopedToken = scopedLogin.body?.data?.accessToken;
    assert(scopedToken, "scoped asset user login did not return accessToken");

    const scopedUnits = await request(`/park-units?building_id=${building.id}&page=1&page_size=20`, {
      headers: { authorization: `Bearer ${scopedToken}` }
    });
    assertStatus("scoped user list allowed building units", scopedUnits.response.status, 200);
    assertUniformResponse("scoped user list allowed building units", scopedUnits.body);
    assert(dataItems(scopedUnits.body).length > 0, "scoped user did not see allowed building units");
    assert(dataItems(scopedUnits.body).every((item) => item.buildingId === building.id), "scoped user list leaked another building");
    assert(
      dataItems(scopedUnits.body).every((item) => !Object.hasOwn(item, "refPrice") || item.refPrice === null),
      "hidden ref_price field leaked in unit list"
    );

    const scopedDeniedBuilding = await request(`/park-units?building_id=${mismatchFloor.buildingId}&page=1&page_size=20`, {
      headers: { authorization: `Bearer ${scopedToken}` }
    });
    assertStatus("scoped user list denied building units", scopedDeniedBuilding.response.status, 200);
    assertUniformResponse("scoped user list denied building units", scopedDeniedBuilding.body);
    assert(dataItems(scopedDeniedBuilding.body).length === 0, "building data scope restriction leaked denied building units");

    const scopedExport = await jsonRequest("/park-units/export", scopedToken, "POST", { building_id: building.id });
    assertStatus("scoped export hidden ref price", scopedExport.response.status, 201);
    assert(scopedExport.body instanceof ArrayBuffer && scopedExport.body.byteLength > 0, "scoped unit export file is empty");
    assertExcelColumnBlank("scoped export hidden ref price", scopedExport.body, "参考租金");
  } finally {
    await cleanupScopedAssetUser(scopedContext);
  }

  const stats = await request(`/assets/statistics?building_id=${building.id}`, { headers: { authorization: `Bearer ${adminToken}` } });
  assertStatus("asset statistics", stats.response.status, 200);
  assertUniformResponse("asset statistics", stats.body);
  assert(stats.body?.data?.summary, "asset statistics summary missing");
  assert(Array.isArray(stats.body?.data?.by_building), "asset statistics by_building missing");
  assert(stats.body.data.by_building.every((item) => item.building_id === building.id), "asset statistics building filter leaked other buildings");
  const expectedStats = (
    await dbScalar(`
      SELECT concat_ws('|',
        count(*)::text,
        coalesce(sum(unit_area), 0)::float::text,
        coalesce(sum(unit_area) FILTER (WHERE rental_status = 30), 0)::float::text,
        coalesce(sum(unit_area) FILTER (WHERE rental_status = 10), 0)::float::text
      )
      FROM biz_unit
      WHERE tenant_id = ${sqlLiteral(tenantId)}
        AND park_id = ${sqlLiteral(parkId)}
        AND building_id = ${sqlLiteral(building.id)}
        AND status = 1
        AND is_deleted = false;
    `)
  ).split("|").map(Number);
  const [expectedUnits, expectedTotalArea, expectedRentedArea, expectedRentableArea] = expectedStats;
  assertClose("asset statistics total_units", stats.body.data.summary.total_units, expectedUnits, 0);
  assertClose("asset statistics total_area", stats.body.data.summary.total_area, expectedTotalArea);
  assertClose("asset statistics rented_area", stats.body.data.summary.rented_area, expectedRentedArea);
  assertClose("asset statistics rentable_area", stats.body.data.summary.rentable_area, expectedRentableArea);
  assertClose("asset statistics occupancy_rate", stats.body.data.summary.occupancy_rate, expectedTotalArea === 0 ? 0 : expectedRentedArea / expectedTotalArea);
  assertClose("asset statistics vacancy_rate", stats.body.data.summary.vacancy_rate, expectedTotalArea === 0 ? 0 : expectedRentableArea / expectedTotalArea);

  const normalStats = await request(`/assets/statistics?building_id=${building.id}`, { headers: { authorization: `Bearer ${normalToken}` } });
  assertStatus("normal asset statistics denied", normalStats.response.status, 403);

  const board = await request(`/assets/unit-status-board?building_id=${building.id}`, { headers: { authorization: `Bearer ${adminToken}` } });
  assertStatus("unit status board", board.response.status, 200);
  assertUniformResponse("unit status board", board.body);
  assert(Array.isArray(board.body?.data?.buildings), "unit status board buildings missing");
  assert(board.body.data.buildings.some((item) => Array.isArray(item.floors)), "unit status board floor tree missing");
  assert(board.body.data.buildings.every((item) => item.building_id === building.id), "unit status board building filter leaked other buildings");
  const boardUnits = board.body.data.buildings.flatMap((item) => item.floors.flatMap((floor) => floor.units));
  assert(boardUnits.length > 0, "unit status board units missing");
  assert(boardUnits.every((item) => item.code && item.unit_code && item.rental_status_name && item.usage_type_name), "unit status board unit fields missing");
  assert(boardUnits.every((item) => "current_tenant_name" in item), "unit status board unit must expose current_tenant_name field");
  assert(boardUnits.filter((item) => item.rental_status === 30).every((item) => item.current_tenant_name !== undefined), "rented units must have current_tenant_name");

  const boardByStatus = await request(`/assets/unit-status-board?rental_status=10`, { headers: { authorization: `Bearer ${adminToken}` } });
  assertStatus("unit status board by rental status", boardByStatus.response.status, 200);
  assertUniformResponse("unit status board by rental status", boardByStatus.body);
  const boardByStatusUnits = boardByStatus.body.data.buildings.flatMap((item) => item.floors.flatMap((floor) => floor.units));
  assert(boardByStatusUnits.every((item) => item.rental_status === 10), "unit status board rental status filter leaked other statuses");

  const normalBoard = await request(`/assets/unit-status-board?building_id=${building.id}`, { headers: { authorization: `Bearer ${normalToken}` } });
  assertStatus("normal unit status board denied", normalBoard.response.status, 403);

  const mismatchCreate = await jsonRequest("/park-units", adminToken, "POST", {
    unitCode: `JH-B01-F01-R${String(1000 + Math.floor(Math.random() * 9000))}`,
    buildingId: building.id,
    floorId: mismatchFloor.id,
    unitName: "S2B楼层不匹配自测",
    usageType: 10,
    unitArea: 88,
    useArea: 76,
    rentalStatus: 10,
    fittingStatus: 20,
    refPrice: 35
  });
  assertStatus("building/floor mismatch create denied", mismatchCreate.response.status, 400);

  logStep("S2-B smoke test passed");
}

try {
  await run();
} finally {
  if (apiProcess?.pid) {
    try {
      process.kill(-apiProcess.pid);
    } catch {
      // The process may already have exited.
    }
  }
}
