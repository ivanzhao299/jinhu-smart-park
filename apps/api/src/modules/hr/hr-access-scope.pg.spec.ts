import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { DataSource } from "typeorm";
import { HrService } from "./hr.service";
import {
  HrApprovalActionEntity,
  HrApprovalRequestEntity,
  HrEmployeeEntity,
} from "./entities/hr.entities";
const required = process.env.HR_ACCESS_SCOPE_PG_REQUIRED === "1";
if (required && !process.env.POSTGRES_PASSWORD)
  throw new Error("POSTGRES_PASSWORD is required");
const suite = required ? describe : describe.skip;
suite("HR approval real-service PostgreSQL gate", () => {
  let db: DataSource, service: HrService;
  const scope = { tenantId: "10000001", parkId: "20000001" },
    actorId = randomUUID(),
    otherId = randomUUID(),
    managerId = randomUUID(),
    managedId = randomUUID(),
    crossId = randomUUID(),
    managedApproval = randomUUID(),
    crossApproval = randomUUID(),
    makerApproval = randomUUID();
  const actor = {
      sub: actorId,
      username: "p0-reviewer",
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      roles: [],
      permissions: [HR_PERMISSIONS.HR_APPROVAL_TEAM_REVIEW],
    },
    parkActor = {
      ...actor,
      permissions: [HR_PERMISSIONS.HR_APPROVAL_PARK_REVIEW],
    };
  const audits: Array<Record<string, unknown>> = [];
  before(async () => {
    db = new DataSource({
      type: "postgres",
      host: process.env.POSTGRES_HOST ?? "127.0.0.1",
      port: Number(process.env.POSTGRES_PORT ?? 5432),
      database: process.env.POSTGRES_DB,
      username: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      entities: [
        HrEmployeeEntity,
        HrApprovalRequestEntity,
        HrApprovalActionEntity,
      ],
    });
    await db.initialize();
    const orgs = (await db.query(
      "SELECT id FROM sys_org WHERE tenant_id=$1 AND park_id=$2 AND is_deleted=false AND status='enabled' ORDER BY id LIMIT 2",
      [scope.tenantId, scope.parkId],
    )) as Array<{ id: string }>;
    assert.ok(orgs.length >= 2);
    await db.query(
      "INSERT INTO sys_user(id,tenant_id,park_id,username,display_name,password_hash,status)VALUES($1,$3,$4,'p0-reviewer','P0 reviewer','x','enabled'),($2,$3,$4,'p0-other','P0 other','x','enabled')",
      [actorId, otherId, scope.tenantId, scope.parkId],
    );
    await db.query("UPDATE sys_org SET leader_user_id=$1 WHERE id=$2", [
      actorId,
      orgs[0]!.id,
    ]);
    await db.query(
      "INSERT INTO hr_employee(id,tenant_id,park_id,employee_code,full_name,user_id,primary_org_id,employment_status)VALUES($1,$4,$5,'P0-M','Manager',$6,$7,'active'),($2,$4,$5,'P0-D','Managed',NULL,$7,'active'),($3,$4,$5,'P0-X','Cross',NULL,$8,'active')",
      [
        managerId,
        managedId,
        crossId,
        scope.tenantId,
        scope.parkId,
        actorId,
        orgs[0]!.id,
        orgs[1]!.id,
      ],
    );
    const repo = db.getRepository(HrApprovalRequestEntity);
    await repo.save(
      [
        [managedApproval, managedId, otherId],
        [crossApproval, crossId, otherId],
        [makerApproval, managedId, actorId],
      ].map(([id, employee, creator], i) =>
        repo.create({
          id,
          ...scope,
          requestNo: `P0-${i}`,
          requestType: "profile_change",
          applicantEmployeeId: employee,
          subjectEmployeeId: employee,
          title: "approval",
          payload: { private: i },
          status: "submitted",
          submittedAt: new Date(),
          createBy: creator,
          updateBy: creator,
        }),
      ),
    );
    const args = Array(33).fill(undefined);
    args[0] = db.getRepository(HrEmployeeEntity);
    args[18] = repo;
    args[30] = db;
    args[31] = {
      recordOperationRequired: async (input: Record<string, unknown>) => {
        audits.push(input);
      },
    };
    service = Reflect.construct(HrService, args) as HrService;
  });
  after(async () => {
    if (db?.isInitialized) {
      await db.query(
        "DELETE FROM hr_approval_action WHERE actor_user_id=ANY($1::uuid[])",
        [[actorId, otherId]],
      );
      await db.query(
        "DELETE FROM hr_approval_request WHERE id=ANY($1::uuid[])",
        [[managedApproval, crossApproval, makerApproval]],
      );
      await db.query("DELETE FROM hr_employee WHERE id=ANY($1::uuid[])", [
        [managerId, managedId, crossId],
      ]);
      await db.query("DELETE FROM sys_user WHERE id=ANY($1::uuid[])", [
        [actorId, otherId],
      ]);
      await db.destroy();
    }
  });
  it("uses HrService pending/review transactions and fails closed", async () => {
    const pending = await service.pendingApprovals(scope, actor);
    assert.deepEqual(
      pending.map((x) => x.id).sort(),
      [managedApproval, makerApproval].sort(),
    );
    assert.ok(audits.at(-1)?.afterJson);
    const holder = service as unknown as {
        auditService: { recordOperationRequired: () => Promise<void> };
      },
      original = holder.auditService;
    holder.auditService = {
      recordOperationRequired: async () => {
        throw new Error("audit unavailable");
      },
    };
    await assert.rejects(
      service.pendingApprovals(scope, actor),
      /audit unavailable/,
    );
    holder.auditService = original;
    await assert.rejects(
      service.reviewApproval(scope, actor, crossApproval, {
        action: "approve",
      }),
      NotFoundException,
    );
    await db.query("UPDATE hr_employee SET is_deleted=true WHERE id=$1", [
      managedId,
    ]);
    await assert.rejects(
      service.reviewApproval(scope, parkActor, makerApproval, {
        action: "approve",
      }),
      ForbiddenException,
    );
    await db.query("UPDATE hr_employee SET is_deleted=false WHERE id=$1", [
      managedId,
    ]);
    assert.equal(
      (
        await service.reviewApproval(scope, actor, managedApproval, {
          action: "approve",
        })
      ).status,
      "approved",
    );
    assert.ok(
      (await service.pendingApprovals(scope, parkActor)).some(
        (x) => x.id === crossApproval,
      ),
    );
  });
  it("executes official seed retirement SQL", async () => {
    await db.query(
      "DELETE FROM sys_permission WHERE tenant_id=$1 AND code='hr:approval:review'",
      [scope.tenantId],
    );
    await db.query(
      "INSERT INTO sys_permission SELECT(jsonb_populate_record(NULL::sys_permission,to_jsonb(p)||jsonb_build_object('id',uuid_generate_v4(),'code','hr:approval:review','name','legacy','is_enabled',true,'status','enabled','is_deleted',false))).* FROM sys_permission p WHERE tenant_id=$1 AND code='hr:approval:park_review' AND is_deleted=false LIMIT 1",
      [scope.tenantId],
    );
    const seed = readFileSync(
        "../../database/seeds/production/000016_hr_management_foundation.sql",
        "utf8",
      ),
      sql = seed.match(
        /UPDATE sys_permission\s+SET is_enabled=false,status='disabled',is_deleted=true,[\s\S]*?WHERE tenant_id='10000001' AND code='hr:approval:review' AND is_deleted=false;/u,
      )?.[0];
    assert.ok(sql);
    await db.query(sql);
    assert.deepEqual(
      await db.query(
        "SELECT is_enabled,status,is_deleted FROM sys_permission WHERE tenant_id=$1 AND code='hr:approval:review'",
        [scope.tenantId],
      ),
      [{ is_enabled: false, status: "disabled", is_deleted: true }],
    );
  });
});
