import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { DataSource } from "typeorm";
import { HrRewardsService } from "./hr-rewards.service";

const enabled = process.env.HR_REWARDS_PG_TEST === "1";
const scope = { tenantId: "10000001", parkId: "20000001" };
let db: DataSource, service: HrRewardsService;
let hrId: string, reviewerId: string, employeeUserId: string, employeeId: string, orgId: string;
const permissions: string[] = [HR_PERMISSIONS.HR_REWARD_READ, HR_PERMISSIONS.HR_REWARD_MANAGE, HR_PERMISSIONS.HR_REWARD_REVIEW, HR_PERMISSIONS.HR_REWARD_SELF_READ, HR_PERMISSIONS.HR_REWARD_REASON_READ, HR_PERMISSIONS.HR_REWARD_AMOUNT_READ, HR_PERMISSIONS.HR_REWARD_DOCUMENT_READ, HR_PERMISSIONS.HR_REWARD_LINK_PAYROLL, HR_PERMISSIONS.HR_REWARD_LINK_PERFORMANCE];
const actor = (sub = hrId, p = permissions) => ({ sub, username: "t5-reward", tenantId: scope.tenantId, parkId: scope.parkId, roles: [], permissions: p });

before(async () => {
  if (!enabled) return;
  db = new DataSource({ type: "postgres", host: process.env.POSTGRES_HOST ?? "127.0.0.1", port: Number(process.env.POSTGRES_PORT ?? 5432), username: process.env.POSTGRES_USER ?? "jinhu", password: process.env.POSTGRES_PASSWORD, database: process.env.POSTGRES_DB });
  await db.initialize();
  hrId = randomUUID(); reviewerId = randomUUID(); employeeUserId = randomUUID(); employeeId = randomUUID(); orgId = randomUUID();
  await db.query(`INSERT INTO sys_user(id,tenant_id,park_id,username,display_name,password_hash,status) VALUES($1,$2,$3,$4,'奖惩测试HR','not-a-login-hash','enabled'),($5,$2,$3,$6,'奖惩测试审核人','not-a-login-hash','enabled'),($7,$2,$3,$8,'奖惩测试员工','not-a-login-hash','enabled')`, [hrId, scope.tenantId, scope.parkId, `t5-rw-${hrId.slice(0, 8)}`, reviewerId, `t5-rw-r-${reviewerId.slice(0, 8)}`, employeeUserId, `t5-rw-e-${employeeUserId.slice(0, 8)}`]);
  await db.query(`INSERT INTO sys_org(id,tenant_id,park_id,org_code,org_name,org_type,status,leader_user_id,create_by,update_by) VALUES($1,$2,$3,$4,'奖惩测试部门','department','enabled',$5,$5,$5)`, [orgId, scope.tenantId, scope.parkId, `T5RW-${hrId.slice(0, 8)}`, reviewerId]);
  await db.query(`INSERT INTO hr_employee(id,tenant_id,park_id,employee_code,full_name,user_id,primary_org_id,employment_status,create_by,update_by) VALUES($1,$2,$3,$4,'奖惩测试员工',$5,$6,'active',$5,$5)`, [employeeId, scope.tenantId, scope.parkId, `T5RW-${employeeId.slice(0, 8)}`, employeeUserId, orgId]);
  await db.query(`INSERT INTO rel_user_role(tenant_id,park_id,user_id,role_id,create_by,update_by) SELECT $1::varchar,$2::varchar,$3::uuid,id,$3::uuid,$3::uuid FROM sys_role WHERE tenant_id=$1::varchar AND code='HR_MANAGER' AND is_deleted=false LIMIT 1`, [scope.tenantId, scope.parkId, reviewerId]);
  service = new HrRewardsService(db, { recordOperationRequired: async () => undefined } as never);
});
after(async () => { if (enabled && db?.isInitialized) await db.destroy(); });

