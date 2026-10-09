import "reflect-metadata";
import assert from "node:assert/strict";
import {test} from "node:test";
import {plainToInstance} from "class-transformer";
import {validate} from "class-validator";
import {HR_PERMISSIONS as H} from "@jinhu/shared";
import {ChangeHrGoalDto} from "./dto/hr-goal-report.dto";
import {HrGoalReportService} from "./hr-goal-report.service";
const scope={tenantId:"tenant",parkId:"park"},actor={...scope,sub:"actor",username:"synthetic",roles:[],permissions:[H.HR_GOAL_CHANGE,H.HR_GOAL_READ]};
const row={id:"goal",cycle_id:"cycle",parent_goal_id:null,goal_level:"department",goal_name:"目标",owner_org_id:"own",owner_employee_id:null,current_version_no:2,status:"active",weight:"1",metric_type:"count",metric_name:"完成数",unit:"项",progress:"0.4",current_value:"4",target_value:"10",start_date:"2026-10-01",due_date:"2026-10-31"};
const body={cycleId:"cycle",goalLevel:"department",goalName:"调整后",ownerOrgId:"own",weight:1,metricType:"count",metricName:"完成数",targetValue:null,unit:"项",startDate:"2026-10-01",dueDate:"2026-10-31",expectedVersionNo:2,changeReason:" 调整周期口径 "} as ChangeHrGoalDto;
function fixture(options:{current?:Partial<typeof row>;outside?:boolean;deniedOrg?:string;auditError?:boolean}={}){
 const queries:Array<{sql:string;args:unknown[]}>=[],audits:Array<Record<string,unknown>>=[];
 const manager={query:async(sql:string,args:unknown[]=[])=>{queries.push({sql,args});if(sql.startsWith("SELECT * FROM hr_goal WHERE"))return[{...row,...options.current}];if(sql.startsWith("SELECT id FROM sys_org"))return options.outside||args[2]===options.deniedOrg?[]:[{id:"own"}];if(sql.startsWith("SELECT employee_id"))return[{employee_id:"existing"}];if(sql.startsWith("UPDATE hr_goal SET"))return[[{...row,current_version_no:3,goal_name:body.goalName,target_value:null}],1];return[];}};
 const service=new HrGoalReportService({transaction:async(...args:unknown[])=>{const work=args.at(-1) as (m:unknown)=>unknown;return work(manager);}} as never,{} as never,{recordOperationRequired:async(input:Record<string,unknown>,m:unknown)=>{assert.equal(m,manager);if(options.auditError)throw Error("audit unavailable");audits.push(input);}} as never);
 return{service,queries,audits};
}
test("goal change rejects unrelated permission, missing version and blank reason before database access",async()=>{
 for(const permissions of [[],[H.HR_GOAL_READ],[H.HR_GOAL_MANAGE]]){const f=fixture();await assert.rejects(f.service.changeGoal(scope,{...actor,permissions},"goal",body),/change permission/);assert.equal(f.queries.length,0);}
 for(const invalid of [{expectedVersionNo:0},{changeReason:"  "}]){const f=fixture();await assert.rejects(f.service.changeGoal(scope,actor,"goal",{...body,...invalid}));assert.equal(f.queries.length,0);}
});
test("goal change checks original ownership before moving into a writable scope",async()=>{
 const f=fixture({outside:true});await assert.rejects(f.service.changeGoal(scope,{...actor,permissions:[H.HR_GOAL_CHANGE]},"goal",body),/outside/);assert.equal(f.queries.some(q=>q.sql.startsWith("UPDATE")),false);assert.equal(f.audits.length,0);
});
test("stale definition and terminal state reject without writes",async()=>{
 for(const current of [{current_version_no:3},{status:"completed"},{status:"cancelled"}]){const f=fixture({current});await assert.rejects(f.service.changeGoal(scope,actor,"goal",body));assert.equal(f.queries.some(q=>q.sql.startsWith("UPDATE")||q.sql.startsWith("INSERT")),false);}
});
test("definition change retains execution values and unchanged collaborators, appends version and transactional audit",async()=>{
 for(const collaboratorEmployeeIds of [undefined,["existing","existing"]]){const f=fixture();const result=await f.service.changeGoal(scope,actor,"goal",{...body,collaboratorEmployeeIds});assert.equal(result.progress,"0.4");assert.equal(result.currentValue,"4");assert.equal(result.currentVersionNo,3);assert.equal(f.queries.some(q=>q.sql.startsWith("UPDATE hr_goal_collaborator")||q.sql.startsWith("INSERT INTO hr_goal_collaborator")),false);const version=f.queries.find(q=>q.sql.startsWith("INSERT INTO hr_goal_version"))!;assert.deepEqual((version.args[4] as Record<string,unknown>).collaboratorEmployeeIds,["existing"]);assert.equal(version.args[5],"调整周期口径");assert.deepEqual(f.audits[0]?.beforeJson,{versionNo:2,collaboratorCount:1});assert.deepEqual(f.audits[0]?.afterJson,{versionNo:3,collaboratorCount:1});assert.equal(Object.hasOwn(result,"version"),false);}
});
test("required change audit failure rejects the transaction",async()=>{const f=fixture({auditError:true});await assert.rejects(f.service.changeGoal(scope,actor,"goal",body),/audit unavailable/);});
test("goal change DTO preserves null target and requires a positive domain version",async()=>{
 const valid={...body,cycleId:"11111111-1111-4111-8111-111111111111",ownerOrgId:"22222222-2222-4222-8222-222222222222"};
 const dto=plainToInstance(ChangeHrGoalDto,valid);assert.equal(dto.targetValue,null);assert.equal((await validate(dto)).length,0);
 for(const expectedVersionNo of [undefined,0,1.5])assert.ok((await validate(plainToInstance(ChangeHrGoalDto,{...valid,expectedVersionNo}))).some(e=>e.property==="expectedVersionNo"));
});

test("new ownership is independently checked after original scope succeeds",async()=>{const f=fixture({deniedOrg:"outside"});await assert.rejects(f.service.changeGoal(scope,{...actor,permissions:[H.HR_GOAL_CHANGE]},"goal",{...body,ownerOrgId:"outside"}),/outside/);assert.equal(f.queries.some(q=>q.sql.startsWith("UPDATE")||q.sql.startsWith("INSERT")),false);});
test("change context and version detail need exact CHANGE before any query",async()=>{for(const permissions of [[],[H.HR_GOAL_READ],[H.HR_GOAL_MANAGE]]){const f=fixture();await assert.rejects(f.service.changeGoalContext(scope,{...actor,permissions}),/change permission/);await assert.rejects(f.service.goalChangeDetail(scope,{...actor,permissions},"goal"),/change permission/);assert.equal(f.queries.length,0);}});
