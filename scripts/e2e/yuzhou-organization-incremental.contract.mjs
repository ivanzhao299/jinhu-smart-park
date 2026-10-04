import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { buildYuzhouReusableIncrementalPackage, YUZHOU_REUSABLE_INCREMENTAL_RECIPE_SHA256 } from "../hr-cutover/build-yuzhou-reusable-incremental-package.mjs";
import { projectYuzhouOrganizationRecords, orderHierarchyItems } from "../hr-cutover/yuzhou-organization-incremental-projection.mjs";
import { splitYuzhouIncrementalPackage } from "../hr-cutover/yuzhou-incremental-package-limits.mjs";
const sha=s=>createHash("sha256").update(s).digest("hex");
const row=(sourceTable,sourceKey,source)=>({sourceTable,sourceKey,sourceIdentitySha256:sha(`${sourceTable}\0${sourceKey}`),sourceRowSha256:sha(JSON.stringify(source,Object.keys(source).sort())),source});
const org=(key,extra={})=>row("dbo.departmentcode",key,{legacyCode:key,orgName:`Org ${key}`,rating:2,sortOrder:0,legacyManagerValue:null,plannedHeadcount:null,contactPhone:null,legacySourceId:null,...extra});
const job=(key,extra={})=>row("dbo.job",key,{legacyCode:key,positionName:`Job ${key}`,departmentCode:"A1",parentPositionCode:null,legacyUptoCode:null,jobgrade:null,salarygrade:null,authority:null,qualification:null,responsibilities:null,headcountLimit:null,positionManual:null,rating:null,sortOrder:0,legacySourceId:null,...extra});
const input=(orgs,jobs)=>({recipeVersion:"yuzhou-reusable-incremental-v2",recipeSha256:YUZHOU_REUSABLE_INCREMENTAL_RECIPE_SHA256,sourceSystem:"yuzhou-v10",extractedAt:"2026-10-04T00:00:00Z",employeeRecords:[],employeeIndex:[],records:[],organizationRecords:orgs,positionRecords:jobs});
test("organization projector retains identities, original fields and dependency order",()=>{
 const result=buildYuzhouReusableIncrementalPackage(input([org("A1"),org("A",{legacyManagerValue:"manager",realpersons:2})],[job("J2",{parentPositionCode:"J1",legacyUptoCode:"classification"}),job("J1")]));
 assert.deepEqual(result.packageDto.items.map(i=>i.fields.orgCode??i.fields.positionCode),["A","A1","J1","J2"]);
 assert.equal(result.packageDto.items[1].fields.parentSourceKey,`sha256:${sha("dbo.departmentcode\0A")}`);
 assert.equal(result.packageDto.items[3].fields.legacyUptoCode,"classification");
 const source=result.coverage.sourceFieldCoverage.find(r=>r.sourceIdentitySha256===sha("dbo.departmentcode\0A"));assert.equal(source.fieldCoverage.find(f=>f.field==="realpersons").disposition,"pending_semantic_binding");
 assert.deepEqual(result,buildYuzhouReusableIncrementalPackage(input([org("A1"),org("A",{legacyManagerValue:"manager",realpersons:2})],[job("J2",{parentPositionCode:"J1",legacyUptoCode:"classification"}),job("J1")])));
});
test("invalid source identity, duplicate code, missing org, unknown raw values and cycles fail closed",()=>{
 const corrupt=org("A");corrupt.source.orgName="tampered";assert.throws(()=>projectYuzhouOrganizationRecords([corrupt]),/SOURCE_INVALID/);
 const missing=job("J");delete missing.source.legacyUptoCode;missing.sourceRowSha256=sha(JSON.stringify(missing.source,Object.keys(missing.source).sort()));assert.throws(()=>projectYuzhouOrganizationRecords([], [missing]),/SCHEMA_INVALID/);
 assert.throws(()=>projectYuzhouOrganizationRecords([org("A"),org(" A")]),/AMBIGUOUS/);
 assert.throws(()=>projectYuzhouOrganizationRecords([], [job("J",{departmentCode:""})]),/ORG_UNRESOLVED/);
 assert.throws(()=>projectYuzhouOrganizationRecords([org("A",{plannedHeadcount:-1})]),/FIELD_INVALID/);
 assert.throws(()=>buildYuzhouReusableIncrementalPackage(input([org("A1")],[job("J1",{parentPositionCode:"J2"}),job("J2",{parentPositionCode:"J1"})])),/CYCLE/);
 // External exact keys stay dependencies to authenticate at the API, never guessed names/root.
 assert.equal(projectYuzhouOrganizationRecords([], [job("J",{departmentCode:"Unknown"})]).adapted[0].item.fields.orgSourceKey,`sha256:${sha("dbo.departmentcode\0Unknown")}`);
});
test("dependency ordering precedes 2000-item chunking",()=>{
 const orgs=Array.from({length:2001},(_,i)=>org(`D${String(i).padStart(5,"0")}`));
 const result=buildYuzhouReusableIncrementalPackage(input(orgs,[]));assert.deepEqual(result.packageDtos.map(p=>p.items.length),[2000,1]);
 assert.deepEqual(orderHierarchyItems(result.packageDtos.flatMap(p=>p.items)),result.packageDtos.flatMap(p=>p.items));
 const flat=result.packageDtos.flatMap(p=>p.items),parent=flat[2000],child={...flat[1999],fields:{...flat[1999].fields,parentSourceKey:parent.sourceKey}};
 const ordered=orderHierarchyItems([...flat.slice(0,1999),child,parent]);
 const split=splitYuzhouIncrementalPackage({...result.packageDtos[0],items:ordered});
 assert.equal(split[0].items[1999].sourceKey,parent.sourceKey);
 assert.equal(split[1].items[0].sourceKey,child.sourceKey);
});

test("topology rejects duplicate identities instead of silently dropping items",()=>{
 const one={domain:"contract",sourceTable:"dbo.compact",sourceKey:`sha256:${sha("duplicate")}`,fields:{contractNo:"first"}};
 assert.throws(()=>orderHierarchyItems([one,{...one,fields:{contractNo:"second"}}]),/SOURCE_DUPLICATE/);
 assert.throws(()=>orderHierarchyItems([one,{...one,sourceTable:"dbo.other"}]),/SOURCE_DUPLICATE/);
 assert.equal(orderHierarchyItems([one]).length,1);
});
