import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import {plainToInstance} from "class-transformer";
import {validate} from "class-validator";
import {HR_PERMISSIONS} from "@jinhu/shared";
import {BadRequestException,ForbiddenException,NotFoundException,ValidationPipe} from "@nestjs/common";
import {ANY_PERMISSIONS_KEY,PERMISSIONS_KEY} from "../../shared/decorators/permissions.decorator";
import {HrLifecycleController} from "./hr-lifecycle.controller";
import {HrLifecycleService} from "./hr-lifecycle.service";
import {CreateHrLifecycleTemplateDto,CreateHrLifecycleTemplateVersionDto} from "./dto/hr-lifecycle.dto";
import type {JwtPrincipal} from "../../shared/types/jwt-principal";
const scope={tenantId:"tenant",parkId:"park"};
const actor=(permissions:string[]):JwtPrincipal=>({...scope,sub:"synthetic",username:"synthetic",roles:[],permissions});
const assign=actor([HR_PERMISSIONS.HR_LIFECYCLE_ASSIGN]),manager=actor([HR_PERMISSIONS.HR_LIFECYCLE_TEMPLATE_MANAGE]);
function fixture(rows:unknown[]=[]){const calls:Array<{sql:string;values:unknown[]}>=[];const service=new HrLifecycleService({query:async(sql:string,values:unknown[])=>{calls.push({sql,values});return rows;}} as never,{} as never,{} as never);return {service,calls};}
test("assignment-only candidate authority is independent of old template list and editing",async()=>{
 const row={id:"template",code:"SYN",name:"Synthetic",type:"onboarding",versionId:"version",versionNo:2,itemCount:3}, {service,calls}=fixture([row]);assert.deepEqual(await service.templateOptions(scope,assign),[row]);assert.deepEqual(calls[0]!.values,[scope.tenantId,scope.parkId]);assert.match(calls[0]!.sql,/status='published'/);assert.match(calls[0]!.sql,/t.is_deleted=false AND t.status='enabled'/);assert.doesNotMatch(calls[0]!.sql,/jsonb_agg|item_name/);
 await assert.rejects(service.listTemplates(scope,assign),ForbiddenException);await assert.rejects(service.templateDetail(scope,assign,"template"),ForbiddenException);
 assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY,HrLifecycleController.prototype.templateOptions),[HR_PERMISSIONS.HR_LIFECYCLE_ASSIGN]);assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY,HrLifecycleController.prototype.templateDetail),[HR_PERMISSIONS.HR_LIFECYCLE_TEMPLATE_MANAGE]);assert.deepEqual(Reflect.getMetadata(ANY_PERMISSIONS_KEY,HrLifecycleController.prototype.listTemplates),[HR_PERMISSIONS.HR_LIFECYCLE_READ,HR_PERMISSIONS.HR_LIFECYCLE_TEMPLATE_MANAGE]);
});
test("manager detail selects one current published scoped immutable item projection",async()=>{
 const items=[{code:"ONE",name:"One",category:"documents",defaultDueDays:0,required:false}],{service,calls}=fixture([{id:"template",items,versionNo:2}]);assert.deepEqual(await service.templateDetail(scope,manager,"template"),{id:"template",items,versionNo:2,itemCount:1});assert.deepEqual(calls[0]!.values,[scope.tenantId,scope.parkId,"template"]);assert.match(calls[0]!.sql,/ORDER BY version_no DESC LIMIT 1/);assert.match(calls[0]!.sql,/ORDER BY i.sequence_no,i.id/);assert.match(calls[0]!.sql,/i.tenant_id=t.tenant_id AND i.park_id=t.park_id/);assert.doesNotMatch(calls[0]!.sql,/SELECT \*/);
 const missing=fixture();await assert.rejects(missing.service.templateDetail(scope,manager,"foreign"),NotFoundException);
});
test("new reads reject unrelated capabilities and actor scope mismatch before queries",async()=>{
 for(const denied of [actor([]),actor([HR_PERMISSIONS.HR_LIFECYCLE_SELF_READ]),actor([HR_PERMISSIONS.HR_LIFECYCLE_READ]),{...assign,tenantId:"foreign"},{...assign,parkId:"foreign"}]){const {service,calls}=fixture();await assert.rejects(service.templateOptions(scope,denied),ForbiddenException);assert.equal(calls.length,0);}
 for(const denied of [assign,actor([HR_PERMISSIONS.HR_LIFECYCLE_READ]),{...manager,tenantId:"foreign"},{...manager,parkId:"foreign"}]){const {service,calls}=fixture();await assert.rejects(service.templateDetail(scope,denied,"template"),ForbiddenException);assert.equal(calls.length,0);}
});
const item=(index=1)=>({code:`SYN-${index}`,name:`合成任务${index}`,category:"documents",defaultDueDays:0,required:false});
test("create/version DTOs enforce1..50 unique nonblank task fields and exact offset bounds",async()=>{
 for(const Kind of [CreateHrLifecycleTemplateDto,CreateHrLifecycleTemplateVersionDto]){
  const base=Kind===CreateHrLifecycleTemplateDto?{code:"SYN",name:"合成模板",type:"onboarding"}:{};
  for(const items of [[],Array.from({length:51},(_,i)=>item(i)),[item(),{...item(),code:" SYN-1 "}],[{...item(),name:" "}],[{...item(),category:" "}],[{...item(),code:" "}],[{...item(),defaultDueDays:366}],[{...item(),defaultDueDays:-366}],[{...item(),defaultDueDays:0.5}]])assert.ok((await validate(plainToInstance(Kind,{...base,items}))).length);
  assert.equal((await validate(plainToInstance(Kind,{...base,items:Array.from({length:50},(_,i)=>({...item(i),defaultDueDays:i%2?365:-365}))}))).length,0);
 }
});
test("real HTTP validation pipe rejects malformed nested template items",async()=>{
 const pipe=new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true});
 for(const metatype of [CreateHrLifecycleTemplateDto,CreateHrLifecycleTemplateVersionDto]){
  const base=metatype===CreateHrLifecycleTemplateDto?{code:"SYN",name:"合成模板",type:"onboarding"}:{};
  for(const items of [[null],["invalid"],[{}],[{...item(),required:"false"}],[{...item(),extra:"unknown"}]])await assert.rejects(pipe.transform({...base,items},{type:"body",metatype}),BadRequestException);
 }
});
