import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import {Module,ValidationPipe} from "@nestjs/common";
import {NestFactory,Reflector} from "@nestjs/core";
import {HR_PERMISSIONS as H} from "@jinhu/shared";
import {PermissionGuard} from "../../shared/guards/permission.guard";
import {HrGoalReportController} from "./hr-goal-report.controller";
import {HrGoalReportService} from "./hr-goal-report.service";

test("HTTP goal/report ledger routes apply DTO and permission guard before service probes",async()=>{
 const calls:string[]=[],actor={sub:"reader",username:"synthetic",tenantId:"tenant",parkId:"park",roles:[],permissions:[H.HR_GOAL_SELF_READ,H.HR_WORK_REPORT_SELF_READ] as string[]};
 const service={exportGoalLedger:async()=>{calls.push("goal");return{items:[],total:0,snapshotAt:"2026-10-16T00:00:00.000Z"};},exportGoalCheckinLedger:async()=>{calls.push("checkin");return{items:[],total:0,snapshotAt:"2026-10-16T00:00:00.000Z"};},exportWorkReportLedger:async()=>{calls.push("report");return{items:[],total:0,snapshotAt:"2026-10-16T00:00:00.000Z"};}};
 class Fixture{} Module({controllers:[HrGoalReportController],providers:[{provide:HrGoalReportService,useValue:service}]})(Fixture);
 const app=await NestFactory.create(Fixture,{logger:false});app.setGlobalPrefix("api/v1");app.use((req:{user?:unknown;header:(name:string)=>string|undefined},_res:unknown,next:()=>void)=>{req.user=req.header("x-fixture-user")==="none"?{...actor,permissions:[]}:actor;next();});app.useGlobalGuards(new PermissionGuard(new Reflector()));app.useGlobalPipes(new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true}));
 try{await app.listen(0,"127.0.0.1");const base=await app.getUrl(),get=(path:string,user="reader")=>fetch(`${base}/api/v1/hr/${path}`,{headers:{"x-fixture-user":user}});
  assert.equal((await get("goals/ledger-export?status=invalid")).status,400);assert.equal(calls.length,0);
  assert.equal((await get("goals/ledger-export","none")).status,403);assert.equal(calls.length,0);
  assert.equal((await get("goals/ledger-export")).status,200);assert.equal((await get("work-reports/me/ledger-export?status=draft")).status,200);assert.deepEqual(calls,["goal","report"]);
 }finally{await app.close();}
});
