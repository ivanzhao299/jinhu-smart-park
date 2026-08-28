import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { DataSource } from "typeorm";
import type { AuditService } from "../audit/audit.service";
import { HrDepartureService } from "./hr-departure.service";

const enabled = process.env.HR_DEPARTURE_PG_TEST === "1";
const scope = { tenantId: "10000001", parkId: "20000001" };
let db: DataSource;
let service: HrDepartureService;
let applicant: string;
let reviewer: string;
let specialist: string;
let employeeA: string;
let employeeB: string;
let employeeC: string;
let orgId: string;
let positionId: string;
const actor = (sub: string, permissions: string[] = []) => ({
  sub,
  username: "departure-pg",
  tenantId: scope.tenantId,
  parkId: scope.parkId,
  roles: [],
  permissions,
});

before(async () => {
  if (!enabled) return;
  db = new DataSource({
    type: "postgres",
    host: process.env.POSTGRES_HOST ?? "127.0.0.1",
    port: Number(process.env.POSTGRES_PORT ?? 15432),
    username: process.env.POSTGRES_USER ?? "jinhu",
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB,
  });
  await db.initialize();
  service = new HrDepartureService(
    db,
    { recordOperationRequired: async () => undefined } as unknown as AuditService,
  );
  applicant = randomUUID();
  reviewer = randomUUID();
  specialist = randomUUID();
  employeeA = randomUUID();
  employeeB = randomUUID();
  employeeC = randomUUID();
  orgId = randomUUID();
  positionId = randomUUID();
  await db.query(
    `INSERT INTO sys_user(id,tenant_id,park_id,username,display_name,password_hash,status)
     VALUES($1,$2,$3,$4,'离职申请人','not-login','enabled'),
       ($5,$2,$3,$6,'离职审核人','not-login','enabled'),
       ($7,$2,$3,$8,'离职专员','not-login','enabled')`,
    [applicant, scope.tenantId, scope.parkId, `dpa-${applicant.slice(0, 8)}`, reviewer, `dpr-${reviewer.slice(0, 8)}`, specialist, `dps-${specialist.slice(0, 8)}`],
  );
  await db.query(
    `INSERT INTO sys_org(id,tenant_id,park_id,org_code,org_name,org_type,leader_user_id,status)
     VALUES($1,$2,$3,$4,'离职测试部门','department',$5,'enabled')`,
    [orgId, scope.tenantId, scope.parkId, `DPT-${orgId.slice(0, 8)}`, applicant],
  );
  await db.query(
    `INSERT INTO hr_position(id,tenant_id,park_id,org_id,position_code,position_name,status)
     VALUES($1,$2,$3,$4,$5,'离职测试岗位','enabled')`,
    [positionId, scope.tenantId, scope.parkId, orgId, `DP-${positionId.slice(0, 8)}`],
  );
  await db.query(
    `INSERT INTO hr_employee(id,tenant_id,park_id,employee_code,full_name,primary_org_id,position_id,employment_status)
     VALUES($1,$2,$3,$4,'离职员工甲',$5,$6,'active'),
       ($7,$2,$3,$8,'交接员工乙',$5,$6,'active'),
       ($9,$2,$3,$10,'离职员工丙',$5,$6,'active')`,
    [employeeA, scope.tenantId, scope.parkId, `DPA-${employeeA.slice(0, 8)}`, orgId, positionId, employeeB, `DPB-${employeeB.slice(0, 8)}`, employeeC, `DPC-${employeeC.slice(0, 8)}`],
  );
});

after(async () => {
  if (enabled && db?.isInitialized) await db.destroy();
});

