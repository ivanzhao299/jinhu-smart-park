import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export function sanitizeYuzhouRealHttpLabFailure(error, step) {
  try {
    const name = error?.constructor?.name, code = error?.code;
    return { step, errorType: ["Error", "TypeError", "RangeError", "SyntaxError"].includes(name) ? name : "Error",
      code: typeof code === "string" && code.length <= 96 && /^HR_HTTP_[A-Z_]+$/u.test(code) ? code : null,
      sqlState: typeof code === "string" && /^[0-9A-Z]{5}$/u.test(code) ? code : null };
  } catch { return { step, errorType: "Error", code: null, sqlState: null }; }
}

/** IDs must already be registered. Cleanup intent precedes even BEGIN: a lost
 * COMMIT acknowledgement cannot tell us whether the fixtures became durable. */
export async function runYuzhouHttpFixtureTransaction({ pool, write, requireCleanup }) {
  requireCleanup();
  try { await pool.query("BEGIN"); await write(); await pool.query("COMMIT"); }
  catch (error) { try { await pool.query("ROLLBACK"); } catch { /* finally cleanup still owns registered IDs */ } throw error; }
}

/** Kept injectable so shutdown failures cannot silently strand technical users. */
export async function cleanupYuzhouRealHttpLab({ app, pool, fixturesCommitted, userIds, roleId, tenantId, parkId }) {
  let shutdownFailed = false, cleanupFailed = false;
  try { if (app) await app.close(); } catch { shutdownFailed = true; }
  if (fixturesCommitted) {
    try {
      await pool.query("BEGIN");
      await pool.query("DELETE FROM sys_auth_refresh_token WHERE user_id=ANY($1::uuid[]) AND tenant_id=$2 AND park_id=$3", [userIds, tenantId, parkId]);
      await pool.query("DELETE FROM rel_role_perm WHERE role_id=$1 AND tenant_id=$2 AND park_id=$3", [roleId, tenantId, parkId]);
      await pool.query("DELETE FROM rel_user_role WHERE user_id=ANY($1::uuid[]) AND tenant_id=$2 AND park_id=$3", [userIds, tenantId, parkId]);
      await pool.query("DELETE FROM sys_role WHERE id=$1 AND tenant_id=$2 AND park_id=$3", [roleId, tenantId, parkId]);
      await pool.query("DELETE FROM sys_user WHERE id=ANY($1::uuid[]) AND tenant_id=$2 AND park_id=$3", [userIds, tenantId, parkId]);
      await pool.query("COMMIT");
      const residual = await pool.query(`SELECT
        (SELECT count(*) FROM sys_user WHERE id=ANY($1::uuid[])) +
        (SELECT count(*) FROM sys_role WHERE id=$2) +
        (SELECT count(*) FROM rel_user_role WHERE user_id=ANY($1::uuid[])) +
        (SELECT count(*) FROM rel_role_perm WHERE role_id=$2) +
        (SELECT count(*) FROM sys_auth_refresh_token WHERE user_id=ANY($1::uuid[])) AS n`, [userIds, roleId]);
      if (Number(residual.rows[0].n) !== 0) throw new Error("RESIDUAL");
    } catch {
      cleanupFailed = true;
      try { await pool.query("ROLLBACK"); } catch { /* Preserve cleanup failure without raw diagnostics. */ }
    }
  }
  return { shutdownFailed, cleanupFailed };
}