test("concurrent approval has one action and terminal case stays immutable without downstream side effects", { skip: !enabled }, async () => {
  const beforeState = (await db.query(`SELECT employment_status,(SELECT count(*) FROM sys_user) users,(SELECT count(*) FROM hr_payroll_run) payroll,(SELECT count(*) FROM hr_payslip) payslips,(SELECT count(*) FROM hr_compensation_plan) compensation,(SELECT count(*) FROM hr_performance_plan) performance,(SELECT count(*) FROM hr_performance_item) items FROM hr_employee WHERE id=$1`, [employeeId]))[0];
  const category = await service.createCategory(scope, actor(), { code: `RW-${hrId.slice(0, 8)}`, kind: "reward", name: "专项表扬", impactLevel: "normal" });
  const draft = await service.createCase(scope, actor(), { code: `CASE-${hrId.slice(0, 8)}`, employeeId, categoryId: category.id, occurredOn: "2026-08-25", factSummary: "完成关键项目", detailedReason: "内部复核事实", impactLevel: "normal", amountSuggestion: "1000.0000", currency: "CNY", evidenceFileIds: [] });
  const evidenceId=randomUUID();
  await db.query(`INSERT INTO sys_file(id,tenant_id,park_id,file_code,original_name,stored_name,file_url,file_size,mime_type,md5,biz_type,biz_id,storage_path,create_by,update_by) VALUES($1,$2,$3,$4,'奖惩证据.pdf','reward-evidence.pdf','',4,'application/pdf','00000000000000000000000000000000','hr_reward_evidence',$5,'test/reward-evidence.pdf',$6,$6)`,[evidenceId,scope.tenantId,scope.parkId,`T5RW-${evidenceId.slice(0,8)}`,draft.id,hrId]);
  await service.act(scope, actor(), draft.id, "submit", {});
  assert.deepEqual((await db.query(`SELECT evidence_snapshot FROM hr_reward_discipline_case WHERE id=$1`,[draft.id]))[0].evidence_snapshot,[evidenceId]);
  await assert.rejects(db.query(`UPDATE sys_file SET is_deleted=true WHERE id=$1`,[evidenceId]),/referenced reward evidence is immutable/);
  const projected=await service.detail(scope,actor(),draft.id) as Record<string,unknown>;assert.equal(projected.amountSuggestion,"1000.0000");assert.deepEqual(projected.evidenceFileIds,[evidenceId]);
  const results = await Promise.allSettled([service.act(scope, actor(reviewerId), draft.id, "approve", {}), service.act(scope, actor(reviewerId), draft.id, "approve", {})]);
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 1,results.map((x)=>x.status==="rejected"?String(x.reason):"ok").join(" | "));
  assert.equal((await db.query(`SELECT count(*) value FROM hr_reward_discipline_action WHERE case_id=$1 AND action='approve'`, [draft.id]))[0].value, "1");
  assert.equal((await db.query(`SELECT count(*) value FROM biz_user_message WHERE source_id=$1 AND action='approve'`, [draft.id]))[0].value, "1");
  const cycleId = randomUUID(), planId = randomUUID();
  await db.query(`INSERT INTO hr_performance_cycle(id,tenant_id,park_id,cycle_code,cycle_name,start_date,end_date,status,create_by,update_by) VALUES($1,$2,$3,$4,'奖惩引用测试周期','2026-01-01','2026-12-31','active',$5,$5)`, [cycleId, scope.tenantId, scope.parkId, `T5RW-${cycleId.slice(0, 8)}`, hrId]);
  await db.query(`INSERT INTO hr_performance_plan(id,tenant_id,park_id,cycle_id,employee_id,status,create_by,update_by) VALUES($1,$2,$3,$4,$5,'draft',$6,$6)`, [planId, scope.tenantId, scope.parkId, cycleId, employeeId, hrId]);
  const links = await Promise.allSettled([service.link(scope, actor(), draft.id, { targetType: "performance_reference", targetId: planId, targetVersion: 1 }), service.link(scope, actor(), draft.id, { targetType: "performance_reference", targetId: planId, targetVersion: 1 })]);
  assert.equal(links.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal((await db.query(`SELECT count(*) value FROM hr_reward_discipline_link WHERE case_id=$1 AND target_id=$2`, [draft.id, planId]))[0].value, "1");
  const otherEmployeeId=randomUUID(),otherPlanId=randomUUID(),otherCycleId=randomUUID();
  await db.query(`INSERT INTO hr_employee(id,tenant_id,park_id,employee_code,full_name,primary_org_id,employment_status,create_by,update_by) VALUES($1,$2,$3,$4,'其他员工',$5,'active',$6,$6)`,[otherEmployeeId,scope.tenantId,scope.parkId,`T5RW-${otherEmployeeId.slice(0,8)}`,orgId,hrId]);
  await db.query(`INSERT INTO hr_performance_cycle(id,tenant_id,park_id,cycle_code,cycle_name,start_date,end_date,status,create_by,update_by) VALUES($1,$2,$3,$4,'错误员工引用周期','2027-01-01','2027-12-31','active',$5,$5)`,[otherCycleId,scope.tenantId,scope.parkId,`T5RW-${otherCycleId.slice(0,8)}`,hrId]);
  await db.query(`INSERT INTO hr_performance_plan(id,tenant_id,park_id,cycle_id,employee_id,status,create_by,update_by) VALUES($1,$2,$3,$4,$5,'draft',$6,$6)`,[otherPlanId,scope.tenantId,scope.parkId,otherCycleId,otherEmployeeId,hrId]);
  await assert.rejects(service.link(scope,actor(),draft.id,{targetType:"performance_reference",targetId:otherPlanId,targetVersion:1}),/unavailable or stale/);
  await assert.rejects(db.query(`UPDATE hr_reward_discipline_case SET fact_summary='tamper' WHERE id=$1`, [draft.id]), /terminal reward case is immutable/);
  await Promise.all([service.correct(scope, actor(), draft.id, { type: "correction", summary: "补充事实", reason: "归档修正" }), service.correct(scope, actor(employeeUserId, [HR_PERMISSIONS.HR_REWARD_SELF_READ]), draft.id, { type: "appeal", summary: "员工申诉", reason: "申请复核" })]);
  assert.equal((await db.query(`SELECT count(*) value FROM hr_reward_discipline_correction WHERE case_id=$1`, [draft.id]))[0].value, "2");
  const afterState = (await db.query(`SELECT employment_status,(SELECT count(*) FROM sys_user) users,(SELECT count(*) FROM hr_payroll_run) payroll,(SELECT count(*) FROM hr_payslip) payslips,(SELECT count(*) FROM hr_compensation_plan) compensation,(SELECT count(*) FROM hr_performance_plan) performance,(SELECT count(*) FROM hr_performance_item) items FROM hr_employee WHERE id=$1`, [employeeId]))[0];
  assert.equal(afterState.employment_status, beforeState.employment_status);
  for (const key of ["users", "payroll", "payslips", "compensation", "items"]) assert.equal(afterState[key], beforeState[key]);
  assert.equal(Number(afterState.performance), Number(beforeState.performance) + 2);
});

