import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {DataSource} from "typeorm";
import {HR_PERMISSIONS} from "@jinhu/shared";
import {ForbiddenException,NotFoundException} from "@nestjs/common";
import {HrLifecycleService} from "./hr-lifecycle.service";
const enabled=process.env.HR_LIFECYCLE_TEMPLATE_PG_REQUIRED==="1";
test("real PostgreSQL scoped template candidates/detail and new version preserve old checklist snapshot",{skip:!enabled},async()=>{
 if(process.env.POSTGRES_HOST!=="127.0.0.1"||process.env.POSTGRES_PORT!=="15483")throw new Error("Requires owned loopback15483");
 const connection={type:"postgres" as const,host:"127.0.0.1",port:15483,username:"postgres"},name=`hr_lifecycle_template_lab_${randomUUID().replaceAll("-","")}`,admin=new DataSource({...connection,database:"postgres"});let db:DataSource|undefined,created=false;
 try{
  await admin.initialize();await admin.query(`CREATE DATABASE ${name}`);created=true;db=new DataSource({...connection,database:name});await db.initialize();
  await db.query('CREATE EXTENSION "uuid-ossp"');
  // Narrow query/write fixture. Full migration/trigger acceptance remains the CI release gate.
  await db.query(`CREATE TABLE hr_lifecycle_checklist_template(id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id text,park_id text,template_code text,template_name text,checklist_type text,create_by uuid,update_by uuid,status text DEFAULT 'enabled',is_deleted boolean DEFAULT false);
   CREATE TABLE hr_lifecycle_checklist_template_version(id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id text,park_id text,template_id uuid,version_no int,status text,published_at timestamptz,create_by uuid,UNIQUE(tenant_id,park_id,template_id,version_no));
   CREATE TABLE hr_lifecycle_checklist_template_item(id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id text,park_id text,template_version_id uuid,item_code text,item_name text,category text,sequence_no int,default_due_days int,required boolean,UNIQUE(tenant_id,park_id,template_version_id,item_code));
   CREATE TABLE hr_employee(id uuid PRIMARY KEY,tenant_id text,park_id text,is_deleted boolean DEFAULT false,employment_status text);
   CREATE TABLE hr_lifecycle_checklist(id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id text,park_id text,employee_id uuid,checklist_type text,template_version int,template_version_id uuid,employment_event_id uuid,status text,snapshot jsonb,due_date date,create_by uuid,update_by uuid,is_deleted boolean DEFAULT false);
   CREATE TABLE hr_lifecycle_checklist_item(id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id text,park_id text,checklist_id uuid,item_code text,item_name text,category text,sequence_no int,due_date date,required boolean);`);
  const scope={tenantId:"tenant",parkId:"park"},actor={...scope,sub:randomUUID(),username:"synthetic",roles:[],permissions:[HR_PERMISSIONS.HR_LIFECYCLE_TEMPLATE_MANAGE,HR_PERMISSIONS.HR_LIFECYCLE_ASSIGN]},service=new HrLifecycleService(db,{} as never,{} as never),employeeId=randomUUID();
  await db.query("INSERT INTO hr_employee VALUES($1,$2,$3,false,'preboarding')",[employeeId,scope.tenantId,scope.parkId]);
  const items=[{code:"ACCOUNT",name:"合成账号",category:"account",defaultDueDays:-1,required:true},{code:"DOC",name:"合成资料",category:"documents",defaultDueDays:0,required:false}];
  const template=await service.createTemplate(scope,actor,{code:"SYN",name:"合成模板",type:"onboarding",items});
  const checklist=await service.createChecklist(scope,actor,{employeeId,templateVersionId:template.versionId,dueDate:"2026-10-08"});
  const before=await db.query("SELECT template_version_id,snapshot FROM hr_lifecycle_checklist WHERE id=$1",[checklist.id]),beforeItems=await db.query("SELECT item_code,item_name,sequence_no,due_date,required FROM hr_lifecycle_checklist_item WHERE checklist_id=$1 ORDER BY sequence_no",[checklist.id]);
  const published=await service.publishTemplateVersion(scope,actor,template.id,{items:[{...items[1]!,name:"新资料"},{...items[0]!,defaultDueDays:365}]});assert.equal(published.versionNo,2);
  const detail=await service.templateDetail(scope,actor,template.id);assert.deepEqual(detail.items,[{...items[1]!,name:"新资料"},{...items[0]!,defaultDueDays:365}]);assert.equal(detail.itemCount,2);
  assert.deepEqual(await db.query("SELECT template_version_id,snapshot FROM hr_lifecycle_checklist WHERE id=$1",[checklist.id]),before);assert.deepEqual(await db.query("SELECT item_code,item_name,sequence_no,due_date,required FROM hr_lifecycle_checklist_item WHERE checklist_id=$1 ORDER BY sequence_no",[checklist.id]),beforeItems);
  assert.equal((await db.query("SELECT employment_status FROM hr_employee WHERE id=$1",[employeeId]))[0].employment_status,"preboarding");
  const assign={...actor,permissions:[HR_PERMISSIONS.HR_LIFECYCLE_ASSIGN]};const options=await service.templateOptions(scope,assign);assert.equal(options[0].versionNo,2);assert.deepEqual(Object.keys(options[0]).sort(),["code","id","itemCount","name","type","versionId","versionNo"]);await assert.rejects(service.templateDetail(scope,assign,template.id),ForbiddenException);
  const otherScope={tenantId:"foreign",parkId:"other"},foreign=await service.createTemplate(otherScope,{...actor,...otherScope},{code:"FOREIGN",name:"外部模板",type:"onboarding",items});await assert.rejects(service.templateDetail(scope,actor,foreign.id),NotFoundException);
  const draft=await service.createTemplate(scope,actor,{code:"DRAFT",name:"未发布",type:"onboarding",items});await db.query("UPDATE hr_lifecycle_checklist_template_version SET status='draft' WHERE template_id=$1",[draft.id]);await assert.rejects(service.templateDetail(scope,actor,draft.id),NotFoundException);
  const disabled=await service.createTemplate(scope,actor,{code:"DISABLED",name:"停用",type:"onboarding",items});await db.query("UPDATE hr_lifecycle_checklist_template SET status='disabled' WHERE id=$1",[disabled.id]);assert.equal((await service.templateOptions(scope,assign)).length,1);
 }finally{if(db?.isInitialized)await db.destroy();if(admin.isInitialized){if(created){await admin.query(`DROP DATABASE ${name}`);assert.equal((await admin.query("SELECT count(*)::int total FROM pg_database WHERE datname=$1",[name]))[0].total,0);}await admin.destroy();}}
});