test("departure closes every legacy clearance and applies employee plus ledger atomically", { skip: !enabled }, async () => {
  const permissions = Object.values(HR_PERMISSIONS).filter((permission) => permission.startsWith("hr:departure:"));
  const hr = actor(applicant, permissions);
  const draft = await service.create(scope, hr, {
    applicationName: "员工离职办理",
    employeeId: employeeA,
    applicationDate: "2026-07-15",
    plannedDepartureDate: "2026-07-31",
    departureType: "主动离职",
    reason: "个人发展",
  }) as { id: string; applicationNo: string; status: string };
  assert.match(draft.applicationNo, /^LZ202607\d{4}$/);
  assert.equal(draft.status, "draft");
  await service.act(scope, hr, draft.id, { action: "submit" });
  await assert.rejects(service.review(scope, hr, draft.id, { action: "approve" }), /cannot review/i);
  await service.review(scope, actor(reviewer, [HR_PERMISSIONS.HR_DEPARTURE_READ, HR_PERMISSIONS.HR_DEPARTURE_REVIEW]), draft.id, { action: "approve" });
  await assert.rejects(service.apply(scope, actor(specialist, [HR_PERMISSIONS.HR_DEPARTURE_READ, HR_PERMISSIONS.HR_DEPARTURE_APPLY]), draft.id), /clearance is incomplete/i);
  await service.interview(scope, actor(specialist, [HR_PERMISSIONS.HR_DEPARTURE_READ, HR_PERMISSIONS.HR_DEPARTURE_INTERVIEW]), draft.id, { status: "completed", place: "会议室", summary: "已完成离职面谈" });
  await assert.rejects(service.interview(scope, actor(specialist, [HR_PERMISSIONS.HR_DEPARTURE_READ, HR_PERMISSIONS.HR_DEPARTURE_INTERVIEW]), draft.id, { status: "waived", summary: "不得覆盖已完成面谈" }), /already closed/i);
  await service.survey(scope, actor(specialist, [HR_PERMISSIONS.HR_DEPARTURE_READ, HR_PERMISSIONS.HR_DEPARTURE_SURVEY]), draft.id, { status: "completed", reasonCodes: ["career", "career", "family"], summary: "已完成离职调查" });
  await service.handover(scope, actor(specialist, [HR_PERMISSIONS.HR_DEPARTURE_READ, HR_PERMISSIONS.HR_DEPARTURE_HANDOVER]), draft.id, { status: "completed", handoverToEmployeeId: employeeB, summary: "资料与事项已交接" });
  await service.wage(scope, actor(specialist, [HR_PERMISSIONS.HR_DEPARTURE_READ, HR_PERMISSIONS.HR_DEPARTURE_WAGE_SETTLE]), draft.id, { status: "settled", note: "离职工资已核对" });
  await service.archive(scope, actor(specialist, [HR_PERMISSIONS.HR_DEPARTURE_READ, HR_PERMISSIONS.HR_DEPARTURE_ARCHIVE_CLOSE]), draft.id, { note: "人事档案已关闭" });
  const race = await Promise.allSettled([
    service.apply(scope, actor(specialist, [HR_PERMISSIONS.HR_DEPARTURE_READ, HR_PERMISSIONS.HR_DEPARTURE_APPLY]), draft.id),
    service.apply(scope, actor(specialist, [HR_PERMISSIONS.HR_DEPARTURE_READ, HR_PERMISSIONS.HR_DEPARTURE_APPLY]), draft.id),
  ]);
  assert.equal(race.filter((result) => result.status === "fulfilled").length, 1);
  const employee = (await db.query(`SELECT employment_status,to_char(departure_date,'YYYY-MM-DD') departure_date FROM hr_employee WHERE id=$1`, [employeeA]))[0];
  assert.equal(employee.employment_status, "departed");
  assert.equal(employee.departure_date, "2026-07-31");
  const events = await db.query(`SELECT event_no,event_type FROM hr_employment_event WHERE employee_id=$1 AND event_type='depart'`, [employeeA]);
  assert.equal(events.length, 1);
  assert.equal(events[0].event_no, draft.applicationNo);
  const survey = (await db.query(`SELECT survey_reason_codes FROM hr_departure_application WHERE id=$1`, [draft.id]))[0];
  assert.deepEqual(survey.survey_reason_codes, ["career", "family"]);
  await assert.rejects(db.query(`UPDATE hr_departure_action SET comment='tamper' WHERE application_id=$1`, [draft.id]), /append-only/);
});

