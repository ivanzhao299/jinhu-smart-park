import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Reflector } from "@nestjs/core";
import type { ExecutionContext } from "@nestjs/common";
import { lastValueFrom, of, throwError } from "rxjs";
import { HR_INSURANCE_POLICY_PERMISSIONS, HR_PERMISSIONS } from "@jinhu/shared";
import { PERMISSIONS_KEY } from "../../shared/decorators/permissions.decorator";
import { AUDIT_LOG_KEY } from "../audit/decorators/audit-log.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HR_INSURANCE_KINDS, calculateInsurancePreview, normalizeInsurancePolicyFactors } from "./hr-insurance-calculation";
import { HrInsurancePolicyVersionController } from "./hr-insurance-policy-version.controller";
import { HrInsurancePolicyVersionService } from "./hr-insurance-policy-version.service";
import { HrInsurancePreviewController } from "./hr-insurance-preview.controller";
import { AuditLogInterceptor } from "../../shared/interceptors/audit-log.interceptor";
import type { CreateHrInsurancePolicyVersionDto } from "./dto/hr-insurance-policy-version.dto";
import { insuranceSourceFactorsHash } from "./hr-insurance-policy-source";

const scope = { tenantId: "fixture", parkId: "fixture" };
const actor: JwtPrincipal = { ...scope, sub: randomUUID(), username: "synthetic", roles: [], permissions: [HR_PERMISSIONS.HR_INSURANCE_READ, HR_PERMISSIONS.HR_INSURANCE_AMOUNT_READ, HR_INSURANCE_POLICY_PERMISSIONS.VERSION_CREATE] };
function request(): CreateHrInsurancePolicyVersionDto {
  return { requestId: randomUUID(), policyCode: "SYNTHETIC", policyName: "合成政策", variantNo: 1,
    effectiveFrom: "2026-01", effectiveThrough: "2026-12", reason: "合成规则核验",
    items: HR_INSURANCE_KINDS.map(insuranceKind => ({ insuranceKind, factors: { base: { rate: "0.08", fixedAmount: null }, employer: { rate: "0.08", fixedAmount: null }, employee: { rate: "0.08", fixedAmount: null }, supplement: { rate: "0.08", fixedAmount: null } } })) };
}

test("policy factors canonicalize exact decimals, preserve explicit NULL and signed offsets", () => {
  const dto = request(); dto.items![0]!.factors.employee = { rate: "000.123456", fixedAmount: "-000.004" };
  const result = normalizeInsurancePolicyFactors([...dto.items!].reverse());
  assert.deepEqual(result[0]!.factors.employee,{rate:"0.123456",fixedAmount:"-0.004"});
  assert.equal(result[1]!.factors.employee.fixedAmount,null);
  const calculated = calculateInsurancePreview({ policyVersion:1,includeFund:true,items:result.map(i => ({...i,contributionBase:"1000.00"})) });
  assert.equal(calculated.items[0]!.amounts.employee,"123.45");
  assert.equal(calculated.totals.employee,"523.45");
});

test("policy factors reject missing/NULL rates, excess precision, overflow and duplicate kinds", () => {
  for (const rate of [null,undefined,"-0.1","0.1234567","1000000000000.000000"]) {
    const dto=request(); dto.items![0]!.factors.employee.rate=rate as string;
    assert.throws(() => normalizeInsurancePolicyFactors(dto.items!),/INSURANCE_CALCULATION_INVALID/u);
  }
  const missing=request(); delete (missing.items![0]!.factors.employee as Partial<{fixedAmount:string|null}>).fixedAmount;
  assert.throws(() => normalizeInsurancePolicyFactors(missing.items!),/missing or invalid/u);
  const duplicate=request();duplicate.items![1]!.insuranceKind=duplicate.items![0]!.insuranceKind;
  assert.throws(() => normalizeInsurancePolicyFactors(duplicate.items!),/six distinct/u);
});

test("read authority cannot create policies and every route has explicit authority", async () => {
  let queries=0;const service=Reflect.construct(HrInsurancePolicyVersionService,[{transaction:async()=>{queries++;}},{ }]) as HrInsurancePolicyVersionService;
  await assert.rejects(service.create(scope,{...actor,permissions:actor.permissions.filter(p=>p!==HR_INSURANCE_POLICY_PERMISSIONS.VERSION_CREATE)},request()),/FORBIDDEN/u);
  assert.equal(queries,0);
  assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY,HrInsurancePolicyVersionController.prototype.create),actor.permissions);
  assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY,HrInsurancePolicyVersionController.prototype.detail),actor.permissions.slice(0,2));
  assert.equal(Reflect.getMetadata(AUDIT_LOG_KEY,HrInsurancePolicyVersionController).captureBody,false);
});