// Run only in a dedicated orchestration process: Nest reads configuration during
// module import. This deliberately does not load any worktree .env file.
// Credentials remain in memory; the caller owns a private run registry.
export async function withYuzhouRealHttpLab({ repositoryRoot, container, database, scope, register, verify }) {
  const req = createRequire(resolve(repositoryRoot, "apps/api/package.json"));
  if (!/^jinhu_hr_migration_lab_[a-z0-9_]+$/u.test(database) ||
      !/^[a-zA-Z0-9_.-]+$/u.test(container) ||
      !scope || [scope.tenantId, scope.parkId].some(x => typeof x !== "string" || !x.length) ||
      typeof register !== "function" || typeof verify !== "function") throw new Error("HR_HTTP_LAB_INPUT_INVALID");
  const descriptor = JSON.parse(execFileSync("docker", ["inspect", container], { encoding: "utf8" }))[0];
  const ports = descriptor.NetworkSettings.Ports["5432/tcp"];
  if (descriptor.Config.Labels["com.docker.compose.project"] !== "jinhu_hr_migration_lab" ||
      ports?.length !== 1 || ports[0].HostIp !== "127.0.0.1") throw new Error("HR_HTTP_LAB_TARGET_INVALID");
  const password = descriptor.Config.Env.find(x => x.startsWith("POSTGRES_PASSWORD="))?.slice(18);
  if (!password) throw new Error("HR_HTTP_LAB_CONNECTION_UNAVAILABLE");
  const { Pool } = req("pg");
  const pool = new Pool({ host: "127.0.0.1", port: Number(ports[0].HostPort), database,
    user: "jinhu", password, max: 1, statement_timeout: 15000 });
  const userIds = [randomUUID(), randomUUID()], roleId = randomUUID();
  const { tenantId, parkId } = scope;
  let app, appInitialized = false, fixturesCommitted = false, verification, failure, scratch;
  let step = "target";
  const previousDirectory = process.cwd(), previousEnvironment = process.env;
  try {
    if ((await pool.query("SELECT current_database() AS db")).rows[0].db !== database) throw new Error("TARGET");
    const active = await pool.query(`SELECT count(*)::int n FROM biz_park p JOIN sys_tenant t
      ON t.tenant_id=p.tenant_id WHERE p.tenant_id=$1 AND p.park_id=$2
      AND p.status=1 AND NOT p.is_deleted AND t.status=1 AND NOT t.is_deleted`, [tenantId, parkId]);
    if (active.rows[0].n !== 1) throw new Error("SCOPE");
    await register({ database, tenantId, parkId, createdUserIds: userIds, createdRoleId: roleId });
    step = "permissions";
    const codes = ["hr:employee:read", "hr:contract:read", "hr:attendance:read", "hr:insurance:read"];
    const permissions = (await pool.query(`SELECT id,code FROM sys_permission WHERE tenant_id=$1
      AND is_enabled AND NOT is_deleted AND status='enabled' AND code=ANY($2::text[])`, [tenantId, codes])).rows;
    if (permissions.length !== codes.length || new Set(permissions.map(p => p.code)).size !== codes.length) throw new Error("PERMISSIONS");
    const credentials = userIds.map((id, i) => ({ username: `lab_http_${i}_${id.slice(0, 8)}`, password: randomBytes(24).toString("hex") }));
    step = "password_hash";
    const hashes = await Promise.all(credentials.map(c => req("bcrypt").hash(c.password, 10)));
    step = "fixtures";
    await runYuzhouHttpFixtureTransaction({ pool, requireCleanup: () => { fixturesCommitted = true; }, write: async () => {
      for (let i = 0; i < userIds.length; i++) await pool.query(`INSERT INTO sys_user
        (id,tenant_id,park_id,username,display_name,password_hash) VALUES($1,$2,$3,$4,$5,$6)`,
      [userIds[i], tenantId, parkId, credentials[i].username, "Isolated HTTP technical actor", hashes[i]]);
      await pool.query(`INSERT INTO sys_role(id,tenant_id,park_id,code,name,data_scope,is_super)
        VALUES($1,$2,$3,$4,'Isolated HR read role','40',false)`, [roleId, tenantId, parkId, `lab_http_${roleId.slice(0, 8)}`]);
      await pool.query("INSERT INTO rel_user_role(tenant_id,park_id,user_id,role_id) VALUES($1,$2,$3,$4)", [tenantId, parkId, userIds[0], roleId]);
      for (const permission of permissions) await pool.query("INSERT INTO rel_role_perm(tenant_id,park_id,role_id,permission_id) VALUES($1,$2,$3,$4)", [tenantId, parkId, roleId, permission.id]);
    } });
    scratch = mkdtempSync(join(tmpdir(), "hr-http-lab-"));
    mkdirSync(join(scratch, "isolated/runtime"), { recursive: true, mode: 0o700 });
    process.chdir(join(scratch, "isolated/runtime"));
    process.env = { PATH: previousEnvironment.PATH, NODE_ENV: "test", POSTGRES_HOST: "127.0.0.1",
      POSTGRES_PORT: ports[0].HostPort, POSTGRES_DB: database, POSTGRES_USER: "jinhu", POSTGRES_PASSWORD: password,
      JWT_SECRET: randomBytes(48).toString("hex"), PARTY_DATA_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
      VIDEO_ALERT_SCHEDULER_ENABLED: "false", SAFETY_INSPECT_SCHEDULER_ENABLED: "false",
      PROPERTY_TASK_RECONCILIATION_ENABLED: "false", PROPERTY_APPROVAL_RUNTIME_ENABLED: "false",
      IDEMPOTENCY_CLEANUP_ENABLED: "false", MQTT_BROKER_URL: "", AUTH_SMS_ENABLED: "false", AUTH_WECHAT_ENABLED: "false" };
    req("ts-node").register({ project: resolve(repositoryRoot, "apps/api/tsconfig.json"), transpileOnly: true });
    req("reflect-metadata");
    step = "app";
    const { AppModule } = req(resolve(repositoryRoot, "apps/api/src/app.module.ts"));
    const { NestFactory } = req("@nestjs/core"), { ValidationPipe } = req("@nestjs/common");
    app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    appInitialized = true;
    // These unrelated timers have a 60-second first tick. Stop their normal
    // lifecycle immediately after initialization; no auth/HR provider overrides.
    for (const [file, type] of [["iot-rule.scheduler", "IotRuleScheduler"], ["iot-status.scheduler", "IotStatusScheduler"]]) {
      app.get(req(resolve(repositoryRoot, `apps/api/src/modules/iot/${file}.ts`))[type]).onApplicationShutdown();
    }
    await app.listen(0, "127.0.0.1");
    step = "verify";
    verification = await verify({ baseUrl: `${await app.getUrl()}/api/v1`, scope: { tenantId, parkId },
      authorizedCredentials: credentials[0], deniedCredentials: credentials[1] });
    step = "login_audit";
    const audit = await pool.query("SELECT count(*)::int n FROM sys_login_log WHERE user_id=ANY($1::uuid[]) AND success=true", [userIds]);
    if (audit.rows[0].n !== 2) throw new Error("LOGIN_AUDIT");
  } catch (error) {
    failure = sanitizeYuzhouRealHttpLabFailure(error, step);
  } finally {
    try {
      const cleanup = await cleanupYuzhouRealHttpLab({ app, pool, fixturesCommitted, userIds, roleId, tenantId, parkId });
      if (cleanup.shutdownFailed || cleanup.cleanupFailed) failure = { ...failure, ...cleanup };
    } catch { failure = { ...failure, cleanupFailed: true }; }
    finally {
      try { await pool.end(); } catch { failure = { ...failure, shutdownFailed: true }; }
      finally { process.chdir(previousDirectory); process.env = previousEnvironment; }
    }
  }
  return { status: failure ? "FAILED" : "PASS", failure: failure ?? null,
    fixtureCleanup: failure?.cleanupFailed ? "FAILED" : "PASS", fullAppModule: appInitialized,
    // Nest/providers can create diagnostic files here. Preserve the exact
    // generated directory rather than recursively delete unknown contents.
    scratchPreserved: Boolean(scratch), verification: verification ?? null, productionImport: "HOLD" };
}