test("employee departure status and date cannot bypass the approved workflow", { skip: !enabled }, async () => {
  await assert.rejects(db.query(`UPDATE hr_employee SET employment_status='departed',departure_date='2026-08-01' WHERE id=$1`, [employeeB]), /HR_EMPLOYEE_DEPARTURE_WORKFLOW_REQUIRED/);
  await assert.rejects(db.query(`UPDATE hr_employee SET departure_date='2026-08-01' WHERE id=$1`, [employeeB]), /HR_EMPLOYEE_DEPARTURE_DATE_WORKFLOW_REQUIRED/);
  const unchanged=(await db.query(`SELECT employment_status,departure_date FROM hr_employee WHERE id=$1`,[employeeB]))[0];
  assert.equal(unchanged.employment_status,"active");
  assert.equal(unchanged.departure_date,null);
});

test("draft month change renumbers and approved employee drift fails closed", { skip: !enabled }, async () => {
  const hr = actor(applicant, [HR_PERMISSIONS.HR_DEPARTURE_READ, HR_PERMISSIONS.HR_DEPARTURE_MANAGE]);
  const draft = await service.create(scope, hr, {
    applicationName: "跨月离职办理",
    employeeId: employeeC,
    applicationDate: "2026-07-20",
    plannedDepartureDate: "2026-07-31",
    departureType: "主动离职",
    reason: "原计划",
  }) as { id: string; applicationNo: string };
  const updated = await service.update(scope, hr, draft.id, {
    applicationName: "跨月离职办理",
    employeeId: employeeC,
    applicationDate: "2026-07-20",
    plannedDepartureDate: "2026-08-01",
    departureType: "主动离职",
    reason: "日期调整",
  }) as { applicationNo: string };
  assert.match(updated.applicationNo, /^LZ202608\d{4}$/);
  assert.notEqual(updated.applicationNo, draft.applicationNo);
  await service.act(scope, hr, draft.id, { action: "submit" });
  await service.review(scope, actor(reviewer, [HR_PERMISSIONS.HR_DEPARTURE_READ, HR_PERMISSIONS.HR_DEPARTURE_REVIEW]), draft.id, { action: "approve" });
  await service.interview(scope, actor(specialist, [HR_PERMISSIONS.HR_DEPARTURE_READ, HR_PERMISSIONS.HR_DEPARTURE_INTERVIEW]), draft.id, { status: "waived", summary: "测试免面谈" });
  await service.survey(scope, actor(specialist, [HR_PERMISSIONS.HR_DEPARTURE_READ, HR_PERMISSIONS.HR_DEPARTURE_SURVEY]), draft.id, { status: "waived", reasonCodes: [], summary: "测试免调查" });
  await service.handover(scope, actor(specialist, [HR_PERMISSIONS.HR_DEPARTURE_READ, HR_PERMISSIONS.HR_DEPARTURE_HANDOVER]), draft.id, { status: "waived", summary: "测试免交接" });
  await service.wage(scope, actor(specialist, [HR_PERMISSIONS.HR_DEPARTURE_READ, HR_PERMISSIONS.HR_DEPARTURE_WAGE_SETTLE]), draft.id, { status: "waived", note: "测试免结算" });
  await service.archive(scope, actor(specialist, [HR_PERMISSIONS.HR_DEPARTURE_READ, HR_PERMISSIONS.HR_DEPARTURE_ARCHIVE_CLOSE]), draft.id, { note: "测试关闭档案" });
  await db.query(`UPDATE hr_employee SET employment_status='suspended' WHERE id=$1`, [employeeC]);
  await assert.rejects(service.apply(scope, actor(specialist, [HR_PERMISSIONS.HR_DEPARTURE_READ, HR_PERMISSIONS.HR_DEPARTURE_APPLY]), draft.id), /changed after approval/i);
  assert.equal((await db.query(`SELECT count(*)::int count FROM hr_employment_event WHERE employee_id=$1 AND event_type='depart'`, [employeeC]))[0].count, 0);
});
