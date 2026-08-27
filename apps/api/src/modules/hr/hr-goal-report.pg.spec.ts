import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {after,before,test} from "node:test";
import {HR_PERMISSIONS} from "@jinhu/shared";
import {DataSource} from "typeorm";
import {UserMessageEntity} from "../workflow/entities/user-message.entity";
import {HrEmployeeEntity,HrWorkReportEntity} from "./entities/hr.entities";
import {HrGoalReportService} from "./hr-goal-report.service";
import {HrNotificationService} from "./hr-notification.service";

const enabled=process.env.HR_GOAL_REPORT_PG_TEST==="1",scope={tenantId:"10000001",parkId:"20000001"};
let db:DataSource,service:HrGoalReportService,managerUser:string,employeeUser:string,managerEmployee:string,employee:string,org:string,childOrg:string,cycle:string,employeeGoal:string;
const actor=(sub:string,permissions:string[])=>({sub,username:"t6-pg",tenantId:scope.tenantId,parkId:scope.parkId,roles:[],permissions});
const parkPermissions=[HR_PERMISSIONS.HR_GOAL_READ,HR_PERMISSIONS.HR_GOAL_MANAGE,HR_PERMISSIONS.HR_GOAL_CYCLE_MANAGE,HR_PERMISSIONS.HR_GOAL_CHANGE,HR_PERMISSIONS.HR_WORK_REPORT_TEAM_READ,HR_PERMISSIONS.HR_WORK_REPORT_REVIEW];
const selfPermissions=[HR_PERMISSIONS.HR_GOAL_SELF_READ,HR_PERMISSIONS.HR_GOAL_CHECKIN,HR_PERMISSIONS.HR_WORK_REPORT_SELF_READ,HR_PERMISSIONS.HR_WORK_REPORT_DRAFT,HR_PERMISSIONS.HR_WORK_REPORT_SUBMIT];
const goal=(name:string,level:string,parentGoalId:string|null,weight:number,ownerOrgId?:string,ownerEmployeeId?:string)=>({cycleId:cycle,parentGoalId:parentGoalId??undefined,goalLevel:level,goalName:name,ownerOrgId,ownerEmployeeId,weight,metricType:"numeric",metricName:"完成数",targetValue:100,unit:"项",startDate:"2026-01-01",dueDate:"2026-12-31"});

before(async()=>{if(!enabled)return;db=new DataSource({type:"postgres",host:process.env.POSTGRES_HOST??"127.0.0.1",port:Number(process.env.POSTGRES_PORT??15432),username:process.env.POSTGRES_USER??"jinhu",password:process.env.POSTGRES_PASSWORD,database:process.env.POSTGRES_DB,entities:[UserMessageEntity,HrEmployeeEntity,HrWorkReportEntity]});await db.initialize();managerUser=randomUUID();employeeUser=randomUUID();managerEmployee=randomUUID();employee=randomUUID();org=randomUUID();childOrg=randomUUID();
 await db.query(`INSERT INTO sys_user(id,tenant_id,park_id,username,display_name,password_hash,status)VALUES($1,$2,$3,$4,'T6主管','not-login','enabled'),($5,$2,$3,$6,'T6员工','not-login','enabled')`,[managerUser,scope.tenantId,scope.parkId,`t6-m-${managerUser.slice(0,8)}`,employeeUser,`t6-e-${employeeUser.slice(0,8)}`]);
 await db.query(`INSERT INTO sys_org(id,tenant_id,park_id,parent_id,org_code,org_name,org_type,leader_user_id,status)VALUES($1,$2,$3,NULL,$4,'T6部门','department',$5,'enabled'),($6,$2,$3,$1,$7,'T6子部门','department',NULL,'enabled')`,[org,scope.tenantId,scope.parkId,`T6-${org.slice(0,8)}`,managerUser,childOrg,`T6-${childOrg.slice(0,8)}`]);
 await db.query(`INSERT INTO hr_employee(id,tenant_id,park_id,employee_code,full_name,user_id,primary_org_id,manager_employee_id,employment_status)VALUES($1,$2,$3,$4,'T6主管',$5,$6,NULL,'active'),($7,$2,$3,$8,'T6员工',$9,$10,$1,'active')`,[managerEmployee,scope.tenantId,scope.parkId,`T6M-${managerEmployee.slice(0,8)}`,managerUser,org,employee,`T6E-${employee.slice(0,8)}`,employeeUser,childOrg]);
 service=new HrGoalReportService(db,new HrNotificationService(db.getRepository(UserMessageEntity)),{recordOperationRequired:async()=>undefined} as never);
 const c=await service.createCycle(scope,actor(managerUser,parkPermissions),{cycleCode:`T6-${managerUser.slice(0,8)}`,cycleName:"T6执行周期",startDate:"2026-01-01",endDate:"2026-12-31"});cycle=c.id;
});
after(async()=>{if(enabled&&db?.isInitialized)await db.destroy();});

