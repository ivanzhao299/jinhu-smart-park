import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { DataSource } from "typeorm";
import { NotFoundException } from "@nestjs/common";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { HrPayrollHistoryService } from "./hr-payroll-history.service";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { AuditService } from "../audit/audit.service";
const required=process.env.HR_PAYROLL_FORMULA_DETAIL_PG_REQUIRED==="1";
test("actual PostgreSQL formula detail query preserves source text and separates parks",{skip:!required},async()=>{
 assert.equal(process.env.POSTGRES_HOST,"127.0.0.1");assert.equal(process.env.POSTGRES_PORT,"15489");
 const database=`jinhu_hr_formula_lab_${randomUUID().replaceAll("-","")}`;
 const admin=new DataSource({type:"postgres",host:"127.0.0.1",port:15489,username:"postgres",database:"postgres"});await admin.initialize();let db:DataSource|undefined;
 try {
  await admin.query(`CREATE DATABASE "${database}"`);
  db=new DataSource({type:"postgres",host:"127.0.0.1",port:15489,username:"postgres",database});await db.initialize();
  // Read-query fixture only. Existing version/review/migration guards are unchanged by this slice.
  await db.query(`CREATE TABLE hr_payroll_book(id uuid,tenant_id uuid,park_id uuid,legacy_scheme text,book_name text,is_deleted boolean);
   CREATE TABLE hr_payroll_item_version(id uuid,tenant_id uuid,park_id uuid,display_name text);
   CREATE TABLE hr_payroll_formula_version(id uuid,tenant_id uuid,park_id uuid,book_id uuid,item_version_id uuid,version_no int,raw_expression text,raw_condition text,parser_version text,parse_status text,dependency_codes text[],calculation_order int,reviewed_at timestamptz,review_reason text,is_deleted boolean);`);
  const tenantId=randomUUID(),parkId=randomUUID(),foreignPark=randomUUID(),book=randomUUID(),item=randomUUID(),formula=randomUUID();
  await db.query("INSERT INTO hr_payroll_book VALUES($1,$2,$3,$4,$5,false)",[book,tenantId,parkId,"synthetic","Synthetic actual book"]);
  await db.query("INSERT INTO hr_payroll_item_version VALUES($1,$2,$3,$4)",[item,tenantId,parkId,"Synthetic net"]);
  const expression="[基本项目] + 1.2500", condition="legacy standalone condition";
  await db.query("INSERT INTO hr_payroll_formula_version VALUES($1,$2,$3,$4,$5,7,$6,$7,'source-parser','manual_review',ARRAY['payroll:基本项目'],3,null,null,false)",[formula,tenantId,parkId,book,item,expression,condition]);
  const audits:Record<string,unknown>[]=[];
  const service=new HrPayrollHistoryService(db,{recordOperationRequired:async(v:Record<string,unknown>)=>{audits.push(v);}} as unknown as AuditService);
  const actor:JwtPrincipal={sub:randomUUID(),username:"synthetic",roles:[],permissions:[HR_PERMISSIONS.HR_PAYROLL_RULE_READ],tenantId,parkId};
  const listing=await service.listFormulas({tenantId,parkId},actor,{page:1,page_size:20});assert.equal(listing.total,1);assert.equal(listing.items[0]?.bookName,"Synthetic actual book");
  const detail=await service.formulaDetail({tenantId,parkId},actor,formula);
  assert.equal(detail.rawExpression,expression);assert.equal(detail.rawCondition,condition);assert.equal(detail.bookName,"Synthetic actual book");assert.equal(detail.versionNo,7);assert.equal(detail.approvalEligibility,"blocked");assert.equal(audits.length,2);assert.equal(JSON.stringify(audits).includes(expression),false);
  await assert.rejects(()=>service.formulaDetail({tenantId,parkId:foreignPark},{...actor,parkId:foreignPark},formula),NotFoundException);assert.equal(audits.length,2);
  await db.query("UPDATE hr_payroll_formula_version SET raw_condition=null WHERE id=$1",[formula]);assert.equal((await service.formulaDetail({tenantId,parkId},actor,formula)).approvalEligibility,"syntax_ready");
 } finally {
  if(db?.isInitialized)await db.destroy();
  await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH(FORCE)`);assert.equal((await admin.query("SELECT datname FROM pg_database WHERE datname=$1",[database])).length,0);await admin.destroy();
 }
});