test("sensitive field writes and empty sensitive reads fail closed without exact atoms", { skip: !enabled }, async () => {
  const category=(await db.query(`SELECT id FROM hr_reward_discipline_category WHERE create_by=$1 ORDER BY create_time LIMIT 1`,[hrId]))[0];
  const manageOnly=actor(hrId,[HR_PERMISSIONS.HR_REWARD_MANAGE]);
  await assert.rejects(service.createCase(scope,manageOnly,{code:`NO-REASON-${hrId.slice(0,8)}`,employeeId,categoryId:category.id,occurredOn:"2026-08-25",factSummary:"权限测试",detailedReason:"不得写入",impactLevel:"minor",evidenceFileIds:[]}),/Forbidden/);
  await assert.rejects(service.createCase(scope,manageOnly,{code:`NO-AMOUNT-${hrId.slice(0,8)}`,employeeId,categoryId:category.id,occurredOn:"2026-08-25",factSummary:"权限测试",impactLevel:"minor",amountSuggestion:"1.0000",currency:"CNY",evidenceFileIds:[]}),/Forbidden/);
  const preserved=await service.createCase(scope,actor(),{code:`PRESERVE-${hrId.slice(0,8)}`,employeeId,categoryId:category.id,occurredOn:"2026-08-25",factSummary:"敏感字段保留",detailedReason:"仅授权人员可见",impactLevel:"minor",amountSuggestion:"2.5000",currency:"CNY",evidenceFileIds:[]});
  await service.updateDraft(scope,manageOnly,preserved.id,{occurredOn:"2026-08-26",factSummary:"只改普通字段",impactLevel:"normal"});
  assert.deepEqual((await db.query(`SELECT detailed_reason,amount_suggestion::text,currency FROM hr_reward_discipline_case WHERE id=$1`,[preserved.id]))[0],{detailed_reason:"仅授权人员可见",amount_suggestion:"2.5000",currency:"CNY"});
  const noTree=actor(randomUUID(),[HR_PERMISSIONS.HR_REWARD_TEAM_READ]);
  const page=await service.list(scope,noTree,{page:1,page_size:20});assert.equal(page.total,0);
  const existing=(await db.query(`SELECT id FROM hr_reward_discipline_case WHERE employee_id=$1 LIMIT 1`,[employeeId]))[0];
  await assert.rejects(service.detail(scope,noTree,existing.id),/Reward case not found/);
  const scopeDraft=await service.createCase(scope,manageOnly,{code:`SCOPE-${hrId.slice(0,8)}`,employeeId,categoryId:category.id,occurredOn:"2026-08-25",factSummary:"范围测试",impactLevel:"minor",evidenceFileIds:[]});
  await service.act(scope,manageOnly,scopeDraft.id,"submit",{});
  await assert.rejects(service.act(scope,actor(reviewerId,[HR_PERMISSIONS.HR_REWARD_REVIEW]),scopeDraft.id,"approve",{}),/Forbidden/);
  const approved=(await db.query(`SELECT id FROM hr_reward_discipline_case WHERE employee_id=$1 AND status='approved' LIMIT 1`,[employeeId]))[0];
  if(approved)await assert.rejects(service.link(scope,actor(hrId,[HR_PERMISSIONS.HR_REWARD_LINK_PERFORMANCE]),approved.id,{targetType:"performance_reference",targetId:randomUUID(),targetVersion:1}),/Forbidden/);
  const failingAudit=new HrRewardsService(db,{recordOperationRequired:async()=>{throw new Error("required audit unavailable");}} as never);
  await assert.rejects(failingAudit.list(scope,actor(hrId,[HR_PERMISSIONS.HR_REWARD_READ]),{page:999,page_size:20}),/required audit unavailable/);
});

