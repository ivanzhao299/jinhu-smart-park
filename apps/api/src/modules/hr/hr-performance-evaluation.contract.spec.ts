import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import test from "node:test";
import {HR_PERMISSIONS} from "@jinhu/shared";
import {HrPerformanceEvaluationService} from "./hr-performance-evaluation.service";

const root=resolve(__dirname,"../../../../..");
const read=(path:string)=>readFileSync(resolve(root,path),"utf8");
const migration=read("database/migrations/000259_hr_performance_review_calibration.sql");
const controller=read("apps/api/src/modules/hr/hr-performance-review.controller.ts");
const service=read("apps/api/src/modules/hr/hr-performance-evaluation.service.ts");
const seed=read("database/seeds/production/000025_hr_performance_review_rbac.sql");
const web=read("apps/web/app/hr/performance/HrPerformanceClient.tsx");

test("phase2-B owns append-only review, calibration, acknowledgement and appeal evidence",()=>{
 for(const table of ["hr_performance_review_submission","hr_performance_calibration_batch","hr_performance_calibration_participant","hr_performance_calibration_entry","hr_performance_appeal","hr_performance_review_action"])assert.match(migration,new RegExp(`CREATE TABLE ${table}`));
 assert.match(migration,/performance review evidence is append-only/);
 assert.match(migration,/confirmed performance result is immutable/);
 assert.match(migration,/result cannot be finalized before calibration/);
 assert.doesNotMatch(migration,/UPDATE hr_(payroll|payslip|attendance|employee)\b/);
 for(const name of ["submission_actor_user","calibration_batch_creator","calibration_batch_completer","calibration_participant_user","calibration_entry_actor","appeal_submitter","appeal_resolver","review_action_actor_user"]){assert.match(migration,new RegExp(`fk_hr_perf_${name} FOREIGN KEY\\(tenant_id,park_id,`));assert.match(migration,new RegExp(`idx_hr_perf_${name} ON .*\\(tenant_id,park_id,`));}
});

test("all performance POST routes are replay-aware, exactly authorized and body-free audited",()=>{
 for(const atom of ["HR_PERFORMANCE_SELF_REVIEW","HR_PERFORMANCE_MANAGER_REVIEW","HR_PERFORMANCE_CALIBRATE","HR_PERFORMANCE_ACKNOWLEDGE","HR_PERFORMANCE_APPEAL","HR_PERFORMANCE_APPEAL_REVIEW"])assert.match(controller,new RegExp(`RequirePermissions\\(HR_PERMISSIONS\\.${atom}\\)`));
 const posts=controller.split('@Post(').slice(1);
 for(const route of posts){assert.match(route,/UseInterceptors\(new IdempotencyInterceptor\(\)\)/);assert.match(route,/captureBody:false/);}
});

