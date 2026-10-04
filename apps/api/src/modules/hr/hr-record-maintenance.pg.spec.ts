import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes,randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ConfigService } from "@nestjs/config";
import { BadRequestException,ConflictException,ForbiddenException,NotFoundException } from "@nestjs/common";
import { DataSource } from "typeorm";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { PartySensitiveDataService } from "../../shared/security/party-sensitive-data.service";
import { HrLifecycleService } from "./hr-lifecycle.service";
import type { HrMaintainedRecordKind } from "./hr-record-transaction-write";
import { recoverCertifiedOriginalRecordSet, type OriginalRecordKind, type OriginalRecordSetCertificate } from "./hr-record-original-set";

test("formal extended records: actual PG CAS, encrypted history, owner scope, archive and rollback",{skip:process.env.HR_RECORDS_PG_REQUIRED!=="1",timeout:60000},async()=>{
  assert.equal(process.env.POSTGRES_HOST,"127.0.0.1");assert.equal(process.env.POSTGRES_PORT,"55495");
  const database=`jinhu_hr_records_lab_${randomBytes(12).toString("hex")}`;
  const options={type:"postgres" as const,host:"127.0.0.1",port:55495,username:process.env.POSTGRES_USER,password:process.env.POSTGRES_PASSWORD};
  const admin=new DataSource({...options,database:"postgres"});await admin.initialize();
  let db:DataSource|undefined,rivalDb:DataSource|undefined,created=false;
  try{
    await admin.query(`CREATE DATABASE "${database}" TEMPLATE template0`);created=true;
    db=new DataSource({...options,database});await db.initialize();rivalDb=new DataSource({...options,database});await rivalDb.initialize();
    assert.equal((await db.query("SELECT current_database() db"))[0].db,database);
    await db.query(`CREATE EXTENSION "uuid-ossp"; CREATE EXTENSION pgcrypto;
    CREATE TABLE sys_user(tenant_id varchar(64),park_id varchar(64),id uuid,UNIQUE(tenant_id,park_id,id));
    CREATE TABLE hr_employee(tenant_id varchar(64),park_id varchar(64),id uuid,is_deleted boolean DEFAULT false,UNIQUE(tenant_id,park_id,id));`);
    const migration=(name:string)=>readFileSync(resolve(__dirname,"../../../../../database/migrations",name),"utf8");
    const original=migration("000252_hr_lifecycle_employee_records.sql");
    await db.query(original.slice(original.indexOf("CREATE TABLE hr_employee_family ("),original.indexOf("CREATE FUNCTION hr_lifecycle_append_only()")));
    const extra=migration("000276_hr_legacy_employee_profile_materialization.sql");
    for(const kind of ["family","skill","credential"]){await db.query(extra.match(new RegExp(`ALTER TABLE hr_employee_${kind}[\\s\\S]*?;`))![0]);}
    await db.query(migration("000336_hr_family_record_changes.sql"));await db.query(migration("000338_hr_extended_record_changes.sql"));
    const s={tenantId:"synthetic-tenant",parkId:"synthetic-park"},sub=randomUUID(),employee=randomUUID(),other=randomUUID();
    await db.query("INSERT INTO sys_user VALUES($1,$2,$3)",[s.tenantId,s.parkId,sub]);
    await db.query("INSERT INTO hr_employee(tenant_id,park_id,id) VALUES($1,$2,$3),($1,$2,$4)",[s.tenantId,s.parkId,employee,other]);
    const a={...s,sub,username:"synthetic",roles:[],permissions:[HR_PERMISSIONS.HR_EMPLOYEE_RECORD_MANAGE]};
    const sensitive=new PartySensitiveDataService(new ConfigService({PARTY_DATA_ENCRYPTION_KEY:"synthetic-records-key-12345678901234567890"}));
    const svc=new HrLifecycleService(db,sensitive,{} as never),rival=new HrLifecycleService(rivalDb,sensitive,{} as never);
    const cases=[
      {kind:"experience" as const,input:{recordType:"work",organizationName:"Synthetic org",startDate:"2020-01-01"},patch:{title:"Updated"}},
      {kind:"skill" as const,input:{recordType:"skill",skillName:"Synthetic skill",legacyGrade:"Initial grade"},patch:{note:"Updated",legacyGrade:"Level 2"}},
      {kind:"credential" as const,input:{recordType:"credential",credentialType:"synthetic",credentialName:"Synthetic credential",credentialNumber:"SYN-SECRET",acquiredDate:"2020-01-01"},patch:{note:"Updated"}},
    ];
    for(const c of cases){
      const record=await svc.createRecord(s,a,employee,c.input);assert.equal(record.version,1);
      const table=`hr_employee_${c.kind}`,id=record.id;
      const initial:{number_encrypted:string}=(await db.query(`SELECT * FROM ${table} WHERE id=$1`,[id]))[0];
      if(c.kind==="skill")assert.equal((await db.query(`SELECT legacy_grade FROM ${table} WHERE id=$1`,[id]))[0].legacy_grade,"Initial grade");
      if(c.kind!=="experience")await db.query(`UPDATE ${table} SET legacy_source_identity_sha256=$2,legacy_source_row_sha256=$3 WHERE id=$1`,[id,"a".repeat(64),"b".repeat(64)]);
      await assert.rejects(svc.mutateEmployeeRecord(s,{...a,permissions:[]},employee,c.kind,id,{expectedVersion:1,...c.patch},"update"),ForbiddenException);
      await assert.rejects(svc.mutateEmployeeRecord({...s,parkId:"foreign"},a,employee,c.kind,id,{expectedVersion:1,...c.patch},"update"),NotFoundException);
      await assert.rejects(svc.mutateEmployeeRecord(s,a,other,c.kind,id,{expectedVersion:1,...c.patch},"update"),NotFoundException);
      await assert.rejects(svc.mutateEmployeeRecord(s,a,employee,"bogus" as HrMaintainedRecordKind,id,{expectedVersion:1},"archive"),BadRequestException);
      await assert.rejects(svc.mutateEmployeeRecord(s,a,employee,c.kind,id,{expectedVersion:1,employeeId:other},"update"),BadRequestException);
      const race=await Promise.allSettled([svc.mutateEmployeeRecord(s,a,employee,c.kind,id,{expectedVersion:1,...c.patch},"update"),rival.mutateEmployeeRecord(s,a,employee,c.kind,id,{expectedVersion:1,...c.patch},"update")]);
      assert.equal(race.filter(x=>x.status==="fulfilled").length,1);const failure=race.find(x=>x.status==="rejected");assert.ok(failure&&failure.status==="rejected"&&failure.reason instanceof ConflictException);
      const current:{version:number;number_encrypted:string;legacy_source_identity_sha256:string}=(await db.query(`SELECT * FROM ${table} WHERE id=$1`,[id]))[0];assert.equal(current.version,2);
      if(c.kind!=="experience")assert.equal(current.legacy_source_identity_sha256,"a".repeat(64));
      if(c.kind==="credential"){
        assert.equal(current.number_encrypted,initial.number_encrypted);assert.equal(sensitive.decrypt(current.number_encrypted),"SYN-SECRET");
        await assert.rejects(svc.mutateEmployeeRecord(s,a,employee,c.kind,id,{expectedVersion:2,credentialNumber:"SYN***"},"update"),BadRequestException);
        await assert.rejects(svc.mutateEmployeeRecord(s,a,employee,c.kind,id,{expectedVersion:2,validTo:"2019-12-31"},"update"),BadRequestException);
      }
      if(c.kind==="experience")await assert.rejects(svc.mutateEmployeeRecord(s,a,employee,c.kind,id,{expectedVersion:2,endDate:"2019-12-31"},"update"),BadRequestException);
      const journals:Array<{action:string;after_encrypted:string}>=await db.query(`SELECT * FROM ${table}_change WHERE record_id=$1 ORDER BY version`,[id]);assert.equal(journals.length,2);assert.equal(journals[0]!.action,"create");assert.equal(journals[1]!.action,"update");
      assert.equal(JSON.parse(sensitive.decrypt(journals[1]!.after_encrypted)!).version,2);
      await assert.rejects(db.query(`DELETE FROM ${table}_change WHERE record_id=$1`,[id]),/HR_RECORD_CHANGE_IMMUTABLE/);
      await db.query(`CREATE FUNCTION fail_${c.kind}_journal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic journal failure'; END $$; CREATE TRIGGER fail_${c.kind}_journal BEFORE INSERT ON ${table}_change FOR EACH ROW EXECUTE FUNCTION fail_${c.kind}_journal();`);
      await assert.rejects(svc.mutateEmployeeRecord(s,a,employee,c.kind,id,{expectedVersion:2,...c.patch},"update"),/synthetic journal failure/);
      const beforeCreate:number=Number((await db.query(`SELECT count(*) n FROM ${table}`))[0].n);
      const fresh={...c.input,...(c.kind==="skill"?{skillName:"Synthetic rollback skill"}:{})};
      await assert.rejects(svc.createRecord(s,a,employee,fresh),/synthetic journal failure/);
      assert.equal(Number((await db.query(`SELECT count(*) n FROM ${table}`))[0].n),beforeCreate);
      assert.equal((await db.query(`SELECT version FROM ${table} WHERE id=$1`,[id]))[0].version,2);
      await db.query(`DROP TRIGGER fail_${c.kind}_journal ON ${table}_change`);
      await assert.rejects(svc.mutateEmployeeRecord(s,a,employee,c.kind,id,{expectedVersion:2,note:"extra"},"archive"),BadRequestException);
      if(c.kind==="credential"){
        await svc.mutateEmployeeRecord(s,a,employee,c.kind,id,{expectedVersion:2,credentialNumber:null},"update");
        const cleared:Record<string,unknown>=(await db.query(`SELECT * FROM ${table} WHERE id=$1`,[id]))[0];
        for(const key of ["number_encrypted","number_masked","number_fingerprint"])assert.equal(cleared[key],null);
      }
      const version=c.kind==="credential"?3:2;
      const archived=await svc.mutateEmployeeRecord(s,a,employee,c.kind,id,{expectedVersion:version},"archive");assert.equal(archived.archived,true);
      assert.equal((await db.query(`SELECT is_deleted FROM ${table} WHERE id=$1`,[id]))[0].is_deleted,true);
      await assert.rejects(svc.mutateEmployeeRecord(s,a,employee,c.kind,id,{expectedVersion:version+1,...c.patch},"update"),NotFoundException);
    }
    const imported=randomUUID();
    await db.query("INSERT INTO hr_employee_skill(id,tenant_id,park_id,employee_id,skill_name,legacy_grade,legacy_source_identity_sha256,legacy_source_row_sha256,create_by,update_by) VALUES($1,$2,$3,$4,'Synthetic imported skill','Original level',$5,$6,$7,$7)",[imported,s.tenantId,s.parkId,employee,"c".repeat(64),"d".repeat(64),sub]);
    await svc.mutateEmployeeRecord(s,a,employee,"skill",imported,{expectedVersion:1,proficiency:"advanced"},"update");
    const originalPreserved:{legacy_grade:string;legacy_source_row_sha256:string}=(await db.query("SELECT * FROM hr_employee_skill WHERE id=$1",[imported]))[0];
    assert.equal(originalPreserved.legacy_grade,"Original level");assert.equal(originalPreserved.legacy_source_row_sha256,"d".repeat(64));
    assert.equal(Number((await db.query("SELECT count(*) n FROM hr_employee_skill_change WHERE record_id=$1 AND version=2 AND action='update'",[imported]))[0].n),1);
    // Original T5 rows have no create journal. Certificates are captured before
    // modern edits in this synthetic fixture, never derived from edited data.
    for (const kind of ["skill","credential"] as const) {
      const ids=[randomUUID(),randomUUID()],table=`hr_employee_${kind}`;
      for (const [index,id] of ids.entries()) {
        const metadata=[id,s.tenantId,s.parkId,employee,(index===0?"e":"f").repeat(64),(index===0?"1":"2").repeat(64),sub];
        if(kind==="skill") await db.query(`INSERT INTO ${table}(id,tenant_id,park_id,employee_id,skill_name,legacy_grade,legacy_source_identity_sha256,legacy_source_row_sha256,create_by,update_by) VALUES($1,$2,$3,$4,$8,'Original grade',$5,$6,$7,$7)`,[...metadata,`Synthetic baseline ${index}`]);
        else {
          const number=sensitive.identityProfile(`SYN-ORIGINAL-${index}`);
          await db.query(`INSERT INTO ${table}(id,tenant_id,park_id,employee_id,credential_type,credential_name,number_encrypted,number_masked,number_fingerprint,acquired_date,valid_to,legacy_source_identity_sha256,legacy_source_row_sha256,create_by,update_by) VALUES($1,$2,$3,$4,'synthetic',$8,$9,$10,$11,'2020-02-29','2030-01-01',$5,$6,$7,$7)`,[...metadata,`Synthetic baseline ${index}`,number.encrypted,number.masked,number.hash]);
        }
      }
      const certificate:OriginalRecordSetCertificate=await db.transaction(async m=>{
        await m.query("SET LOCAL TIME ZONE 'Asia/Shanghai'");
        return (await m.query(`SELECT count(*)::int AS count,encode(digest(COALESCE(string_agg(h,'' ORDER BY h),''),'sha256'),'hex') AS sha256 FROM (SELECT encode(digest(to_jsonb(r)::text,'sha256'),'hex') h FROM ${table} r WHERE id=ANY($1::uuid[])) hashes`,[ids]))[0] as OriginalRecordSetCertificate;
      });
      const proof=(scope=s,keys=ids,cert=certificate,domain:OriginalRecordKind=kind)=>db!.transaction(m=>recoverCertifiedOriginalRecordSet(m,scope,domain,keys,cert,sensitive));
      const untouched=await proof();assert.equal(untouched.size,2);assert.equal(untouched.get(ids[0]!)!.version,1);
      await assert.rejects(recoverCertifiedOriginalRecordSet(db.manager,s,kind,ids,certificate,sensitive),/RECORD_ORIGINAL_SET_INVALID/);
      await assert.rejects(proof({...s,parkId:"foreign"}),/RECORD_ORIGINAL_SET_INVALID/);
      await assert.rejects(proof(s,[ids[0]!,ids[0]!]),/RECORD_ORIGINAL_SET_INVALID/);
      await assert.rejects(proof(s,ids,{...certificate,sha256:"0".repeat(64)}),/RECORD_ORIGINAL_SET_INVALID/);
      await assert.rejects(proof(s,ids,certificate,"experience" as OriginalRecordKind),/RECORD_ORIGINAL_SET_INVALID/);
      await svc.mutateEmployeeRecord(s,a,employee,kind,ids[0]!,{expectedVersion:1,...(kind==="skill"?{legacyGrade:"Modern grade",proficiency:"advanced"}:{credentialNumber:null,validTo:null})},"update");
      await svc.mutateEmployeeRecord(s,a,employee,kind,ids[0]!,{expectedVersion:2},"archive");
      const beforeProof:Array<{snapshot:Record<string,unknown>}>=await db.query(`SELECT to_jsonb(r) snapshot FROM ${table} r WHERE id=ANY($1::uuid[]) ORDER BY id`,[ids]);
      const restored=await proof();assert.deepEqual(restored,untouched);
      assert.equal(restored.get(ids[0]!)!.is_deleted,false);
      if(kind==="credential")assert.equal(sensitive.decrypt(String(restored.get(ids[0]!)!.number_encrypted)),"SYN-ORIGINAL-0");
      assert.deepEqual(await db.query(`SELECT to_jsonb(r) snapshot FROM ${table} r WHERE id=ANY($1::uuid[]) ORDER BY id`,[ids]),beforeProof);
      // A version bump without first-before history cannot be treated as an
      // original baseline, even with a matching caller-supplied current hash.
      await db.query(`UPDATE ${table} SET version=2 WHERE id=$1`,[ids[1]]);
      await assert.rejects(proof(),/RECORD_ORIGINAL_SET_INVALID/);
      await db.query(`UPDATE ${table} SET version=1 WHERE id=$1`,[ids[1]]);
      await db.query(`UPDATE ${table} SET legacy_source_row_sha256=$2 WHERE id=$1`,[ids[0],"3".repeat(64)]);
      await assert.rejects(proof(),/RECORD_ORIGINAL_SET_INVALID/);
    }
  }finally{
    if(rivalDb?.isInitialized)await rivalDb.destroy();if(db?.isInitialized)await db.destroy();
    if(created)await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);assert.equal((await admin.query("SELECT 1 FROM pg_database WHERE datname=$1",[database])).length,0);await admin.destroy();
  }
});