test("policy inputs reject absent dates, invalid names, inverted range and mixed origins before queries", async () => {
  let queries=0;const service=Reflect.construct(HrInsurancePolicyVersionService,[{transaction:async()=>{queries++;}},{ }]) as HrInsurancePolicyVersionService;
  const invalid=[{effectiveFrom:undefined},{effectiveThrough:"2025-12"},{policyName:"123.00"},{policyName:"\u3164\u200b"},{reason:" "},{sourcePolicyId:randomUUID(),expectedSourceVersion:1},{items:undefined},{variantNo:"1"}];
  for(const patch of invalid)await assert.rejects(service.create(scope,actor,{...request(),...patch} as CreateHrInsurancePolicyVersionDto),/INVALID|REQUIRED/u);
  assert.equal(queries,0);
});

test("copy refuses source factor drift even when the parent policy version has not changed", async () => {
  const sourceId=randomUUID();
  const factors=HR_INSURANCE_KINDS.map((insurance_kind,i)=>({id:`factor-${i}`,version:1,insurance_kind,base_rate:"0.080000",employer_rate:"0.080000",employee_rate:"0.080000",supplement_rate:"0.000000",base_fixed_amount:null,employer_fixed_amount:null,employee_fixed_amount:null,supplement_fixed_amount:null}));
  const expected=insuranceSourceFactorsHash(factors);
  for(const mutation of [{employee_rate:"0.090000"},{version:2}]){
    let writes=0,audits=0;
    const db={transaction:async(_isolation:string,fn:(manager:unknown)=>Promise<unknown>)=>fn({query:async(sql:string,params?:unknown[])=>{
      if(sql.startsWith("INSERT ")){writes++;throw new Error("unexpected insert");}
      if(sql.includes("FROM hr_insurance_policy_version"))return [];
      if(sql.includes("FROM hr_insurance_policy_item")){assert.match(sql,/FOR SHARE$/u);assert.deepEqual(params,[sourceId,scope.tenantId,scope.parkId,1]);return factors.map((f,i)=>i===0?{...f,...mutation}:f);}
      if(sql.includes("FROM hr_insurance_policy ")){assert.match(sql,/FOR UPDATE$/u);return [{id:sourceId,version:7}];}
      return [];
    }})};
    const service=Reflect.construct(HrInsurancePolicyVersionService,[db,{recordOperationRequired:async()=>{audits++;}}]) as HrInsurancePolicyVersionService;
    await assert.rejects(service.create(scope,actor,{...request(),items:undefined,sourcePolicyId:sourceId,expectedSourceVersion:7,expectedSourceFactorsHash:expected}),/SOURCE_FACTORS_CHANGED/u);
    assert.equal(writes,0);assert.equal(audits,0);
  }
});

test("actual global audit interceptor respects both insurance controllers on success and failure", async () => {
  for(const [controller,handler] of [[HrInsurancePolicyVersionController,HrInsurancePolicyVersionController.prototype.create],[HrInsurancePreviewController,HrInsurancePreviewController.prototype.referencePreview]] as const){
    for(const failure of [false,true]){
      const recorded:Array<{afterJson:unknown;success:boolean}>=[];
      const interceptor=Reflect.construct(AuditLogInterceptor,[{recordOperation:async(entry:{afterJson:unknown;success:boolean})=>{recorded.push(entry);}},{getId:()=>"synthetic-request"},new Reflector()]) as AuditLogInterceptor;
      const req={method:"POST",user:actor,body:{employeeId:randomUUID(),items:[{rate:"0.123456",fixedAmount:"100.004"}],reason:"synthetic private input"},params:{},headers:{},path:"/hr/insurance",originalUrl:"/api/v1/hr/insurance",ip:"127.0.0.1"};
      const context={switchToHttp:()=>({getRequest:()=>req}),getHandler:()=>handler,getClass:()=>controller} as unknown as ExecutionContext;
      const completion=lastValueFrom(interceptor.intercept(context,{handle:()=>failure?throwError(()=>new Error("synthetic rejected")):of({id:randomUUID()})}));
      if(failure)await assert.rejects(completion,/synthetic rejected/u);else await completion;
      assert.equal(recorded.length,1);assert.equal(recorded[0]!.afterJson,null);assert.equal(recorded[0]!.success,!failure);
    }
  }
});