test("database serializes root and child sibling weights and enforces hierarchy",{skip:!enabled},async()=>{
 const root=await service.createGoal(scope,actor(managerUser,parkPermissions),goal("集团目标","group",null,.4)) as {id:string};
 const roots=await Promise.allSettled([service.createGoal(scope,actor(managerUser,parkPermissions),goal("集团并发A","group",null,.4)),service.createGoal(scope,actor(managerUser,parkPermissions),goal("集团并发B","group",null,.4))]);assert.equal(roots.filter(x=>x.status==="fulfilled").length,1);
 const department=await service.createGoal(scope,actor(managerUser,parkPermissions),goal("部门目标","department",root.id,.4,org)) as {id:string};
 const children=await Promise.allSettled([service.createGoal(scope,actor(managerUser,parkPermissions),goal("子部门并发A","department",department.id,.6,childOrg)),service.createGoal(scope,actor(managerUser,parkPermissions),goal("子部门并发B","department",department.id,.6,childOrg))]);assert.equal(children.filter(x=>x.status==="fulfilled").length,1);
 await assert.rejects(service.createGoal(scope,actor(managerUser,parkPermissions),goal("越级员工","employee",root.id,.1,undefined,employee)),/invalid goal hierarchy/);
 const e=await service.createGoal(scope,actor(managerUser,parkPermissions),goal("员工目标","employee",department.id,.4,undefined,employee)) as {id:string};employeeGoal=e.id;
 await service.cycleAction(scope,actor(managerUser,parkPermissions),cycle,{action:"activate"});
 await service.goalAction(scope,actor(managerUser,parkPermissions),root.id,{action:"activate",reason:"开始执行"});
 await service.goalAction(scope,actor(managerUser,parkPermissions),department.id,{action:"activate",reason:"开始执行"});
 await service.goalAction(scope,actor(managerUser,parkPermissions),employeeGoal,{action:"activate",reason:"开始执行"});
 await assert.rejects(db.query(`UPDATE hr_goal_cycle SET status='closed' WHERE id=$1`,[cycle]),/open goals/);
 await assert.rejects(db.query(`UPDATE hr_goal SET status='draft' WHERE id=$1`,[employeeGoal]),/invalid goal transition/);
});

test("self route cannot widen to park scope and check-in aggregates without client parent progress",{skip:!enabled},async()=>{
 const mixed=actor(employeeUser,[...selfPermissions,HR_PERMISSIONS.HR_GOAL_READ]);const mine=await service.listSelfGoals(scope,mixed,{});assert.ok(mine.length>0);assert.ok(mine.every((x:{ownerEmployeeId:string|null})=>x.ownerEmployeeId===employee));
 const before=(await db.query(`SELECT progress::text FROM hr_goal WHERE id=(SELECT parent_goal_id FROM hr_goal WHERE id=$1)`,[employeeGoal]))[0].progress;
 await service.checkin(scope,actor(employeeUser,selfPermissions),employeeGoal,{progress:.8,currentValue:80,summary:"完成主要任务",risks:"供应风险",confidence:"medium",nextAction:"完成验收"});
 const after=(await db.query(`SELECT progress::text FROM hr_goal WHERE id=(SELECT parent_goal_id FROM hr_goal WHERE id=$1)`,[employeeGoal]))[0].progress;assert.notEqual(after,before);assert.equal((await db.query(`SELECT count(*) value FROM hr_goal_action WHERE goal_id=(SELECT parent_goal_id FROM hr_goal WHERE id=$1) AND action_type='aggregated'`,[employeeGoal]))[0].value,"1");
});

