import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { HR_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import type { EntityManager } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { PartySensitiveDataService } from "../../shared/security/party-sensitive-data.service";
import { typeormQueryRows } from "../../shared/property-workbench/typeorm-query-rows";
import { HrFamilyRecordVersionDto, UpdateHrFamilyRecordDto } from "./dto/hr-family-record.dto";

const activeTransaction=(manager:EntityManager)=>{
  if(!manager.queryRunner?.isTransactionActive)throw new BadRequestException("Family write requires an active transaction");
};

/** Shared by ordinary maintenance and the upcoming incremental executor. A
 * journal failure must roll back the caller's ledger and target writes together. */
export async function appendFamilyChangeInTransaction(manager:EntityManager,s:TenantParkScope,a:JwtPrincipal,employeeId:string,
  action:"create"|"update"|"archive",before:Record<string,unknown>|null,after:Record<string,unknown>,sensitive:PartySensitiveDataService){
  activeTransaction(manager);
  await manager.query(`INSERT INTO hr_employee_family_change(tenant_id,park_id,employee_id,family_id,version,action,before_encrypted,after_encrypted,actor_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[s.tenantId,s.parkId,employeeId,after.id,after.version,action,
    before===null?null:sensitive.encrypt(JSON.stringify(before)),sensitive.encrypt(JSON.stringify(after)),a.sub]);
}

export async function mutateFamilyRecordInTransaction(manager:EntityManager,s:TenantParkScope,a:JwtPrincipal,employeeId:string,familyId:string,
  input:UpdateHrFamilyRecordDto,action:"update"|"archive",sensitive:PartySensitiveDataService){
  activeTransaction(manager);
  if(!a.isSuper&&!a.permissions.includes("*")&&!a.permissions.includes(HR_PERMISSIONS.HR_EMPLOYEE_RECORD_MANAGE))throw new ForbiddenException();
  if(!input||typeof input!=="object"||Array.isArray(input))throw new BadRequestException("Invalid family record patch");
  const patch=action==="archive"?plainToInstance(HrFamilyRecordVersionDto,input):plainToInstance(UpdateHrFamilyRecordDto,input);
  if(validateSync(patch,{whitelist:true,forbidNonWhitelisted:true}).length)throw new BadRequestException("Invalid family record patch");
  const validated=patch as UpdateHrFamilyRecordDto;
  if(validated.identityNumber?.includes("*"))throw new BadRequestException("A masked identity is not a replacement number");
  if(action==="update"&&!Object.keys(validated).some(key=>key!=="expectedVersion"&&validated[key as keyof UpdateHrFamilyRecordDto]!==undefined))throw new BadRequestException("No family fields were provided");
  const employee=await manager.query("SELECT id FROM hr_employee WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND NOT is_deleted FOR SHARE",[s.tenantId,s.parkId,employeeId]);
  if(employee.length!==1)throw new NotFoundException("Employee not found");
  // Acquire the write table lock before a row lock: original-set acceptance
  // serializes certification with SHARE ROW EXCLUSIVE, then writes in this txn.
  await manager.query("LOCK TABLE hr_employee_family IN ROW EXCLUSIVE MODE");
  const existing=await manager.query(`SELECT to_jsonb(family) snapshot FROM hr_employee_family family
    WHERE tenant_id=$1 AND park_id=$2 AND employee_id=$3 AND id=$4 AND NOT is_deleted FOR UPDATE`,[s.tenantId,s.parkId,employeeId,familyId]);
  if(existing.length!==1)throw new NotFoundException("Family record not found");
  const before=existing[0].snapshot as Record<string,unknown>;
  if(before.version!==validated.expectedVersion)throw new ConflictException("Family record changed; reload before saving");
  const values:unknown[]=[s.tenantId,s.parkId,employeeId,familyId,validated.expectedVersion,a.sub];
  const assignments=["version=version+1","update_by=$6","update_time=now()"];
  const set=(column:string,value:unknown)=>{values.push(value);assignments.push(`${column}=$${values.length}`);};
  if(action==="archive")assignments.push("is_deleted=true");
  else {
    for(const [field,column] of [["relationship","relationship"],["birthDate","birth_date"],["workUnit","work_unit"],
      ["jobTitle","job_title"],["politicalStatus","political_status"],["isEmergencyContact","is_emergency_contact"]] as const)
      if(validated[field]!==undefined)set(column,validated[field]);
    for(const [field,prefix] of [["fullName","full_name"],["identityNumber","identity"],["contact","contact"]] as const){
      const value=validated[field];if(value===undefined)continue;
      const protectedValue=value===null?null:sensitive.identityProfile(value);
      set(`${prefix}_encrypted`,protectedValue?.encrypted??null);
      set(`${prefix}_masked`,protectedValue?.masked??null);
      set(`${prefix}_fingerprint`,protectedValue?.hash??null);
    }
  }
  const raw=await manager.query(`UPDATE hr_employee_family AS family SET ${assignments.join(",")}
    WHERE tenant_id=$1 AND park_id=$2 AND employee_id=$3 AND id=$4 AND version=$5 AND NOT is_deleted RETURNING to_jsonb(family) snapshot`,values);
  const rows=typeormQueryRows<{snapshot:Record<string,unknown>}>(raw);
  if(rows.length!==1||rows[0]?.snapshot.version!==validated.expectedVersion+1)throw new ConflictException("Family record changed; reload before saving");
  const after=rows[0].snapshot;
  await appendFamilyChangeInTransaction(manager,s,a,employeeId,action,before,after,sensitive);
  return {id:familyId,recordType:"family",version:Number(after.version),archived:action==="archive"};
}


export async function createFamilyRecordInTransaction(manager:EntityManager,s:TenantParkScope,a:JwtPrincipal,employeeId:string,
  input:Partial<UpdateHrFamilyRecordDto>,sensitive:PartySensitiveDataService){
  activeTransaction(manager);
  if(!a.isSuper&&!a.permissions.includes("*")&&!a.permissions.includes(HR_PERMISSIONS.HR_EMPLOYEE_RECORD_MANAGE))throw new ForbiddenException();
  if(!input||typeof input!=="object"||Array.isArray(input)||(input.expectedVersion!==undefined&&input.expectedVersion!==1))throw new BadRequestException("Invalid family record patch");
  const patch=plainToInstance(UpdateHrFamilyRecordDto,{...input,expectedVersion:1});
  if(validateSync(patch,{whitelist:true,forbidNonWhitelisted:true}).length||!patch.relationship||!patch.fullName)throw new BadRequestException("Relationship and name are required");
  if(patch.identityNumber?.includes("*"))throw new BadRequestException("A masked identity is not a replacement number");

  const employee=await manager.query("SELECT id FROM hr_employee WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND NOT is_deleted FOR SHARE",[s.tenantId,s.parkId,employeeId]);
  if(employee.length!==1)throw new NotFoundException("Employee not found");
  const name=sensitive.identityProfile(patch.fullName!);
  const identity=patch.identityNumber?sensitive.identityProfile(patch.identityNumber):null;
  const contact=patch.contact?sensitive.identityProfile(patch.contact):null;
  const raw=await manager.query(`INSERT INTO hr_employee_family AS family(tenant_id,park_id,employee_id,relationship,
    full_name_encrypted,full_name_masked,full_name_fingerprint,identity_encrypted,identity_masked,identity_fingerprint,
    contact_encrypted,contact_masked,contact_fingerprint,is_emergency_contact,birth_date,work_unit,job_title,political_status,create_by,update_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$19) RETURNING to_jsonb(family) snapshot`,
    [s.tenantId,s.parkId,employeeId,patch.relationship,name.encrypted,name.masked,name.hash,
    identity?.encrypted??null,identity?.masked??null,identity?.hash??null,contact?.encrypted??null,contact?.masked??null,contact?.hash??null,
    patch.isEmergencyContact??false,patch.birthDate??null,patch.workUnit??null,patch.jobTitle??null,patch.politicalStatus??null,a.sub]);
  const rows=typeormQueryRows<{snapshot:Record<string,unknown>}>(raw);
  if(rows.length!==1||rows[0]?.snapshot.version!==1)throw new ConflictException("Family record creation was not confirmed");
  const after=rows[0].snapshot;
  await appendFamilyChangeInTransaction(manager,s,a,employeeId,"create",null,after,sensitive);
  return {id:String(after.id),recordType:"family",version:1};
}
