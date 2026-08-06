import "reflect-metadata";
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { ConflictException, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { SaaSModulesModule } from "./modules/saas-modules/saas-modules.module";
import { SaaSModulesService } from "./modules/saas-modules/saas-modules.service";

const required = process.env.PROPERTY_MODULE_CORE_PG_REQUIRED === "1";
if (required && !process.env.POSTGRES_PASSWORD) {
  throw new Error("POSTGRES_PASSWORD is required for the module-core PostgreSQL gate");
}
const suite = required ? describe : describe.skip;

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: "postgres",
      host: process.env.POSTGRES_HOST ?? "127.0.0.1",
      port: Number(process.env.POSTGRES_PORT ?? "5432"),
      database: process.env.POSTGRES_DB ?? "pr192_b_module_core",
      username: process.env.POSTGRES_USER ?? "pr192_module_core",
      password: process.env.POSTGRES_PASSWORD,
      autoLoadEntities: true,
      synchronize: false
    }),
    SaaSModulesModule
  ]
})
class ModuleCorePgGateModule {}

const tenantA = "11111111-1111-4111-8111-111111111111";
const tenantB = "22222222-2222-4222-8222-222222222222";
const parkA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const parkB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const superuserActor = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const normalActor = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

type ModuleIds = { asset: string; homestay: string; housing: string };

function conflictBody(error: unknown): Record<string, unknown> {
  assert.ok(error instanceof ConflictException, `expected ConflictException, got ${String(error)}`);
  assert.equal(error.getStatus(), 409);
  const response = error.getResponse();
  assert.equal(typeof response, "object");
  return response as Record<string, unknown>;
}

async function expectDependencyConflict(action: Promise<unknown>): Promise<Record<string, unknown>> {
  try {
    await action;
    assert.fail("expected module dependency conflict");
  } catch (error) {
    const body = conflictBody(error);
    assert.equal(body.errorCode, "module-dependency-conflict");
    return body;
  }
}

