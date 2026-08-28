import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { HrLegacyArchiveService } from "./hr-legacy-archive.service";

const root=resolve(__dirname,"../../../../..");
const read=(path:string)=>readFileSync(resolve(root,path),"utf8");

test("legacy archive schema binds ownership to an exact active T0 record map",()=>{
 const sql=read("database/migrations/000279_hr_legacy_archive_visibility.sql");
 for(const table of ["hr_legacy_identity_registry","hr_legacy_archive_record","hr_legacy_file_logical_record","hr_legacy_file_blob_object"])assert.match(sql,new RegExp(`CREATE TABLE ${table}`));
 assert.match(sql,/mapping_status IN \('mapped','archive_only','quarantine','resolved'\)/);
 assert.match(sql,/owner_record_map_id uuid REFERENCES legacy_record_map\(id\)/);
 assert.match(sql,/owner_source_identity_sha256 char\(64\)/);
 assert.match(sql,/record_map\.source_identity_sha256<>NEW\.owner_source_identity_sha256/);
 assert.match(sql,/record_map\.source_system<>'yuzhou-v10'/);
 assert.match(sql,/record_map\.source_table<>'dbo\.person'/);
 assert.match(sql,/record_map\.target_table<>'hr_employee'/);
 assert.match(sql,/record_map\.target_id IS DISTINCT FROM NEW\.owner_employee_id/);
 assert.match(sql,/HR_LEGACY_OWNER_REQUIRES_EXACT_T0_RECORD_MAP/);
 assert.match(sql,/HR_LEGACY_IDENTITY_IMMUTABLE/);
 assert.match(sql,/HR_LEGACY_IDENTITY_OWNER_IMMUTABLE/);
 assert.doesNotMatch(sql,/full_name|employee_code|LIKE.*name/i);
});

