import "reflect-metadata";
import assert from "node:assert/strict";
import {describe,it} from "node:test";
import {ValidationPipe} from "@nestjs/common";
import {HrWorkCalendarDateDto,HrWorkCalendarHistoryDto,HrWorkCalendarRangeDto,PutHrWorkCalendarDto} from "./dto/hr-attendance-work-calendar.dto";
import {HrAttendanceWorkCalendarService} from "./hr-attendance-work-calendar.service";
import {HrAttendanceWorkCalendarController} from "./hr-attendance-work-calendar.controller";
import type {DataSource} from "typeorm";
import type {AuditService} from "../audit/audit.service";
import type {JwtPrincipal} from "../../shared/types/jwt-principal";
const pipe=new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true});
const scope={tenantId:"10000001",parkId:"20000001"};
const actor={...scope,sub:"00000000-0000-4000-8000-00000000da01",permissions:["hr:attendance:operate"],roles:[],username:"synthetic"} as JwtPrincipal;
describe("Work calendar API contracts",()=>{
 it("validates actual date paths, range and trimmed full write DTOs",async()=>{
  const check=(value:unknown,metatype:typeof PutHrWorkCalendarDto|typeof HrWorkCalendarDateDto|typeof HrWorkCalendarRangeDto|typeof HrWorkCalendarHistoryDto)=>pipe.transform(value,{type:"body",metatype});
  const body={expectedVersion:0,dayKind:"working",dayName:" 调休上班 ",reason:" HR确认 "};
  assert.equal((await check(body,PutHrWorkCalendarDto)).dayName,"调休上班");
  for(const change of [{expectedVersion:null},{expectedVersion:-1},{expectedVersion:1.1},{dayKind:"weekend"},{dayName:" "},{reason:" "},{expectedVersion:"0"},{extra:true}])await assert.rejects(check({...body,...change},PutHrWorkCalendarDto));
  for(const date of ["2026-02-29","2026-07-01T00:00:00Z","2200-01-01","../history",null])await assert.rejects(check({date},HrWorkCalendarDateDto));
  assert.equal((await check({date:"2028-02-29"},HrWorkCalendarDateDto)).date,"2028-02-29");
  assert.equal((await check({page:"2",page_size:"20"},HrWorkCalendarHistoryDto)).page,2);
  await assert.rejects(check({page:0},HrWorkCalendarHistoryDto));
  await assert.rejects(check({page_size:null},HrWorkCalendarHistoryDto));
 });
 it("rejects mismatched principal or action permission before querying",async()=>{
  let calls=0;const db={query:async()=>{calls++;return []}} as unknown as DataSource;
  const service=new HrAttendanceWorkCalendarService(db,{} as AuditService);
  for(const a of [{...actor,permissions:[]},{...actor,parkId:"foreign"},{...actor,tenantId:"foreign",isSuper:true}])await assert.rejects(service.list(scope,a,{from:"2026-07-01",to:"2026-07-31"}),/权限不足/);
  await assert.rejects(service.list(scope,actor,{from:"2026-07-02",to:"2026-07-01"}),/366/);
  await assert.rejects(service.list(scope,actor,{from:"2025-01-01",to:"2026-01-02"}),/366/);
  await assert.rejects(service.list(scope,actor,{from:"2026-02-29",to:"2026-03-01"}),/有效日期/);
  assert.equal(calls,0);
 });
 it("does not replace a read or required read-audit failure with an empty calendar",async()=>{
  const db={query:async()=>[]} as unknown as DataSource;
  const audit={recordOperationRequired:async()=>{throw new Error("read audit failure")}} as unknown as AuditService;
  await assert.rejects(new HrAttendanceWorkCalendarService(db,audit).list(scope,actor,{from:"2026-07-01",to:"2026-07-31"}),/read audit failure/);
 });
 it("keeps every route on attendance operation authority and actual replay interceptor",()=>{
  for(const name of ["list","history","put"] as const){const handler=HrAttendanceWorkCalendarController.prototype[name];assert.ok(Reflect.getMetadataKeys(handler).length>0);const metadata=Reflect.getMetadataKeys(handler).map(key=>Reflect.getMetadata(key,handler));assert.ok(metadata.some(value=>Array.isArray(value)&&value.includes("hr:attendance:operate")));}
  const values=Reflect.getMetadataKeys(HrAttendanceWorkCalendarController.prototype.put).map(key=>Reflect.getMetadata(key,HrAttendanceWorkCalendarController.prototype.put));
  assert.ok(values.some(value=>Array.isArray(value)&&value.some(item=>item?.constructor?.name==="IdempotencyInterceptor")));
 });
});