suite("SaaS module-core PostgreSQL/Nest/Service gate", () => {
  let context: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>;
  let dataSource: DataSource;
  let service: SaaSModulesService;
  let modules: ModuleIds;

  async function insertAssignment(
    tenantId: string,
    parkId: string,
    moduleId: string,
    status: "enabled" | "disabled",
    window: { start?: string | null; expire?: string | null } = {}
  ): Promise<void> {
    await dataSource.query(
      `INSERT INTO rel_tenant_module
        (tenant_id,park_id,tenant_code,module_id,start_time,expire_time,enabled,status,
         create_by,update_by,is_deleted,version)
       VALUES ($1,$2,'MODULE_CORE_GATE',$3,$4,$5,$6,$7,$8,$8,false,1)`,
      [tenantId, parkId, moduleId, window.start ?? null, window.expire ?? null,
        status === "enabled", status, normalActor]
    );
  }

  async function resetAssignments(): Promise<void> {
    await dataSource.query(
      `DELETE FROM rel_tenant_module
       WHERE tenant_id IN ($1,$2) AND park_id IN ($3,$4)`,
      [tenantA, tenantB, parkA, parkB]
    );
  }

  before(async () => {
    context = await NestFactory.createApplicationContext(ModuleCorePgGateModule, {
      logger: false
    });
    dataSource = context.get(DataSource);
    service = context.get(SaaSModulesService);
    const rows = await dataSource.query(
      `SELECT module_code AS code,id
       FROM sys_module
       WHERE module_code IN ('asset','homestay','housing_rental')
         AND status=1 AND is_deleted=false
       ORDER BY module_code COLLATE "C"`
    ) as Array<{ code: string; id: string }>;
    assert.deepEqual(rows.map((row) => row.code), ["asset", "homestay", "housing_rental"]);
    modules = {
      asset: rows.find((row) => row.code === "asset")!.id,
      homestay: rows.find((row) => row.code === "homestay")!.id,
      housing: rows.find((row) => row.code === "housing_rental")!.id
    };
  });

  beforeEach(resetAssignments);

  after(async () => {
    if (dataSource?.isInitialized) await resetAssignments();
    await context?.close();
  });

  it("enforces the complete active predicate and tenant/park isolation", async () => {
    await insertAssignment(tenantA, parkB, modules.asset, "enabled");
    await insertAssignment(tenantB, parkA, modules.asset, "enabled");
    const isolated = await expectDependencyConflict(
      service.enableTenantModule({ tenantId: tenantA, parkId: parkA }, normalActor, modules.homestay)
    );
    assert.deepEqual(isolated.requiredModules, ["asset"]);

    await insertAssignment(tenantA, parkA, modules.asset, "enabled", {
      expire: "2000-01-01T00:00:00.000Z"
    });
    const expired = await expectDependencyConflict(
      service.enableTenantModule({ tenantId: tenantA, parkId: parkA }, normalActor, modules.housing)
    );
    assert.deepEqual(expired.requiredModules, ["asset"]);

    await dataSource.query(
      `UPDATE rel_tenant_module SET expire_time=NULL,start_time=NULL
       WHERE tenant_id=$1 AND park_id=$2 AND module_id=$3`,
      [tenantA, parkA, modules.asset]
    );
    const enabled = await service.enableTenantModule(
      { tenantId: tenantA, parkId: parkA }, normalActor, modules.housing
    );
    assert.equal(enabled.enabled, true);
    assert.equal(enabled.status, "enabled");
  });

  it("does not let a superuser actor bypass a missing dependency", async () => {
    const body = await expectDependencyConflict(
      service.enableTenantModule(
        { tenantId: tenantA, parkId: parkA }, superuserActor, modules.homestay
      )
    );
    assert.deepEqual(body, {
      message: "Required module is not active",
      errorCode: "module-dependency-conflict",
      requiredModules: ["asset"]
    });
  });

  it("holds the tenant/park advisory lock before completing a write", async () => {
    await insertAssignment(tenantA, parkA, modules.asset, "enabled");
    const holder = dataSource.createQueryRunner();
    await holder.connect();
    await holder.startTransaction();
    await holder.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
      [`tenant-module-dependency:${tenantA}:${parkA}`]
    );
    let settled = false;
    const enable = service.enableTenantModule(
      { tenantId: tenantA, parkId: parkA }, normalActor, modules.homestay
    ).finally(() => { settled = true; });
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(settled, false, "service write must wait for the exact advisory lock");
    await holder.rollbackTransaction();
    await holder.release();
    const result = await enable;
    assert.equal(result.enabled, true);
  });

  it("serializes concurrent dependent enable and required-module disable", async () => {
    await insertAssignment(tenantA, parkA, modules.asset, "enabled");
    await insertAssignment(tenantA, parkA, modules.homestay, "disabled");
    const outcomes = await Promise.allSettled([
      service.enableTenantModule(
        { tenantId: tenantA, parkId: parkA }, normalActor, modules.homestay
      ),
      service.disableTenantModule(
        { tenantId: tenantA, parkId: parkA }, normalActor, modules.asset
      )
    ]);
    assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
    const rejected = outcomes.find((outcome) => outcome.status === "rejected");
    assert.ok(rejected && rejected.status === "rejected");
    assert.equal(conflictBody(rejected.reason).errorCode, "module-dependency-conflict");

    const rows = await dataSource.query(
      `SELECT module.module_code AS code,assignment.enabled,assignment.status
       FROM rel_tenant_module assignment
       JOIN sys_module module ON module.id=assignment.module_id
       WHERE assignment.tenant_id=$1 AND assignment.park_id=$2
         AND assignment.is_deleted=false
         AND module.module_code IN ('asset','homestay')
       ORDER BY module.module_code COLLATE "C"`,
      [tenantA, parkA]
    ) as Array<{ code: string; enabled: boolean; status: string }>;
    assert.equal(rows.every((row) => row.enabled === (row.status === "enabled")), true);
    const byCode = Object.fromEntries(rows.map((row) => [row.code, row.enabled]));
    assert.equal(byCode.asset || !byCode.homestay, true,
      "a dependent must never remain active while asset is inactive");
  });

  it("rolls back a failed service transaction without split enabled/status state", async () => {
    await insertAssignment(tenantA, parkA, modules.asset, "enabled");
    await dataSource.query(`
      CREATE OR REPLACE FUNCTION module_core_gate_reject_update() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.tenant_code='MODULE_CORE_GATE' THEN
          RAISE EXCEPTION 'module-core-forced-rollback';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER module_core_gate_reject_update
      BEFORE UPDATE ON rel_tenant_module
      FOR EACH ROW EXECUTE FUNCTION module_core_gate_reject_update();
    `);
    try {
      await assert.rejects(
        service.disableTenantModule(
          { tenantId: tenantA, parkId: parkA }, normalActor, modules.asset
        ),
        /module-core-forced-rollback/
      );
      const [row] = await dataSource.query(
        `SELECT enabled,status,version FROM rel_tenant_module
         WHERE tenant_id=$1 AND park_id=$2 AND module_id=$3 AND is_deleted=false`,
        [tenantA, parkA, modules.asset]
      ) as Array<{ enabled: boolean; status: string; version: number }>;
      assert.deepEqual(row, { enabled: true, status: "enabled", version: 1 });
    } finally {
      await dataSource.query("DROP TRIGGER IF EXISTS module_core_gate_reject_update ON rel_tenant_module");
      await dataSource.query("DROP FUNCTION IF EXISTS module_core_gate_reject_update()" );
    }
  });
});
