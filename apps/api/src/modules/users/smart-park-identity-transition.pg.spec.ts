import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { DataSource } from "typeorm";

const databaseUrl = process.env.BUSINESS_SCOPE_TEST_DATABASE_URL;
const id = (n: number) => `90000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const component = "database/components/business-scope/000003_smart_park_identity_transition.sql";

async function rejectCode(action: () => Promise<unknown>, code: string, message?: string) {
  await assert.rejects(action, (error: unknown) => typeof error === "object" && error !== null
    && (error as { code?: string }).code === code
    && (message === undefined || (error as { message?: string }).message === message));
}

test("identity transition preserves real migration constraints, grants and historical sessions", { skip: !databaseUrl }, async () => {
  assert.ok(databaseUrl);
  const connection = new URL(databaseUrl);
  assert.equal(connection.hostname, "127.0.0.1");
  assert.equal(connection.pathname, "/postgres");
  const source = await new DataSource({ type: "postgres", url: databaseUrl, entities: [] }).initialize();
  const db = source.createQueryRunner();
  await db.connect();
  const apply = async (file: string) => db.query(await readFile(path.resolve(process.cwd(), "../..", file), "utf8"));
  const one = async (sql: string, parameters: unknown[] = []) => (await db.query(sql, parameters))[0];
  const backfill = async (tenant = "alpha") => (await one(
    "SELECT public.backfill_smart_park_identity_scopes($1) AS receipt", [tenant]
  )).receipt;
  const addUser = (n: number, park = "park-a", username = `synthetic-${n}`, tenant = "alpha") => db.query(
    `INSERT INTO sys_user(id,tenant_id,park_id,username,display_name,password_hash)
     VALUES ($1,$2,$3,$4,'Synthetic fixture','non-login-fixture-hash')`, [id(n), tenant, park, username]
  );
  const addToken = (n: number, user: number, park = "park-a") => db.query(
    `INSERT INTO sys_auth_refresh_token(id,tenant_id,park_id,user_id,token_hash,expires_at)
     VALUES ($1,'alpha',$2,$3,$4,now()+interval '1 day')`, [id(n), park, id(user), `synthetic-hash-${n}`]
  );
  const altered = async (mutate: () => Promise<unknown>, check: () => Promise<unknown>) => {
    await db.query("BEGIN");
    try { await mutate(); await check(); } finally { await db.query("ROLLBACK"); }
  };
  try {
    // Minimal tenant support; all seven identity/RBAC/Auth tables use the actual migration SQL.
    await db.query(`CREATE TABLE sys_tenant(id uuid PRIMARY KEY,tenant_id varchar(64) NOT NULL,
      park_id varchar(64),tenant_code varchar(64),tenant_name varchar(100),tenant_type varchar(32),
      plan_code varchar(32),status integer NOT NULL DEFAULT 1,expire_time timestamptz,
      is_deleted boolean NOT NULL DEFAULT false,update_time timestamptz NOT NULL DEFAULT now());
      CREATE UNIQUE INDEX synthetic_tenant_active ON sys_tenant(tenant_id) WHERE is_deleted=false;`);
    for (const file of [
      "000001_init_auth.sql", "000002_s1_system_foundation.sql", "000008_s2_biz_park.sql",
      "000013_rbac_saas_hardening.sql", "000014_sys_role_saas_contract.sql",
      "000015_sys_permission_tree_contract.sql", "000023_sys_role_open_rbac_contract.sql",
      "000024_sys_permission_open_model_contract.sql", "000029_saas_scope_id_unification.sql",
      "000068_yudao_system_rbac_baseline.sql", "000100_s1_auth_center_foundation.sql"
    ]) await apply(`database/migrations/${file}`);
    await apply("database/components/business-scope/000001_core.sql");
    await apply("database/components/business-scope/000002_smart_park_binding.sql");
    await db.query("INSERT INTO sys_tenant(id,tenant_id) VALUES ($1,'alpha'),($2,'beta')", [id(1), id(2)]);
    await db.query(`INSERT INTO biz_park(tenant_id,park_id,park_code,park_name)
      VALUES ('alpha','park-a','a','Synthetic A'),('alpha','park-b','b','Synthetic B'),
             ('beta','park-c','c','Synthetic C')`);
    await db.query("SELECT backfill_smart_park_business_scopes('alpha')");
    const scopeA = (await one("SELECT scope_id FROM sys_business_scope_park_binding WHERE park_id='park-a'")).scope_id;
    const scopeB = (await one("SELECT scope_id FROM sys_business_scope_park_binding WHERE park_id='park-b'")).scope_id;
    await addUser(10);
    await addUser(11, "park-b");
    await addUser(12, "park-c", "synthetic-beta", "beta");
    await db.query("UPDATE sys_user SET is_deleted=true,is_enabled=false WHERE id=$1", [id(11)]);
    await db.query(`INSERT INTO sys_role(id,tenant_id,park_id,code,name,role_scope,is_super,is_system,is_builtin)
      VALUES ($1,'alpha','park-a','PARK_ROLE','Synthetic park','park',false,false,false),
             ($2,'alpha','park-a','TENANT_ROLE','Synthetic tenant','tenant',false,false,false),
             ($3,'alpha','park-a','SUPER_ADMIN','Synthetic super','platform',true,true,true),
             ($4,'beta','park-c','FOREIGN_ROLE','Synthetic foreign','park',false,false,false)`, [id(20), id(21), id(22), id(23)]);
    await db.query(`INSERT INTO sys_role(id,tenant_id,park_id,code,name,role_scope,is_deleted)
      VALUES ($1,'alpha','park-b','HISTORIC_ROLE','Synthetic historic','park',true)`, [id(24)]);
    await db.query(`INSERT INTO sys_permission(id,tenant_id,park_id,code,name,resource,action)
      VALUES ($1,'alpha','park-a','hr:synthetic:read','Synthetic read','hr','read'),
             ($2,'beta','park-c','hr:synthetic:read','Synthetic read','hr','read')`, [id(30), id(31)]);
    await db.query(`INSERT INTO rel_user_role(id,tenant_id,park_id,user_id,role_id)
      VALUES ($1,'alpha','park-a',$4,$5),($2,'alpha','park-b',$4,$6),($3,'alpha','park-a',$4,$7)`,
    [id(40), id(41), id(42), id(10), id(20), id(21), id(22)]);
    await db.query(`INSERT INTO rel_user_role(id,tenant_id,park_id,user_id,role_id,is_deleted)
      VALUES ($1,'alpha','park-b',$2,$3,true)`, [id(43), id(11), id(24)]);
    await db.query(`INSERT INTO rel_role_perm(id,tenant_id,park_id,role_id,permission_id)
      VALUES ($1,'alpha','park-a',$3,$5),($2,'alpha','park-b',$4,$5)`, [id(50), id(51), id(20), id(21), id(30)]);
    await db.query(`INSERT INTO rel_role_perm(id,tenant_id,park_id,role_id,permission_id,is_deleted)
      VALUES ($1,'alpha','park-b',$2,$3,true)`, [id(52), id(24), id(30)]);
    await addToken(60, 10);
    await addToken(61, 10, "park-b");
    await db.query("UPDATE sys_auth_refresh_token SET revoked=true,is_deleted=true,expires_at=now()-interval '1 day' WHERE id=$1", [id(61)]);
    await db.query(`INSERT INTO sys_user_identity(id,tenant_id,park_id,user_id,provider,provider_user_id)
      VALUES ($1,'alpha','park-a',$2,'password','synthetic-login')`, [id(70), id(10)]);

    // Existing corruption must abort installation, rather than creating NOT VALID constraints.
    await db.query(`INSERT INTO sys_user_identity(id,tenant_id,park_id,user_id,provider,provider_user_id)
      VALUES ($1,'alpha','park-a',$2,'password','synthetic-cross-tenant')`, [id(71), id(12)]);
    await rejectCode(() => apply(component), "23503");
    await db.query("ROLLBACK");
    assert.equal((await one(`SELECT count(*)::int AS n FROM information_schema.columns
      WHERE table_schema='public' AND table_name='sys_user' AND column_name='default_scope_id'`)).n, 0);
    await db.query("DELETE FROM sys_user_identity WHERE id=$1", [id(71)]);
    await apply(component);

    const tables = ["sys_user", "sys_role", "sys_permission", "rel_user_role", "rel_role_perm", "sys_user_identity", "sys_auth_refresh_token"];
    const snapshot = async () => {
      const result: Record<string, unknown> = {};
      for (const table of tables) result[table] = await one(`SELECT count(*)::int AS n,
        md5(string_agg((to_jsonb(t)-'scope_id'-'default_scope_id')::text,'|' ORDER BY id)) AS hash FROM ${table} t`);
      return result;
    };
    const before = await snapshot();
    const expected = { sourceUsers: 2, updatedUsers: 2, sourceParkRoles: 2, updatedParkRoles: 2,
      sourceUserRoleLinks: 4, updatedUserRoleLinks: 4, sourceRolePermissionLinks: 3, updatedRolePermissionLinks: 3,
      sourceRefreshTokens: 2, updatedRefreshTokens: 2, totalUpdated: 13 };
    assert.deepEqual(await backfill(), expected);
    assert.deepEqual(await snapshot(), before); // Every pre-existing field and every grant is unchanged.
    assert.deepEqual(await backfill(), Object.fromEntries(Object.entries(expected)
      .map(([key, value]) => [key, key.startsWith("updated") || key === "totalUpdated" ? 0 : value])));
    assert.equal((await one("SELECT default_scope_id FROM sys_user WHERE id=$1", [id(12)])).default_scope_id, null);
    assert.equal((await one("SELECT scope_id FROM sys_role WHERE id=$1", [id(23)])).scope_id, null);
    assert.equal((await one("SELECT count(*)::int AS n FROM sys_role WHERE tenant_id='alpha' AND role_scope IN ('tenant','platform') AND scope_id IS NOT NULL")).n, 0);
    assert.equal((await one("SELECT count(*)::int AS n FROM sys_user_business_scope_membership")).n, 0);
    assert.equal((await one("SELECT count(*)::int AS n FROM sys_business_scope_module")).n, 0);
    assert.equal((await one("SELECT scope_id FROM sys_auth_refresh_token WHERE id=$1", [id(61)])).scope_id, scopeB);
    assert.equal((await one(`SELECT count(*)::int AS n FROM information_schema.columns
      WHERE table_schema='public' AND table_name=ANY($1) AND column_name='park_id' AND is_nullable='NO'`, [tables])).n, 7);

    await rejectCode(() => db.query("UPDATE sys_user SET default_scope_id=$1 WHERE id=$2", [scopeB, id(10)]), "23503");
    await rejectCode(() => db.query("UPDATE rel_user_role SET user_id=$1 WHERE id=$2", [id(12), id(40)]), "23503");
    await rejectCode(() => db.query("UPDATE rel_user_role SET role_id=$1 WHERE id=$2", [id(23), id(40)]),
      "P0001", "SMART_PARK_IDENTITY_ROLE_IDENTITY_MISSING");
    await rejectCode(() => db.query("UPDATE rel_role_perm SET permission_id=$1 WHERE id=$2", [id(31), id(50)]), "23503");
    await rejectCode(() => db.query("UPDATE sys_user_identity SET user_id=$1 WHERE id=$2", [id(12), id(70)]), "23503");
    await rejectCode(() => db.query("UPDATE sys_role SET parent_id=$1 WHERE id=$2", [id(23), id(20)]), "23503");
    await rejectCode(() => db.query("UPDATE sys_permission SET parent_id=$1 WHERE id=$2", [id(31), id(30)]), "23503");
    await rejectCode(() => db.query("UPDATE sys_auth_refresh_token SET user_id=$1 WHERE id=$2", [id(12), id(60)]), "P0001");
    await rejectCode(() => db.query("UPDATE sys_user SET default_scope_id=NULL WHERE id=$1", [id(10)]), "P0001");
    await rejectCode(() => db.query("UPDATE sys_auth_refresh_token SET park_id='park-b',scope_id=$1 WHERE id=$2", [scopeB, id(60)]), "P0001");
    await rejectCode(() => db.query("UPDATE rel_user_role SET park_id='park-b',scope_id=$1 WHERE id=$2", [scopeB, id(40)]), "P0001");
    await rejectCode(() => db.query("UPDATE sys_role SET park_id='park-b',scope_id=$1 WHERE id=$2", [scopeB, id(20)]), "P0001");
    await rejectCode(() => db.query("UPDATE sys_business_scope_park_binding SET scope_id=gen_random_uuid() WHERE scope_id=$1", [scopeA]), "23503");

    // Old single-scope inserts remain possible; transition preflight must reject ambiguity, not merge identities.
    await altered(() => addUser(80, "park-b", "synthetic-10"), () => rejectCode(() => backfill(), "P0001"));
    await altered(() => db.query(`INSERT INTO sys_user_identity(tenant_id,park_id,user_id,provider,provider_user_id)
      VALUES ('alpha','park-b',$1,'password','synthetic-login')`, [id(11)]), () => rejectCode(() => backfill(), "P0001"));
    await altered(() => db.query(`INSERT INTO sys_user_identity(tenant_id,park_id,user_id,provider,provider_user_id)
      VALUES ('alpha','park-b',$1,'password','synthetic-other-login')`, [id(10)]),
    () => rejectCode(() => backfill(), "P0001", "SMART_PARK_IDENTITY_ACTIVE_PROVIDER_CONFLICT"));
    await altered(() => addUser(81, "missing-park"), () => rejectCode(() => backfill(), "P0001"));
    await altered(() => db.query(`INSERT INTO biz_park(tenant_id,park_id,park_code,park_name)
      VALUES ('alpha','park-a','duplicate-a','Synthetic duplicate')`), () => rejectCode(() => backfill(), "P0001"));
    await altered(() => db.query("UPDATE biz_park SET is_deleted=true WHERE park_id='park-a'"), () => rejectCode(() => backfill(), "P0001"));
    await altered(() => db.query("UPDATE sys_business_scope SET is_deleted=true WHERE id=$1", [scopeA]), () => rejectCode(() => backfill(), "P0001"));
    await altered(async () => {
      await db.query("UPDATE sys_tenant SET is_deleted=true WHERE id=$1", [id(1)]);
      await db.query("INSERT INTO sys_tenant(id,tenant_id) VALUES ($1,'alpha')", [id(3)]);
    }, () => rejectCode(() => backfill(), "P0001", "SMART_PARK_IDENTITY_BINDING_DRIFT"));
    await rejectCode(() => backfill(""), "P0001");
    await rejectCode(() => backfill("missing-tenant"), "P0001");

    // Force a late failure after the user UPDATE; earlier updates must roll back with that same SQL statement.
    await addUser(82);
    await addToken(83, 82);
    await db.query(`CREATE FUNCTION synthetic_identity_late_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'SYNTHETIC_IDENTITY_LATE_FAILURE'; END $$;
      CREATE TRIGGER synthetic_identity_late_failure AFTER UPDATE ON sys_auth_refresh_token
        FOR EACH ROW WHEN (NEW.id='${id(83)}'::uuid) EXECUTE FUNCTION synthetic_identity_late_failure();`);
    await assert.rejects(backfill(), /SYNTHETIC_IDENTITY_LATE_FAILURE/u);
    assert.equal((await one("SELECT default_scope_id FROM sys_user WHERE id=$1", [id(82)])).default_scope_id, null);
    assert.equal((await one("SELECT scope_id FROM sys_auth_refresh_token WHERE id=$1", [id(83)])).scope_id, null);
    await db.query("DROP TRIGGER synthetic_identity_late_failure ON sys_auth_refresh_token; DROP FUNCTION synthetic_identity_late_failure()");
    assert.equal((await backfill()).totalUpdated, 2);

    await altered(() => db.query("UPDATE sys_auth_refresh_token SET revoked=true,revoked_time=now() WHERE id=$1", [id(60)]),
      async () => assert.equal((await one("SELECT revoked FROM sys_auth_refresh_token WHERE id=$1", [id(60)])).revoked, true));

    // A grant insertion locks its role definition until commit; a concurrent scope move cannot race it.
    await db.query(`INSERT INTO sys_role(id,tenant_id,park_id,scope_id,code,name,role_scope)
      VALUES ($1,'alpha','park-a',$2,'CONCURRENT_ROLE','Synthetic concurrency','park')`, [id(90), scopeA]);
    const writer = source.createQueryRunner();
    await writer.connect();
    try {
      await writer.startTransaction();
      await writer.query(`INSERT INTO rel_user_role(id,tenant_id,park_id,scope_id,user_id,role_id)
        VALUES ($1,'alpha','park-a',$2,$3,$4)`, [id(91), scopeA, id(10), id(90)]);
      await db.query("SET lock_timeout='150ms'");
      try {
        await rejectCode(() => db.query("UPDATE sys_role SET park_id='park-b',scope_id=$1 WHERE id=$2", [scopeB, id(90)]), "55P03");
      } finally { await db.query("RESET lock_timeout"); }
      await writer.commitTransaction();
      await rejectCode(() => db.query("UPDATE sys_role SET park_id='park-b',scope_id=$1 WHERE id=$2", [scopeB, id(90)]),
        "P0001", "SMART_PARK_IDENTITY_ROLE_SCOPE_REVERSE_DRIFT");
    } finally {
      if (writer.isTransactionActive) await writer.rollbackTransaction();
      await writer.release();
    }

    await db.query("CREATE ROLE synthetic_identity_reader; GRANT USAGE ON SCHEMA public TO synthetic_identity_reader; GRANT SELECT ON ALL TABLES IN SCHEMA public TO synthetic_identity_reader");
    await db.query("SET ROLE synthetic_identity_reader");
    try {
      await rejectCode(() => backfill(), "42501");
      await rejectCode(() => db.query("UPDATE sys_user SET default_scope_id=NULL"), "42501");
    } finally { await db.query("RESET ROLE"); }
  } finally { await db.release(); await source.destroy(); }
});
