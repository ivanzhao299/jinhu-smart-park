import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { HR_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import type { EntityManager } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { PartySensitiveDataService } from "../../shared/security/party-sensitive-data.service";
import { typeormQueryRows } from "../../shared/property-workbench/typeorm-query-rows";
import { HrRecordVersionDto, UpdateHrCredentialRecordDto, UpdateHrExperienceRecordDto, UpdateHrSkillRecordDto } from "./dto/hr-record-maintenance.dto";

const definitions={
  experience:{dto:UpdateHrExperienceRecordDto,fields:{type:"experience_type",organizationName:"organization_name",title:"title",startDate:"start_date",endDate:"end_date",summary:"summary"}},
  skill:{dto:UpdateHrSkillRecordDto,fields:{skillName:"skill_name",proficiency:"proficiency",acquiredDate:"acquired_date",note:"note",legacyGrade:"legacy_grade"}},
  credential:{dto:UpdateHrCredentialRecordDto,fields:{credentialType:"credential_type",credentialName:"credential_name",issuingAuthority:"issuing_authority",acquiredDate:"acquired_date",validTo:"valid_to",note:"note",credentialNumber:"number_encrypted"}},
} as const;
export type HrMaintainedRecordKind=keyof typeof definitions;

export async function appendEmployeeRecordChangeInTransaction(manager:EntityManager,s:TenantParkScope,a:JwtPrincipal,employeeId:string,
  kind:HrMaintainedRecordKind,action:"create"|"update"|"archive",before:Record<string,unknown>|null,after:Record<string,unknown>,sensitive:PartySensitiveDataService){
  if(!manager.queryRunner?.isTransactionActive||!Object.hasOwn(definitions,kind))throw new BadRequestException("Invalid record change transaction");
  await manager.query(`INSERT INTO hr_employee_${kind}_change(tenant_id,park_id,employee_id,record_id,version,action,before_encrypted,after_encrypted,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[s.tenantId,s.parkId,employeeId,after.id,after.version,action,before===null?null:sensitive.encrypt(JSON.stringify(before)),sensitive.encrypt(JSON.stringify(after)),a.sub]);
}

export async function mutateEmployeeRecordInTransaction(manager:EntityManager,s:TenantParkScope,a:JwtPrincipal,employeeId:string,
  kind:HrMaintainedRecordKind,recordId:string,input:unknown,action:"update"|"archive",sensitive:PartySensitiveDataService){
  if(!manager.queryRunner?.isTransactionActive)throw new BadRequestException("Record write requires an active transaction");
  if(!a.isSuper&&!a.permissions.includes("*")&&!a.permissions.includes(HR_PERMISSIONS.HR_EMPLOYEE_RECORD_MANAGE))throw new ForbiddenException();
  if(!Object.hasOwn(definitions,kind)||!input||typeof input!=="object"||Array.isArray(input))throw new BadRequestException("Invalid employee record patch");
  const definition=definitions[kind];
  const dto=action==="archive"?HrRecordVersionDto:definition.dto;
  const patch=plainToInstance(dto as typeof HrRecordVersionDto,input);
  if(validateSync(patch,{whitelist:true,forbidNonWhitelisted:true}).length)throw new BadRequestException("Invalid employee record patch");
  const fields=patch as unknown as Record<string,unknown>;
  if(action==="update"&&!Object.keys(definition.fields).some(field=>fields[field]!==undefined))throw new BadRequestException("No record fields were provided");
  if(kind==="credential"&&typeof fields.credentialNumber==="string"&&fields.credentialNumber.includes("*"))throw new BadRequestException("A masked credential is not a replacement number");
  const employee=await manager.query("SELECT id FROM hr_employee WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND NOT is_deleted FOR SHARE",[s.tenantId,s.parkId,employeeId]);
  if(employee.length!==1)throw new NotFoundException("Employee not found");
  const table=`hr_employee_${kind}`;
  const rows=await manager.query(`SELECT to_jsonb(record) snapshot FROM ${table} record WHERE tenant_id=$1 AND park_id=$2 AND employee_id=$3 AND id=$4 AND NOT is_deleted FOR UPDATE`,[s.tenantId,s.parkId,employeeId,recordId]);
  if(rows.length!==1)throw new NotFoundException("Employee record not found");
  const before=rows[0].snapshot as Record<string,unknown>;
  if(before.version!==patch.expectedVersion)throw new ConflictException("Employee record changed; reload before saving");
  const date=(field:string,column:string)=>fields[field]===undefined?before[column]:fields[field];
  if(action==="update"){
    const from=kind==="experience"?date("startDate","start_date"):date("acquiredDate","acquired_date");
    const to=kind==="experience"?date("endDate","end_date"):kind==="credential"?date("validTo","valid_to"):null;
    if(from&&to&&String(to)<String(from))throw new BadRequestException("End date must not precede start date");
  }
  const values:unknown[]=[s.tenantId,s.parkId,employeeId,recordId,patch.expectedVersion,a.sub];
  const assignments=["version=version+1","update_by=$6","update_time=now()"];
  const set=(column:string,value:unknown)=>{values.push(value);assignments.push(`${column}=$${values.length}`);};
  if(action==="archive")assignments.push("is_deleted=true");
  else for(const [field,column] of Object.entries(definition.fields)){
    const value=fields[field];if(value===undefined)continue;
    if(field==="credentialNumber"){
      const protectedValue=value===null||value===""?null:sensitive.identityProfile(value as string);
      set("number_encrypted",protectedValue?.encrypted??null);set("number_masked",protectedValue?.masked??null);set("number_fingerprint",protectedValue?.hash??null);
    } else set(column,value);
  }
  try {
    const raw=await manager.query(`UPDATE ${table} AS record SET ${assignments.join(",")} WHERE tenant_id=$1 AND park_id=$2 AND employee_id=$3 AND id=$4 AND version=$5 AND NOT is_deleted RETURNING to_jsonb(record) snapshot`,values);
    const updated=typeormQueryRows<{snapshot:Record<string,unknown>}>(raw);
    if(updated.length!==1||updated[0]?.snapshot.version!==patch.expectedVersion+1)throw new ConflictException("Employee record changed; reload before saving");
    const after=updated[0]!.snapshot;
    await appendEmployeeRecordChangeInTransaction(manager,s,a,employeeId,kind,action,before,after,sensitive);
    return {id:recordId,recordType:kind,version:Number(after.version),archived:action==="archive"};
  } catch(error){
    if((error as {code?:string}).code==="23505")throw new ConflictException("An employee record already uses this name");
    throw error;
  }
}
