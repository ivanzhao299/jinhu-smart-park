import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ConfigService } from "@nestjs/config";
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { DataSource } from "typeorm";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { PartySensitiveDataService } from "../../shared/security/party-sensitive-data.service";
import { HrLifecycleService } from "./hr-lifecycle.service";

test("family maintenance uses scoped CAS, preserves omitted encrypted fields and rolls back failed journals", {
  skip: process.env.HR_FAMILY_PG_REQUIRED !== "1", timeout: 60000,
}, async () => {
  assert.equal(process.env.POSTGRES_HOST,"127.0.0.1");
  assert.equal(Number(process.env.POSTGRES_PORT),55495);
  const database=`jinhu_hr_family_lab_${randomBytes(12).toString("hex")}`;
  const options={type:"postgres" as const,host:"127.0.0.1",port:55495,username:process.env.POSTGRES_USER,password:process.env.POSTGRES_PASSWORD};
  const admin=new DataSource({...options,database:"postgres"});await admin.initialize();
  let db:DataSource|undefined,second:DataSource|undefined,created=false;
  try {
    await admin.query(`CREATE DATABASE "${database}" TEMPLATE template0`);created=true;
    db=new DataSource({...options,database});await db.initialize();
    second=new DataSource({...options,database});await second.initialize();
    await db.query(`CREATE EXTENSION "uuid-ossp";
      CREATE TABLE sys_user(tenant_id varchar(64),park_id varchar(64),id uuid,UNIQUE(tenant_id,park_id,id));
      CREATE TABLE hr_employee(tenant_id varchar(64),park_id varchar(64),id uuid,user_id uuid,is_deleted boolean DEFAULT false,UNIQUE(tenant_id,park_id,id));`);
    const migration=(name:string)=>readFileSync(resolve(__dirname,"../../../../../database/migrations",name),"utf8");
    const original=migration("000252_hr_lifecycle_employee_records.sql");
    const family=original.slice(original.indexOf("CREATE TABLE hr_employee_family ("),original.indexOf("CREATE FUNCTION hr_lifecycle_append_only()"));
    assert.ok(family.startsWith("CREATE TABLE hr_employee_family ("));await db.query(family);
    const materialization=migration("000276_hr_legacy_employee_profile_materialization.sql");
    for(const domain of ["family","skill","credential"]){
      await db.query(materialization.match(new RegExp(`ALTER TABLE hr_employee_${domain}[\\s\\S]*?;`))![0]);
      await db.query(materialization.match(new RegExp(`CREATE UNIQUE INDEX uq_hr_employee_${domain}_legacy_source[\\s\\S]*?;`))![0]);
    }
    await db.query(migration("000335_hr_family_record_changes.sql"));
    const scope={tenantId:"synthetic-tenant",parkId:"synthetic-park"},actorId=randomUUID(),employeeId=randomUUID(),otherId=randomUUID();
    const actor={sub:actorId,username:"synthetic",...scope,roles:[],permissions:[HR_PERMISSIONS.HR_EMPLOYEE_RECORD_MANAGE,HR_PERMISSIONS.HR_EMPLOYEE_RECORD_READ,HR_PERMISSIONS.HR_EMPLOYEE_FAMILY_READ]};
    await db.query("INSERT INTO sys_user VALUES($1,$2,$3)",[scope.tenantId,scope.parkId,actorId]);
    await db.query("INSERT INTO hr_employee(tenant_id,park_id,id,user_id) VALUES($1,$2,$3,$5),($1,$2,$4,NULL)",[scope.tenantId,scope.parkId,employeeId,otherId,actorId]);
    const sensitive=new PartySensitiveDataService(new ConfigService({PARTY_DATA_ENCRYPTION_KEY:"synthetic-family-key-12345678901234567890"}));
    const audit={recordOperationRequired:async()=>undefined} as never;
    const service=new HrLifecycleService(db,sensitive,audit),rival=new HrLifecycleService(second,sensitive,audit);
    const record=await service.createRecord(scope,actor,employeeId,{recordType:"family",relationship:"synthetic relationship",fullName:"Synthetic family",identityNumber:"SYN-ID",contact:"SYN-CONTACT",birthDate:"2000-02-29"});
    assert.ok("version" in record);assert.equal(record.version,1);
    const familyId=record.id;
    await db.query("UPDATE hr_employee_family SET legacy_source_identity_sha256=$2,legacy_source_row_sha256=$3 WHERE id=$1",[familyId,"a".repeat(64),"b".repeat(64)]);
    const initial=(await db.query("SELECT * FROM hr_employee_family WHERE id=$1",[familyId]))[0];
    const read=await service.listRecords(scope,actor,employeeId);
    assert.equal(read.family[0].version,1);assert.equal(read.family[0].fullName,"Synthetic family");
    assert.equal("identity_encrypted" in read.family[0],false);assert.equal("identityNumber" in read.family[0],false);
    const selfRead=await service.listRecords(scope,{...actor,permissions:[HR_PERMISSIONS.HR_EMPLOYEE_RECORD_SELF_READ]},employeeId);
    assert.equal("fullName" in selfRead.family[0],false);assert.equal("contact" in selfRead.family[0],false);
    assert.equal(selfRead.family[0].version,1);
    await assert.rejects(service.updateFamilyRecord(scope,{...actor,permissions:[]},employeeId,familyId,{expectedVersion:1,workUnit:"denied"}),ForbiddenException);
    await assert.rejects(service.updateFamilyRecord({...scope,parkId:"foreign"},actor,employeeId,familyId,{expectedVersion:1,workUnit:"denied"}),NotFoundException);
    await assert.rejects(service.updateFamilyRecord(scope,actor,otherId,familyId,{expectedVersion:1,workUnit:"denied"}),NotFoundException);
    await assert.rejects(service.updateFamilyRecord(scope,actor,employeeId,familyId,{expectedVersion:1}),BadRequestException);
    await assert.rejects(service.updateFamilyRecord(scope,actor,employeeId,familyId,{expectedVersion:1,identityNumber:"SYN***"}),BadRequestException);
    await assert.rejects(service.updateFamilyRecord(scope,actor,employeeId,familyId,{expectedVersion:1,birthDate:"2026-02-30"}),BadRequestException);
    await assert.rejects(service.archiveFamilyRecord(scope,actor,employeeId,familyId,{expectedVersion:0}),BadRequestException);
    const concurrent=await Promise.allSettled([
      service.updateFamilyRecord(scope,actor,employeeId,familyId,{expectedVersion:1,workUnit:"one"}),
      rival.updateFamilyRecord(scope,actor,employeeId,familyId,{expectedVersion:1,workUnit:"two"}),
    ]);
    assert.equal(concurrent.filter(x=>x.status==="fulfilled").length,1);
    assert.equal(concurrent.filter(x=>x.status==="rejected").length,1);
    for(const result of concurrent)if(result.status==="rejected")assert.ok(result.reason instanceof ConflictException);
    const maintained=(await db.query("SELECT * FROM hr_employee_family WHERE id=$1",[familyId]))[0];
    for(const column of ["full_name_encrypted","identity_encrypted","contact_encrypted","legacy_source_identity_sha256","legacy_source_row_sha256"])
      assert.equal(maintained[column],initial[column]);
    await service.updateFamilyRecord(scope,actor,employeeId,familyId,{expectedVersion:2,identityNumber:null,isEmergencyContact:false});
    const cleared=(await db.query("SELECT * FROM hr_employee_family WHERE id=$1",[familyId]))[0];
    assert.equal(cleared.version,3);assert.equal(cleared.identity_encrypted,null);assert.equal(cleared.identity_masked,null);assert.equal(cleared.identity_fingerprint,null);
    assert.equal(cleared.contact_encrypted,initial.contact_encrypted);
    const journals=await db.query("SELECT * FROM hr_employee_family_change ORDER BY version");
    assert.equal(journals.length,3);
    for(const journal of journals)assert.match(journal.after_encrypted,/^enc:v1:/);
    assert.equal(JSON.parse(sensitive.decrypt(journals[2].before_encrypted)!).identity_encrypted,initial.identity_encrypted);
    assert.equal(JSON.parse(sensitive.decrypt(journals[2].after_encrypted)!).identity_encrypted,null);
    await assert.rejects(db.query("UPDATE hr_employee_family_change SET action='archive'"),/HR_FAMILY_CHANGE_IMMUTABLE/);
    await db.query("CREATE FUNCTION synthetic_reject_family_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SYNTHETIC_AUDIT_FAILURE'; END $$; CREATE TRIGGER synthetic_reject_family_change BEFORE INSERT ON hr_employee_family_change FOR EACH ROW EXECUTE FUNCTION synthetic_reject_family_change()");
    await assert.rejects(service.updateFamilyRecord(scope,actor,employeeId,familyId,{expectedVersion:3,fullName:"must roll back"}));
    await assert.rejects(service.archiveFamilyRecord(scope,actor,employeeId,familyId,{expectedVersion:3}));
    await assert.rejects(service.createRecord(scope,actor,employeeId,{recordType:"family",relationship:"synthetic",fullName:"must roll back"}));
    assert.deepEqual((await db.query("SELECT * FROM hr_employee_family WHERE id=$1",[familyId]))[0],cleared);
    assert.equal(Number((await db.query("SELECT count(*) n FROM hr_employee_family"))[0].n),1);
    await db.query("DROP TRIGGER synthetic_reject_family_change ON hr_employee_family_change");
    await service.archiveFamilyRecord(scope,actor,employeeId,familyId,{expectedVersion:3});
    const archived=(await db.query("SELECT * FROM hr_employee_family WHERE id=$1",[familyId]))[0];
    assert.equal(archived.version,4);assert.equal(archived.is_deleted,true);
    assert.equal(archived.legacy_source_row_sha256,initial.legacy_source_row_sha256);
    assert.equal((await service.listRecords(scope,actor,employeeId)).family.length,0);
    await assert.rejects(service.archiveFamilyRecord(scope,actor,employeeId,familyId,{expectedVersion:4}));
  } finally {
    if(second?.isInitialized)await second.destroy();if(db?.isInitialized)await db.destroy();
    if(created)await admin.query(`DROP DATABASE "${database}"`);
    assert.equal((await admin.query("SELECT datname FROM pg_database WHERE datname=$1",[database])).length,0);
    await admin.destroy();
  }
});