test("legacy archive keeps display projections apart from encrypted originals and physical blobs",()=>{
 const sql=read("database/migrations/000279_hr_legacy_archive_visibility.sql");
 assert.match(sql,/display_safe_projection jsonb/);
 assert.match(sql,/restricted_safe_projection jsonb/);
 assert.match(sql,/encrypted_source_object_ref.*encrypted-object:\/\//s);
 assert.match(sql,/hr_legacy_file_logical_record[\s\S]*blob_object_id uuid/);
 assert.match(sql,/hr_legacy_file_blob_object[\s\S]*tenant_id varchar\(64\) NOT NULL[\s\S]*content_sha256 char\(64\) NOT NULL/);
 assert.match(sql,/uq_hr_legacy_blob_scope_hash UNIQUE\(tenant_id,park_id,content_sha256\)/);
 assert.match(sql,/fk_hr_legacy_file_blob FOREIGN KEY\(tenant_id,park_id,blob_object_id\)/);
 assert.match(sql,/logical_kind IN \('photo','document','attachment'\)/);
 assert.match(sql,/HR_LEGACY_ARCHIVE_IMMUTABLE/);
 assert.match(sql,/HR_LEGACY_ARCHIVE_IDENTITY_KIND_INVALID/);
 assert.match(sql,/HR_LEGACY_FILE_IDENTITY_KIND_INVALID/);
 assert.match(sql,/HR_LEGACY_FILE_OWNER_MISMATCH/);
 assert.doesNotMatch(sql,/bytea|raw_payload|plaintext/i);
});

test("legacy archive controller has atomic park team self and HR-only unclaimed reads",()=>{
 const controller=read("apps/api/src/modules/hr/hr-legacy-archive.controller.ts");
 assert.match(controller,/@Get\(\)[\s\S]*HR_LEGACY_ARCHIVE_READ[\s\S]*HR_LEGACY_ARCHIVE_TEAM_READ[\s\S]*HR_LEGACY_ARCHIVE_SELF_READ/);
 assert.match(controller,/@Get\("unclaimed"\)[\s\S]*RequirePermissions\(HR_PERMISSIONS\.HR_LEGACY_ARCHIVE_UNCLAIMED_READ\)/);
 assert.match(controller,/@Get\("employees\/:employeeId"\)/);
 assert.doesNotMatch(controller,/@Post|@Put|@Patch|@Delete/);
});

test("service fails closed on wrong identity kinds and cross-owner file links",()=>{
 const service=read("apps/api/src/modules/hr/hr-legacy-archive.service.ts");
 assert.match(service,/registry\.identity_kind='archive_record'/);
 assert.match(service,/file_registry\.identity_kind='file_logical'/);
 assert.match(service,/parent_registry\.owner_employee_id IS NOT DISTINCT FROM file_registry\.owner_employee_id/);
 assert.match(service,/blob\.tenant_id=logical\.tenant_id AND blob\.park_id=logical\.park_id/);
});

test("service hides restricted projection outside precise HR permission and audits every read",async()=>{
 const rows=[{id:"archive-1",employeeId:"employee-1",mappingStatus:"mapped",recordType:"profile",occurredOn:"2024-01-01",displayTitle:"历史档案",displaySafeProjection:{department:"A"},restrictedSafeProjection:{identityMasked:"***1"},hasSensitiveSource:true,sourceSystem:"yuzhou-v10",sourceTable:"dbo.person",resolutionReasonCode:null,totalCount:"1"}];
 const queries:string[]=[];
 const dataSource={query:async(sql:string)=>{queries.push(sql);return rows;}};
 const audits:unknown[]=[];
 const auditService={recordOperationRequired:async(input:unknown)=>{audits.push(input);}};
 const service=new HrLegacyArchiveService(dataSource as never,auditService as never);
 const scope={tenantId:"tenant",parkId:"park"};
 const manager={sub:"manager",username:"manager",tenantId:"tenant",parkId:"park",roles:[],permissions:[HR_PERMISSIONS.HR_LEGACY_ARCHIVE_TEAM_READ],isSuper:false};
 const result=await service.list(scope,manager,{page:1,page_size:20});
 assert.deepEqual(result.items[0]?.projection,{department:"A"});
 assert.equal(result.items[0]?.sourceTable,undefined);
 assert.match(queries[0]??"",/WITH RECURSIVE managed_org/);
 assert.match(queries[0]??"",/owner_employee_id IN/);
 assert.equal(audits.length,1);
 const hr={...manager,permissions:[HR_PERMISSIONS.HR_LEGACY_ARCHIVE_READ,HR_PERMISSIONS.HR_LEGACY_ARCHIVE_SENSITIVE_READ]};
 const full=await service.list(scope,hr,{page:1,page_size:20});
 assert.deepEqual(full.items[0]?.projection,{department:"A",identityMasked:"***1"});
 assert.equal(full.items[0]?.sourceTable,"dbo.person");
});

test("unclaimed archive read is denied without its exact HR permission",async()=>{
 const service=new HrLegacyArchiveService({query:async()=>[]} as never,{recordOperationRequired:async()=>undefined} as never);
 await assert.rejects(()=>service.listUnclaimed({tenantId:"tenant",parkId:"park"},{sub:"employee",username:"employee",tenantId:"tenant",parkId:"park",roles:[],permissions:[HR_PERMISSIONS.HR_LEGACY_ARCHIVE_SELF_READ],isSuper:false},{page:1,page_size:20}),ForbiddenException);
});

test("detail does not leak source or blob fingerprints and required audit fails closed",async()=>{
 const archive={id:"00000000-0000-4000-8000-000000000001",employeeId:"00000000-0000-4000-8000-000000000002",mappingStatus:"mapped",recordType:"profile",occurredOn:null,displayTitle:"安全标题",displaySafeProjection:{department:"A"},restrictedSafeProjection:{identityMasked:"***1"},hasSensitiveSource:true,sourceSystem:"yuzhou-v10",sourceTable:"dbo.person",resolutionReasonCode:null};
 const file={id:"00000000-0000-4000-8000-000000000003",logicalKind:"photo",logicalName:"历史照片",mediaType:"image/jpeg",sizeBytes:"4",availability:"available",contentSha256:"f".repeat(64)};
 const dataSource={query:async(sql:string)=>sql.includes("hr_legacy_file_logical_record")?[file]:[archive]};
 const actor={sub:"employee",username:"employee",tenantId:"tenant",parkId:"park",roles:[],permissions:[HR_PERMISSIONS.HR_LEGACY_ARCHIVE_SELF_READ],isSuper:false};
 const service=new HrLegacyArchiveService(dataSource as never,{recordOperationRequired:async()=>undefined} as never);
 const detail=await service.detail({tenantId:"tenant",parkId:"park"},actor,archive.id);
 assert.equal(detail.sourceSystem,undefined);
 assert.equal(detail.sourceTable,undefined);
 assert.equal("contentFingerprint" in detail.files[0]!,false);
 assert.doesNotMatch(JSON.stringify(detail),/dbo\.person|f{64}|encrypted-object/u);
 const auditFailure=new Error("required audit unavailable");
 const blocked=new HrLegacyArchiveService(dataSource as never,{recordOperationRequired:async()=>{throw auditFailure;}} as never);
 await assert.rejects(()=>blocked.detail({tenantId:"tenant",parkId:"park"},actor,archive.id),error=>error===auditFailure);
});

test("production seed grants unclaimed and sensitive visibility only to HR manager",()=>{
 const seed=read("database/seeds/production/000032_hr_legacy_archive_rbac.sql");
 for(const permission of ["hr:legacy_archive:read","hr:legacy_archive:team_read","hr:legacy_archive:self_read","hr:legacy_archive:sensitive_read","hr:legacy_archive:unclaimed_read"])assert.match(seed,new RegExp(permission));
 assert.match(seed,/HR_MANAGER','hr:legacy_unclaimed/);
 assert.match(seed,/DEPARTMENT_MANAGER','hr:legacy_archive:team_read/);
 assert.match(seed,/EMPLOYEE_SELF_SERVICE','hr:legacy_archive:self_read/);
 assert.match(seed,/privileged permission leaked to team or self role/);
 assert.doesNotMatch(seed,/INSERT INTO hr_employee|INSERT INTO sys_user|INSERT INTO rel_user_role/);
});
