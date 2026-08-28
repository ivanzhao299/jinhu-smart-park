import assert from "node:assert/strict";
import test from "node:test";
import {HR_PERMISSIONS} from "@jinhu/shared";
import {HrLifecycleService} from "./hr-lifecycle.service";

const scope={tenantId:"t",parkId:"p"},employeeId="00000000-0000-4000-8000-000000000101";
const actor=(permissions:string[])=>({sub:"00000000-0000-4000-8000-000000000001",username:"u",tenantId:"t",parkId:"p",roles:[],permissions});
function fixture(){
  const db={query:async(sql:string)=>{
    if(sql.includes("SELECT 1 FROM hr_employee"))return [{"?column?":1}];
    if(sql.includes("WHERE tenant_id=$1 AND park_id=$2 AND user_id=$3"))return [{id:employeeId}];
    if(sql.includes("FROM hr_employee_family"))return [{id:"f",relationship:"父亲",fullNameMasked:"王**",fullNameEncrypted:"enc:王先生",contactMasked:"13****00",contactEncrypted:"enc:13800000000"}];
    if(sql.includes("FROM hr_employee_credential"))return [{id:"c",credentialType:"legacy",credentialName:"证书",numberMasked:"12**34",numberEncrypted:"enc:1234"}];
    return [];
  }};
  return new HrLifecycleService(db as never,{decrypt:(value:string|null)=>value?.replace("enc:","")??null} as never,{recordOperationRequired:async()=>undefined} as never);
}

test("exact family and credential permissions expose decrypted PII to full HR only",async()=>{
  const result=await fixture().listRecords(scope,actor([HR_PERMISSIONS.HR_EMPLOYEE_RECORD_READ,HR_PERMISSIONS.HR_EMPLOYEE_FAMILY_READ,HR_PERMISSIONS.HR_EMPLOYEE_CREDENTIAL_READ]),employeeId);
  assert.equal(result.family[0]?.fullName,"王先生");
  assert.equal(result.credentials[0]?.credentialNumber,"1234");
  assert.equal("fullNameEncrypted" in result.family[0],false);
  assert.equal("numberEncrypted" in result.credentials[0],false);
});

test("employee self projection remains masked and cannot expand its allowlist",async()=>{
  const result=await fixture().listRecords(scope,actor([HR_PERMISSIONS.HR_EMPLOYEE_RECORD_SELF_READ]),employeeId);
  assert.equal(result.family[0]?.fullNameMasked,"王**");
  assert.equal(result.credentials[0]?.numberMasked,"12**34");
  assert.equal("fullName" in result.family[0],false);
  assert.equal("credentialNumber" in result.credentials[0],false);
});
