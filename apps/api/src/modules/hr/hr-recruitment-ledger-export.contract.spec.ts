import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { HrCandidateExportDto, HrRequisitionExportDto } from "./dto/hr-recruitment.dto";
import { HR_PERMISSIONS as H } from "@jinhu/shared";
import { ANY_PERMISSIONS_KEY, PERMISSIONS_KEY } from "../../shared/decorators/permissions.decorator";
import { HrRecruitmentController } from "./hr-recruitment.controller";

test("recruitment export DTOs reject pagination, unknown enums and oversized keywords",async()=>{
 const pipe=new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true});
 for(const [metatype,field,value] of [[HrCandidateExportDto,"stage","screening"],[HrRequisitionExportDto,"status","open"]] as const){
  const meta={type:"query" as const,metatype};const valid=await pipe.transform({keyword:" SYN ",[field]:value},meta);assert.equal(valid.keyword,"SYN");assert.equal(valid[field],value);
  for(const body of [{page:1},{keyword:"x".repeat(101)},{[field]:"invalid"},{keyword:42}])await assert.rejects(pipe.transform(body,meta),BadRequestException);
 }
});
test("static export routes resolve before dynamic IDs before dynamic ID handlers",async()=>{
 const proto=HrRecruitmentController.prototype;
 const methods=Object.getOwnPropertyNames(proto);const routes=methods.map(key=>({key,path:Reflect.getMetadata("path",proto[key as keyof typeof proto])}));
 for(const path of ["requisitions/export","candidates/export"]){const route=routes.find(row=>row.path===path);assert.ok(route);const handler=proto[route.key as keyof typeof proto];assert.deepEqual(Reflect.getMetadata(path.startsWith("requisitions")?ANY_PERMISSIONS_KEY:PERMISSIONS_KEY,handler),path.startsWith("requisitions")?[H.HR_REQUISITION_READ,H.HR_REQUISITION_TEAM_READ]:[H.HR_CANDIDATE_READ]);assert.ok(routes.indexOf(route)<routes.findIndex(row=>row.path===path.replace("export",":id")));}
});