test("draft submit concurrent review resubmit and confirmation are atomic and immutable",{skip:!enabled},async()=>{
 const self=actor(employeeUser,selfPermissions),manager=actor(managerUser,parkPermissions);const draft=await service.createDraft(scope,self,{reportType:"daily",periodStart:"2026-08-25",periodEnd:"2026-08-25",title:"阶段工作日报",completedWork:"完成阶段任务",questionsAndSuggestions:"建议主管确认资源安排",hours:8,goalSuggestions:[{goalId:employeeGoal,proposedProgress:.9,suggestionSummary:"建议主管确认"}]}) as {id:string;status:string};assert.equal(draft.status,"draft");
 const progressBefore=(await db.query(`SELECT progress::text FROM hr_goal WHERE id=$1`,[employeeGoal]))[0].progress;await service.submit(scope,self,draft.id);assert.equal((await db.query(`SELECT count(*) value FROM biz_user_message WHERE source_id=$1 AND action='review'`,[draft.id]))[0].value,"1");
 await assert.rejects(db.query(`UPDATE hr_work_report_goal SET proposed_progress=.1 WHERE report_id=$1`,[draft.id]),/suggestions are immutable/);
 const race=await Promise.allSettled([service.review(scope,manager,draft.id,{action:"returned",comment:"补充证据"}),service.review(scope,manager,draft.id,{action:"confirmed"})]);assert.equal(race.filter(x=>x.status==="fulfilled").length,1);
 let row=(await db.query(`SELECT status FROM hr_work_report WHERE id=$1`,[draft.id]))[0];if(row.status==="returned"){await service.updateDraft(scope,self,draft.id,{reportType:"daily",periodStart:"2026-08-25",periodEnd:"2026-08-25",title:"阶段工作日报（补证）",completedWork:"完成阶段任务并补证",questionsAndSuggestions:"已补充主管要求的证据",hours:8,goalSuggestions:[{goalId:employeeGoal,proposedProgress:.95,suggestionSummary:"补证后建议"}]});await service.submit(scope,self,draft.id);await service.review(scope,manager,draft.id,{action:"confirmed"});}
 row=(await db.query(`SELECT status,submission_no FROM hr_work_report WHERE id=$1`,[draft.id]))[0];assert.equal(row.status,"confirmed");await assert.rejects(db.query(`UPDATE hr_work_report SET completed_work='tamper' WHERE id=$1`,[draft.id]),/immutable/);await assert.rejects(db.query(`DELETE FROM hr_work_report WHERE id=$1`,[draft.id]),/immutable/);await assert.rejects(db.query(`UPDATE hr_work_report_action SET comment='tamper' WHERE report_id=$1`,[draft.id]),/append-only/);
 assert.equal((await db.query(`SELECT progress::text FROM hr_goal WHERE id=$1`,[employeeGoal]))[0].progress,progressBefore);const actions=await service.reportActions(scope,self,draft.id);assert.ok(actions.length>=3);const frozen=(await db.query(`SELECT snapshot->'goalSuggestions' suggestions FROM hr_work_report_action WHERE report_id=$1 AND action_type IN('submitted','resubmitted') ORDER BY create_time DESC LIMIT 1`,[draft.id]))[0].suggestions;assert.equal(frozen[0].goalId,employeeGoal);
 const projected=(await service.myReports(scope,self))[0] as Record<string,unknown>;assert.equal("employeeId" in projected,false);assert.ok(Array.isArray(projected.goalSuggestions));
});

test("legacy work-log cancellation soft deletes only an author draft and preserves its action",{skip:!enabled},async()=>{
 const self=actor(employeeUser,selfPermissions);const draft=await service.createDraft(scope,self,{reportType:"daily",periodStart:"2026-08-26",periodEnd:"2026-08-26",title:"可撤销草稿",completedWork:"尚未提交",questionsAndSuggestions:"待补充"}) as {id:string};
 assert.deepEqual(await service.cancel(scope,self,draft.id),{id:draft.id,cancelled:true});
 const row=(await db.query(`SELECT is_deleted,title,questions_and_suggestions FROM hr_work_report WHERE id=$1`,[draft.id]))[0];assert.equal(row.is_deleted,true);assert.equal(row.title,"可撤销草稿");assert.equal(row.questions_and_suggestions,"待补充");
 assert.equal((await db.query(`SELECT count(*) value FROM hr_work_report_action WHERE report_id=$1 AND action_type='cancelled'`,[draft.id]))[0].value,"1");
 await assert.rejects(service.cancel(scope,self,draft.id),/not found/i);await assert.rejects(db.query(`DELETE FROM hr_work_report WHERE id=$1`,[draft.id]),/physical deletion is forbidden/);
});

test("period, scope and required audit fail closed",{skip:!enabled},async()=>{
 const self=actor(employeeUser,selfPermissions);await assert.rejects(service.createDraft(scope,self,{reportType:"weekly",periodStart:"2026-08-25",periodEnd:"2026-08-30",completedWork:"错误周期"}),/Monday through Sunday/);assert.deepEqual(await service.listGoals(scope,actor(employeeUser,[]),{}),[]);
 const failing=new HrGoalReportService(db,new HrNotificationService(db.getRepository(UserMessageEntity)),{recordOperationRequired:async()=>{throw new Error("required audit unavailable");}} as never);await assert.rejects(failing.myReports(scope,self),/required audit unavailable/);
});