test("self review is rejected and returned case can be corrected resubmitted then withdrawn", { skip: !enabled }, async () => {
  const category = (await db.query(`SELECT id FROM hr_reward_discipline_category WHERE create_by=$1 LIMIT 1`, [hrId]))[0];
  const draft = await service.createCase(scope, actor(), { code: `CASE2-${hrId.slice(0, 8)}`, employeeId, categoryId: category.id, occurredOn: "2026-08-25", factSummary: "流程测试", impactLevel: "minor", evidenceFileIds: [] });
  await service.act(scope, actor(), draft.id, "submit", {});
  await assert.rejects(service.act(scope, actor(employeeUserId), draft.id, "approve", {}), /Self review is not allowed/);
  await service.act(scope, actor(reviewerId), draft.id, "return", { note: "补充事实" });
  await service.updateDraft(scope, actor(), draft.id, { occurredOn: "2026-08-25", factSummary: "已补充事实", impactLevel: "minor", evidenceFileIds: [] });
  await service.act(scope, actor(), draft.id, "resubmit", {});
  await service.act(scope, actor(), draft.id, "withdraw", {});
  assert.equal((await db.query(`SELECT status FROM hr_reward_discipline_case WHERE id=$1`, [draft.id]))[0].status, "withdrawn");
});