test("server computes frozen scores and employee projection hides premature manager and final results",()=>{
 assert.match(service,/hr_performance_snapshot_score/);
 assert.match(service,/FOR UPDATE OF ce,c/);
 assert.match(service,/actor\.id===ce\.employee_id\|\|actor\.id!==ce\.manager_employee_id/);
 assert.match(service,/employee&&!reveal\?null:r\.manager_scores/);
 assert.match(service,/result:reveal&&r\.final_score!==null/);
 assert.doesNotMatch(controller,/finalScore|totalScore/);
 assert.doesNotMatch(web,/name=["'`]?(finalScore|totalScore)/);
});

test("least-privilege seed and three-role mobile workbench are explicit",()=>{
 assert.match(seed,/hr:performance:appeal_review/);
 assert.match(seed,/DEPARTMENT_MANAGER','hr:performance:manager_review/);
 assert.match(seed,/EMPLOYEE_SELF_SERVICE','hr:performance:self_review/);
 assert.match(seed,/broad permission leaked/);
 for(const token of ["ds-page","ds-hero","ds-panel","ds-kpi-grid","ds-mobile-record-list","ds-mobile-record","AbortController","generation.current","performanceCalibrationOptionsV2"])assert.match(web,new RegExp(token.replace(".","\\.")));
 assert.doesNotMatch(web,/hrApi\.employees/);
});

test("direct service read with no atom fails closed without touching the database",async()=>{
 let queries=0;
 const db={query:async()=>{queries++;throw new Error("database must not be reached");}};
 const serviceInstance=new HrPerformanceEvaluationService(db as never,{recordOperationRequired:async()=>undefined} as never);
 const actor={sub:"user",username:"user",tenantId:"tenant",parkId:"park",roles:[],permissions:[]};
 assert.deepEqual(await serviceInstance.reviews({tenantId:"tenant",parkId:"park"},actor,{}),[]);
 assert.deepEqual(await serviceInstance.batches({tenantId:"tenant",parkId:"park"},actor),[]);
 assert.equal(queries,0);
});

test("required audit failure blocks scoped evaluation reads",async()=>{
 const failure=new Error("required audit unavailable");
 const serviceInstance=new HrPerformanceEvaluationService({query:async()=>[]} as never,{recordOperationRequired:async()=>{throw failure;}} as never);
 const actor={sub:"user",username:"user",tenantId:"tenant",parkId:"park",roles:[],permissions:[HR_PERMISSIONS.HR_PERFORMANCE_READ]};
 await assert.rejects(()=>serviceInstance.reviews({tenantId:"tenant",parkId:"park"},actor,{}),failure);
});

test("employee projection reveals no manager, calibration or final result before acknowledgement",()=>{
 const serviceInstance=new HrPerformanceEvaluationService({} as never,{} as never) as unknown as {projection:(row:Record<string,unknown>,actor:Record<string,unknown>,access:string)=>Record<string,unknown>};
 const actor={sub:"employee",permissions:[HR_PERMISSIONS.HR_PERFORMANCE_SELF_REVIEW]};
 const base={id:"review",cycle_id:"cycle",cycle_name:"Cycle",employee_id:"employee",employee_snapshot:{employeeCode:"E1",fullName:"员工"},dimensions:[],self_scores:{result:80},self_score:80,manager_scores:{result:90},manager_score:90,calibration_scores:{result:95},calibrated_score:95,final_score:95,final_level_code:"A",final_level_name:"优秀"};
 const hidden=serviceInstance.projection({...base,status:"calibration"},actor,"self");
 assert.equal(hidden.managerSubmission,null);
 assert.equal(hidden.calibration,null);
 assert.equal(hidden.result,null);
 const revealed=serviceInstance.projection({...base,status:"employee_acknowledged"},actor,"self");
 assert.notEqual(revealed.managerSubmission,null);
 assert.notEqual(revealed.calibration,null);
 assert.deepEqual(revealed.result,{score:"95",levelCode:"A",levelName:"优秀"});
});

test("server projects exact per-record actions and forbids self calibration or appeal review",()=>{
 const serviceInstance=new HrPerformanceEvaluationService({} as never,{} as never) as unknown as {projection:(row:Record<string,unknown>,actor:Record<string,unknown>,access:string)=>Record<string,unknown>};
 const actor={sub:"manager-user",permissions:[HR_PERMISSIONS.HR_PERFORMANCE_MANAGER_REVIEW,HR_PERMISSIONS.HR_PERFORMANCE_APPEAL_REVIEW]};
 const base={id:"review",cycle_id:"cycle",cycle_name:"Cycle",employee_id:"employee",employee_snapshot:{},dimensions:[],user_id:"employee-user",manager_user_id:"manager-user"};
 assert.deepEqual(serviceInstance.projection({...base,status:"manager_review"},actor,"managed_org_tree").actions,{selfReview:false,managerReview:true,acknowledge:false,appeal:false,resolveAppeal:false});
 assert.deepEqual(serviceInstance.projection({...base,status:"appealed",user_id:"manager-user"},actor,"park").actions,{selfReview:false,managerReview:false,acknowledge:false,appeal:false,resolveAppeal:false});
 assert.match(service,/Self-calibration is not allowed/);
 assert.match(service,/cannot finalize their own performance result/);
 assert.match(service,/Self-review of a performance appeal is not allowed/);
});

test("calibration reads are required-audited and batches expose capability instead of participant identities",()=>{
 assert.match(service,/读取绩效校准参会选项/);
 assert.match(service,/读取绩效校准批次/);
 assert.match(service,/"canAct"/);
 assert.doesNotMatch(service,/"participantUserIds"/);
 assert.match(web,/x\.status==="active"&&x\.canAct/);
});
