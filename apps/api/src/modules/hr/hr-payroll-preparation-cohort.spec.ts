import "reflect-metadata";
import assert from "node:assert/strict";
import {test} from "node:test";
import {plainToInstance} from "class-transformer";
import {validate} from "class-validator";
import {ForbiddenException} from "@nestjs/common";
import {HR_PERMISSIONS} from "@jinhu/shared";
import type {DataSource} from "typeorm";
import type {AuditService} from "../audit/audit.service";
import {HrPayrollPreparationCohortQueryDto} from "./dto/hr-payroll-history.dto";
import {HrPayrollHistoryService} from "./hr-payroll-history.service";
const scope={tenantId:'cohort',parkId:'cohort'};
const permissions=[HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_REVIEW,HR_PERMISSIONS.HR_EMPLOYEE_READ,HR_PERMISSIONS.HR_ATTENDANCE_READ,HR_PERMISSIONS.HR_ATTENDANCE_PAYROLL_INPUT_READ,HR_PERMISSIONS.HR_INSURANCE_READ,HR_PERMISSIONS.HR_INSURANCE_AMOUNT_READ,HR_PERMISSIONS.HR_PAYROLL_RULE_READ];
const query={legacyBatchId:'11111111-1111-4111-8111-111111111111',periodMonth:'2026-07-01',page:1,page_size:50};
test('each granular read permission and actor scope is required before all probes',async()=>{
 let probes=0;const service=new HrPayrollHistoryService({transaction:()=>{probes++;throw Error('unexpected probe');}} as unknown as DataSource,{} as AuditService);
 for(const permission of permissions) await assert.rejects(service.preparationCohort(scope,{...scope,sub:'actor',username:'synthetic',roles:[],permissions:permissions.filter(p=>p!==permission)},query),ForbiddenException);
 await assert.rejects(service.preparationCohort(scope,{...scope,parkId:'foreign',sub:'actor',username:'synthetic',roles:[],permissions:['*']},query),ForbiddenException);
 assert.equal(probes,0);
});
test('explicit UUID/month and bounded pagination; no implicit calendar default',async()=>{
 assert.equal((await validate(plainToInstance(HrPayrollPreparationCohortQueryDto,query))).length,0);
 for(const patch of [{legacyBatchId:'bad'},{periodMonth:undefined},{periodMonth:'2026-02-30'},{periodMonth:'2026-07-02'},{page:0},{page:5001},{page_size:101},{page_size:0}]) assert.ok((await validate(plainToInstance(HrPayrollPreparationCohortQueryDto,{...query,...patch}))).length>0);
});
