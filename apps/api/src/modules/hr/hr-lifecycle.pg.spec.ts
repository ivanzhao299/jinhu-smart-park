import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { DataSource } from "typeorm";
import { HrLifecycleService } from "./hr-lifecycle.service";
const enabled = process.env.HR_LIFECYCLE_PG_TEST === "1";
let db: DataSource,
  service: HrLifecycleService,
  actorId: string,
  employeeUserId: string,
  employeeId: string,
  checklistId: string,
  itemId: string;
const scope = { tenantId: "10000001", parkId: "20000001" };
const permissions = [
  HR_PERMISSIONS.HR_LIFECYCLE_TEMPLATE_MANAGE,
  HR_PERMISSIONS.HR_LIFECYCLE_ASSIGN,
  HR_PERMISSIONS.HR_LIFECYCLE_READ,
  HR_PERMISSIONS.HR_LIFECYCLE_SELF_ACTION,
  HR_PERMISSIONS.HR_LIFECYCLE_REVIEW,
];
before(async () => {
  if (!enabled) return;
  db = new DataSource({
    type: "postgres",
    host: process.env.POSTGRES_HOST ?? "127.0.0.1",
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    username: process.env.POSTGRES_USER ?? "jinhu",
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB,
  });
  await db.initialize();
  actorId = randomUUID();
  employeeUserId = randomUUID();
  employeeId = randomUUID();
  await db.query(
    `INSERT INTO sys_user(id,tenant_id,park_id,username,display_name,password_hash,status) VALUES($1,$2,$3,$4,'生命周期测试','not-a-login-hash','enabled')`,
    [actorId, scope.tenantId, scope.parkId, `t5-p2-${actorId.slice(0, 8)}`],
  );
  await db.query(
    `INSERT INTO sys_user(id,tenant_id,park_id,username,display_name,password_hash,status) VALUES($1,$2,$3,$4,'生命周期员工账号','not-a-login-hash','enabled')`,
    [employeeUserId, scope.tenantId, scope.parkId, `t5-p2-employee-${employeeUserId.slice(0, 8)}`],
  );
  await db.query(
    `INSERT INTO hr_employee(id,tenant_id,park_id,employee_code,full_name,user_id,employment_status,create_by,update_by) VALUES($1,$2,$3,$4,'生命周期员工',$5,'preboarding',$5,$5)`,
    [
      employeeId,
      scope.tenantId,
      scope.parkId,
      `T5P2-${actorId.slice(0, 8)}`,
      employeeUserId,
    ],
  );
  service = new HrLifecycleService(
    db,
    {
      identityProfile: (value: string) => ({
        encrypted: `enc:${value}`,
        masked: "***",
        hash: `hash:${value}`,
      }),
    } as never,
    { recordOperationRequired: async () => undefined } as never,
  );
  const actor = {
    sub: actorId,
    username: "t5-p2",
    tenantId: scope.tenantId,
    parkId: scope.parkId,
    roles: [],
    permissions,
  };
  const template = await service.createTemplate(scope, actor, {
    code: `TPL-${actorId.slice(0, 8)}`,
    name: "入职并发模板",
    type: "onboarding",
    items: [
      {
        code: "account",
        name: "开通账号",
        category: "account",
        required: true,
      },
    ],
  });
  const checklist = await service.createChecklist(scope, actor, {
    employeeId,
    templateVersionId: template.versionId,
  });
  checklistId = checklist.id;
  await db.query(
    `UPDATE hr_lifecycle_checklist_item SET responsible_user_id=$1 WHERE checklist_id=$2`,
    [actorId, checklistId],
  );
  const rows = await db.query(
    `SELECT id FROM hr_lifecycle_checklist_item WHERE checklist_id=$1`,
    [checklistId],
  );
  itemId = rows[0].id;
});
after(async () => {
  if (enabled) await db.destroy();
});
test(
  "concurrent lifecycle action writes one immutable action and one inbox message without employee side effects",
  { skip: !enabled },
  async () => {
    const actor = {
      sub: actorId,
      username: "t5-p2",
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      roles: [],
      permissions,
    };
    const beforeRows = await db.query(
      `SELECT employment_status,
        (SELECT count(*) FROM sys_user) user_count,
        (SELECT count(*) FROM hr_payroll_run) payroll_count,
        (SELECT count(*) FROM hr_performance_plan) performance_count
       FROM hr_employee WHERE id=$1`,
      [employeeId],
    );
    const results = await Promise.allSettled([
      service.act(scope, actor, checklistId, itemId, { action: "complete" }),
      service.act(scope, actor, checklistId, itemId, { action: "complete" }),
    ]);
    assert.equal(
      results.filter((x) => x.status === "fulfilled").length,
      1,
      results
        .map((x) => (x.status === "rejected" ? String(x.reason) : "ok"))
        .join(" | "),
    );
    const evidence = await db.query(
      `SELECT (SELECT count(*) FROM hr_lifecycle_checklist_action WHERE item_id=$1) actions,
              (SELECT count(*) FROM biz_user_message WHERE source_id=$2) messages,
              (SELECT employment_status FROM hr_employee WHERE id=$3) employee_status,
              (SELECT count(*) FROM sys_user) user_count,
              (SELECT count(*) FROM hr_payroll_run) payroll_count,
              (SELECT count(*) FROM hr_performance_plan) performance_count`,
      [itemId, checklistId, employeeId],
    );
    assert.deepEqual(evidence[0], {
      actions: "1",
      messages: "1",
      employee_status: beforeRows[0].employment_status,
      user_count: beforeRows[0].user_count,
      payroll_count: beforeRows[0].payroll_count,
      performance_count: beforeRows[0].performance_count,
    });
  },
);
