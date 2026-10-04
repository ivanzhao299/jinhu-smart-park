import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { URL } from 'node:url';
import pg from 'pg';
import { buildT5QuarantineImpactReadonlySql, sanitizeT5QuarantineImpactObservation,sanitizeCurrentReviewReferences,
  buildT5ProfileAggregateReadonlySql, sanitizeT5ProfileAggregateObservation, buildCredentialExclusionReadonlySql, sanitizeCredentialExclusionObservation } from '../diagnose-production-runtime-revision.mjs';

// Fixed existing loopback lab only; never connect to an existing business database.
// Credentials remain in process memory. No schema/data is read from another DB.
const container='jinhu_hr_migration_lab_import_20261001_a';
const database=`yz_t5_impact_review_${randomBytes(8).toString('hex')}`;
assert.match(database,/^yz_t5_impact_review_[a-f0-9]{16}$/u);
const migration=name=>readFileSync(new URL(`../../database/migrations/${name}`,import.meta.url),'utf8');
const control=migration('000317_hr_yuzhou_t5_followon.sql');
function tableDDL(sql,name) {
  const result=sql.match(new RegExp(`CREATE TABLE (?:IF NOT EXISTS )?${name} \\([\\s\\S]*?;`,'u'));
  assert.ok(result,`missing table ${name}`);
  return result[0];
}
const operation='yzprod-import-20261002T012708Z-8d16a426fe54';
const parent='yzprod-import-20261001T204140Z-c19af6def55c';
const payroll='yzprod-import-20261002T000000Z-111111111111';
const sha=s=>createHash('sha256').update(s).digest('hex');
const binding={operationId:operation,parent:{operationId:parent},payrollParent:{operationId:payroll},intent:'APPEND_T5_FULL_HISTORY_ONCE',
  executionCodeSha:'7c3df1c230bde74badbf414acae36030d5fe8709',sourceMappingContractSha256:'d44b0f904fb3240d45a52b8dc8a3510ce5622ecb6f7f41356fbe6e48fa53b7e0',
  targetScope:{tenantId:'10000001',parkId:'20000001'},triple:{sourceSnapshotHash:sha('synthetic snapshot')}};
let admin,client,created=false,stage='loopback guard';
let checks=0;
try {
  const ports=execFileSync('docker',['port',container,'5432/tcp'],{encoding:'utf8',timeout:10000});
  assert.equal(ports.trim(),'127.0.0.1:55491');
  const [user,password]=execFileSync('docker',['exec',container,'sh','-c','printf "%s\\n%s" "$POSTGRES_USER" "$POSTGRES_PASSWORD"'],
    {encoding:'utf8',timeout:10000,stdio:['ignore','pipe','pipe']}).split('\n');
  assert.ok(user && password);
  const config={host:'127.0.0.1',port:55491,user,password,connectionTimeoutMillis:5000,statement_timeout:30000};
  admin=new pg.Client({...config,database:'postgres'});await admin.connect();
  stage='create fresh database';
  await admin.query(`CREATE DATABASE "${database}" TEMPLATE template0`);created=true;
  client=new pg.Client({...config,database});await client.connect();
  assert.equal((await client.query('SELECT current_database() db')).rows[0].db,database);
  stage='faithful schema';
  // Actual 317 table definitions, actual 230 employee/profile, 238 contract,
  // and 235 map. Unused dependency tables are ID-only stubs. sys_user includes
  // only observer fields, with current UserEntity varchar status + boolean enabled.
  await client.query(`CREATE EXTENSION pgcrypto; CREATE EXTENSION "uuid-ossp";
    SET TIME ZONE 'Asia/Shanghai';
    CREATE TABLE hr_yuzhou_production_import_operation(operation_id varchar(64) PRIMARY KEY);
    CREATE TABLE hr_yuzhou_t4_followon_operation(operation_id varchar(64) PRIMARY KEY);
    CREATE TABLE sys_user(id uuid PRIMARY KEY,tenant_id varchar(64) NOT NULL,is_deleted boolean NOT NULL DEFAULT false,
      is_enabled boolean NOT NULL DEFAULT true,status varchar(32) NOT NULL DEFAULT 'enabled');
    CREATE TABLE sys_org(id uuid PRIMARY KEY); CREATE TABLE hr_position(id uuid PRIMARY KEY);
    CREATE TABLE hr_contract_type(id uuid PRIMARY KEY);
    ${tableDDL(migration('000230_hr_employee_foundation.sql'),'hr_employee')}
    ALTER TABLE hr_employee ADD UNIQUE(tenant_id,park_id,id);
    ${tableDDL(migration('000230_hr_employee_foundation.sql'),'hr_employee_profile')}
    ${tableDDL(migration('000238_hr_contract_history.sql'),'hr_contract')}
    ${tableDDL(control,'hr_yuzhou_t5_followon_operation')}
    CREATE TABLE migration_batch(id uuid PRIMARY KEY,t5_followon_operation_id varchar(64) UNIQUE REFERENCES hr_yuzhou_t5_followon_operation(operation_id),
      run_id varchar(64),source_system varchar(64),execution_context varchar(32),status varchar(32),finished_at timestamptz,
      source_snapshot_sha256 char(64),tool_version varchar(64),target_database varchar(128));
    ${tableDDL(migration('000235_hr_legacy_migration_control.sql'),'legacy_record_map')}
    CREATE UNIQUE INDEX uq_map_source ON legacy_record_map(source_system,source_table,source_identity_sha256) WHERE is_active;
    ${tableDDL(control,'hr_yuzhou_t5_followon_source')}
    ${tableDDL(control,'hr_yuzhou_t5_followon_projection_receipt')}`);
  // Financial observer tables use their exact original DDL and constraints.
  // Unused referenced objects are scoped-ID stubs; this is SQL-observer evidence,
  // not a full migration or financial writer/trigger acceptance test.
  for(const name of ['hr_insurance_owned_preview','hr_payroll_legacy_batch','hr_attendance_payroll_input_batch',
    'hr_payroll_legacy_snapshot','hr_attendance_payroll_input_item','hr_employee_compensation','hr_employee_insurance_period']){
    await client.query(`CREATE TABLE ${name}(id uuid PRIMARY KEY,tenant_id varchar(64),park_id varchar(64),UNIQUE(tenant_id,park_id,id))`);
  }
  for(const [file,names] of [
    ['000233_hr_compensation_payroll.sql',['hr_payroll_period','hr_payroll_run','hr_payslip']],
    ['000248_hr_payroll_legacy_history.sql',['hr_payroll_book','hr_payroll_book_period','hr_payroll_book_membership']],
    ['000250_hr_payroll_reconciliation_simulation.sql',['hr_payroll_reconciliation_run','hr_payroll_reconciliation_result']],
    ['000323_hr_insurance_owned_period.sql',['hr_insurance_owned_revision','hr_insurance_owned_close']],
  ])for(const name of names)await client.query(tableDDL(migration(file),name));
  // Execute the unmodified original owned_state function to authenticate observer
  // parity. Empty target stubs are sufficient for the unrelated table loop.
  for(const name of ['hr_employee_family','hr_employee_skill','hr_employee_credential','hr_custom_field_definition',
    'hr_custom_field_legacy_logic_fingerprint','hr_employee_custom_value','hr_legacy_identity_registry','hr_legacy_archive_record',
    'hr_legacy_file_logical_record','hr_legacy_file_blob_object','sys_file']) {
    await client.query(`CREATE TABLE ${name}(id uuid PRIMARY KEY,tenant_id varchar(64),park_id varchar(64))`);
  }
  const originalFunction=control.match(/CREATE FUNCTION hr_yuzhou_t5_followon_owned_state\(p_operation_id varchar\)[\s\S]*?END \$\$;/u)?.[0];
  assert.ok(originalFunction);await client.query(originalFunction);
  await client.query('INSERT INTO hr_yuzhou_production_import_operation VALUES($1)',[parent]);
  await client.query('INSERT INTO hr_yuzhou_t4_followon_operation VALUES($1)',[payroll]);
  await client.query(`INSERT INTO hr_yuzhou_t5_followon_operation(operation_id,parent_operation_id,payroll_operation_id,binding_sha256,binding,status,finished_at)
    VALUES($1,$2,$3,$4,$5,'succeeded',now())`,[operation,parent,payroll,'c15e13525f5c03ff06426150a2c7539f61e1a6ce5464af90e537380211b9559e',binding]);
  const batch=randomUUID(),contractType=randomUUID();
  await client.query(`INSERT INTO migration_batch VALUES($1,$2,$2,'yuzhou-v10','t5_production_followon','succeeded',now(),$3,$4,current_database())`,
    [batch,operation,binding.triple.sourceSnapshotHash,`t5-followon-v1@${binding.executionCodeSha}`]);
  await client.query('INSERT INTO hr_contract_type VALUES($1)',[contractType]);
  async function receipt(targetTable,identity,rowHash,targetId=null,reason='SYNTHETIC_SCREEN') {
    await client.query(`INSERT INTO hr_yuzhou_t5_followon_projection_receipt VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [operation,targetTable,identity,rowHash,targetId?'insert':'quarantine',targetId,targetId?null:reason]);
  }
  const sources=new Map(),employees=new Map(),maps=new Map();
  async function fixture(label,options={}) {
    const {status='departed',unmapped=false,missing=false,invalidMap=false,deleted=false,account,contract}=options;
    const identity=sha(label),rowHash=sha(`${label}:row`),employee=randomUUID(),map=randomUUID(),source=randomUUID();
    employees.set(label,employee);maps.set(label,map);sources.set(label,source);
    let accountId=null;
    if(account){accountId=randomUUID();await client.query('INSERT INTO sys_user(id,tenant_id,is_enabled,status) VALUES($1,$2,$3,$4)',[accountId,'10000001',account==='enabled',account]);}
    await client.query(`INSERT INTO hr_employee(id,tenant_id,park_id,employee_code,full_name,user_id,employment_status,is_deleted)
      VALUES($1,'10000001','20000001',$2,'Synthetic fixture',$3,$4,$5)`,[employee,label,accountId,status,deleted]);
    await client.query(`INSERT INTO legacy_record_map(id,batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,target_table,target_id,mapping_status,is_active)
      VALUES($1,$2,'yuzhou-v10','dbo.person',$3,$4,$5,'hr_employee',$6,'loaded',$7)`,[map,batch,`sha256:${identity}`,identity,rowHash,employee,!invalidMap]);
    if(contract)await client.query(`INSERT INTO hr_contract(tenant_id,park_id,employee_id,contract_type_id,contract_no,status,start_date,end_date,is_deleted)
      VALUES('10000001','20000001',$1,$2,$3,$4,$5,$6,$7)`,[employee,contractType,label,contract.status??'active',contract.start??null,contract.end??null,contract.deleted??false]);
    if(!missing){
      await client.query(`INSERT INTO hr_yuzhou_t5_followon_source(id,operation_id,tenant_id,park_id,source_domain,source_table,source_identity_sha256,source_row_sha256,encrypted_source,owner_status,employee_id,owner_record_map_id)
        VALUES($1,$2,'10000001','20000001','person_core','dbo.person',$3,$4,$5,$6,$7,$8)`,
        [source,operation,identity,rowHash,`enc:v1:${'0'.repeat(24)}:${'0'.repeat(32)}:00`,unmapped?'unmapped':'mapped',unmapped?null:employee,unmapped?null:map]);
      await receipt('hr_yuzhou_t5_followon_source',identity,rowHash,source);
    }
    await receipt('hr_employee_profile',identity,rowHash,null,label.toUpperCase());
  }
  stage='synthetic fixtures';
  await fixture('historical');
  await fixture('enabled_user',{account:'enabled'});
  await fixture('past_active_contract',{contract:{start:'2000-01-01',end:'2001-01-01'}});
  await fixture('future_active_contract',{contract:{start:'2099-01-01',end:'2100-01-01'}});
  await fixture('active_employee',{status:'active'});
  await fixture('unresolved',{unmapped:true});
  await fixture('missing',{missing:true});
  await fixture('invalid_map',{invalidMap:true});
  await fixture('deleted_owner',{deleted:true});
  await fixture('unknown_status',{status:'preboarding'});
  await fixture('disabled_user',{account:'disabled'});
  await fixture('deleted_contract',{contract:{deleted:true}});
  await fixture('expired_contract',{contract:{status:'expired'}});
  await fixture('ambiguous');
  const extraSource=randomUUID();
  await client.query(`INSERT INTO hr_yuzhou_t5_followon_source SELECT $1,operation_id,tenant_id,park_id,source_domain,'dbo.synthetic_other',source_identity_sha256,
    source_row_sha256,encrypted_source,owner_status,employee_id,owner_record_map_id,create_time FROM hr_yuzhou_t5_followon_source WHERE id=$2`,[extraSource,sources.get('ambiguous')]);
  await receipt('hr_yuzhou_t5_followon_source',sha('synthetic duplicate receipt'),sha('ambiguous:row'),extraSource);
  const profile=randomUUID();
  await client.query(`INSERT INTO hr_employee_profile(id,tenant_id,park_id,employee_id) VALUES($1,'10000001','20000001',$2)`,[profile,employees.get('historical')]);
  await receipt('hr_employee_profile',sha('inserted profile'),sha('profile row'),profile);
  stage='financial fixtures';
  for(const label of ['financial_payroll','financial_book','financial_insurance','financial_reconciliation','financial_overlap'])await fixture(label);
  const period=randomUUID(),run=randomUUID(),book=randomUUID(),bookPeriod=randomUUID(),reconciliation=randomUUID();
  await client.query(`INSERT INTO hr_payroll_period(id,tenant_id,park_id,period_month,start_date,end_date) VALUES($1,'10000001','20000001','2026-10-01','2026-10-01','2026-10-31'),
    (uuid_generate_v4(),'10000001','20000001','2026-11-01','2026-11-01','2026-11-30')`,[period]);
  await client.query(`INSERT INTO hr_payroll_run(id,tenant_id,park_id,period_id,run_no) VALUES($1,'10000001','20000001',$2,1)`,[run,period]);
  for(const label of ['financial_payroll','financial_overlap','invalid_map','unresolved','missing','ambiguous','deleted_owner'])await client.query(`INSERT INTO hr_payslip(tenant_id,park_id,run_id,employee_id,gross_amount,deduction_amount,net_amount)
    VALUES('10000001','20000001',$1,$2,0,0,0)`,[run,employees.get(label)]);
  await client.query(`INSERT INTO hr_payroll_book(id,tenant_id,park_id,legacy_scheme,source_hash) VALUES($1,'10000001','20000001',1,$2)`,[book,sha('book')]);
  await client.query(`INSERT INTO hr_payroll_book_period(id,tenant_id,park_id,book_id,period_month,legacy_close_state,source_hash)
    VALUES($1,'10000001','20000001',$2,'2000-01-01',0,$3)`,[bookPeriod,book,sha('period')]);
  await client.query(`INSERT INTO hr_payroll_book_membership(tenant_id,park_id,book_id,employee_id,legacy_membership_id,legacy_employee_hash,mapping_status,source_hash)
    VALUES('10000001','20000001',$1,$2,1,$3,'mapped',$3),('10000001','20000001',$1,NULL,2,$3,'employee_unmapped',$3)`,[book,employees.get('financial_book'),sha('member')]);
  const insurance=randomUUID(),actor=randomUUID();
  async function addInsurance(id,employee,revision=1,previous=null,month='2026-10-01'){
    const preview=randomUUID();await client.query(`INSERT INTO hr_insurance_owned_preview VALUES($1,'10000001','20000001')`,[preview]);
    await client.query(`INSERT INTO hr_insurance_owned_revision(id,tenant_id,park_id,employee_id,period_month,revision_no,preview_id,previous_revision_id,request_id,request_sha256,created_by,reason)
      VALUES($1,'10000001','20000001',$2,$3,$4,$5,$6,$7,$8,$9,'Synthetic fixture')`,[id,employee,month,revision,preview,previous,randomUUID(),sha('insurance'),actor]);
  }
  async function closeInsurance(id){await client.query(`INSERT INTO hr_insurance_owned_close(tenant_id,park_id,revision_id,request_id,request_sha256,created_by,reason)
    VALUES('10000001','20000001',$1,$2,$3,$4,'Synthetic close')`,[id,randomUUID(),sha('close'),actor]);}
  await addInsurance(insurance,employees.get('financial_insurance'));
  await addInsurance(randomUUID(),employees.get('financial_overlap'));
  const legacyBatch=randomUUID(),attendance=randomUUID(),snapshot=randomUUID(),attendanceItem=randomUUID();
  for(const [table,id] of [['hr_payroll_legacy_batch',legacyBatch],['hr_attendance_payroll_input_batch',attendance],['hr_payroll_legacy_snapshot',snapshot],['hr_attendance_payroll_input_item',attendanceItem]])
    await client.query(`INSERT INTO ${table} VALUES($1,'10000001','20000001')`,[id]);
  async function addReconciliation(id,status='review',supersedes=null){await client.query(`INSERT INTO hr_payroll_reconciliation_run(id,tenant_id,park_id,legacy_batch_id,attendance_input_batch_id,parser_version,engine_version,status,
    frozen_employee_version,frozen_compensation_version,frozen_insurance_version,frozen_formula_version,input_snapshot_hash,supersedes_run_id,employee_count,difference_count,create_by)
    VALUES($1,'10000001','20000001',$2,$3,'synthetic','synthetic',$4,'{}','{}','{}','{}',$5,$6,0,0,$7)`,[id,legacyBatch,attendance,status,sha('reconciliation'),supersedes,actor]);}
  await addReconciliation(reconciliation);await addReconciliation(randomUUID(),'calculating');
  await client.query(`INSERT INTO hr_payroll_reconciliation_result(tenant_id,park_id,run_id,employee_id,legacy_snapshot_id,employee_version,attendance_input_item_id,old_total,new_total,delta_total,review_status,create_by)
    VALUES('10000001','20000001',$1,$2,$3,1,$4,0,0,0,'needs_review',$5)`,[reconciliation,employees.get('financial_reconciliation'),snapshot,attendanceItem,actor]);
  await client.query('UPDATE hr_yuzhou_t5_followon_operation SET owned_state=hr_yuzhou_t5_followon_owned_state(operation_id)');
  async function observe(sql,sanitize) {
    const results=await client.query(sql);
    const data=results.find(r=>r.rows.length)?.rows[0];assert.ok(data);
    return sanitize(Object.values(data)[0]);
  }
  const impact=()=>observe(buildT5QuarantineImpactReadonlySql(),sanitizeT5QuarantineImpactObservation);
  const aggregate=()=>observe(buildT5ProfileAggregateReadonlySql(),sanitizeT5ProfileAggregateObservation);
  stage='classification and original hash parity';
  const original=await impact();assert.equal(original.status,'PASS');assert.equal(original.quarantineCount,19);
  const credentialProofRaw=await client.query(buildCredentialExclusionReadonlySql());
  const credentialProof=sanitizeCredentialExclusionObservation(credentialProofRaw.find(value=>value.rows.length).rows[0].json_build_object);
  assert.equal(credentialProof.status,'PASS');assert.equal(credentialProof.credentialSourceCount,0);assert.equal(credentialProof.exclusionCount,0);
  assert.equal(credentialProof.credentialSourcePairsSha256,sha(''));assert.equal(credentialProof.exclusionPairsSha256,sha(''));assert.equal(credentialProof.unmatchedExclusionCount,0);checks++;

  const historical=new Set(['HISTORICAL','DISABLED_USER','DELETED_CONTRACT','EXPIRED_CONTRACT']);
  const current=new Set(['ENABLED_USER','PAST_ACTIVE_CONTRACT','FUTURE_ACTIVE_CONTRACT','ACTIVE_EMPLOYEE','FINANCIAL_PAYROLL','FINANCIAL_BOOK','FINANCIAL_INSURANCE','FINANCIAL_RECONCILIATION','FINANCIAL_OVERLAP']);
  for(const group of original.groups){
    assert.equal(group.records,1);
    assert.equal(group.historicalCandidateRecords,Number(historical.has(group.reasonCode)),group.reasonCode);
    assert.equal(group.currentImpactRecords,Number(current.has(group.reasonCode)),group.reasonCode);
    assert.equal(group.unknownImpactRecords,Number(!historical.has(group.reasonCode)&&!current.has(group.reasonCode)),group.reasonCode);checks++;
  }
  assert.equal(original.groups.find(g=>g.reasonCode==='AMBIGUOUS').sourceAmbiguousRecords,1);
  assert.equal(original.groups.find(g=>g.reasonCode==='MISSING').sourceMissingRecords,1);
  assert.equal(original.groups.find(g=>g.reasonCode==='INVALID_MAP').ownerMapInvalidRecords,1);
  assert.equal((await aggregate()).status,'PASS');checks++;
  stage='financial association and uncertainty';
  const group=(value,label)=>value.groups.find(g=>g.reasonCode===label.toUpperCase());
  for(const [label,field] of [['financial_payroll','openPayrollRecords'],['financial_book','unclosedLegacyBookRecords'],['financial_insurance','unclosedModernInsuranceRecords'],['financial_reconciliation','pendingReconciliationRecords']]){
    assert.equal(group(original,label)[field],1);assert.equal(group(original,label).financialDependencyRecords,1);checks++;
  }
  const overlap=group(original,'financial_overlap');assert.equal(overlap.financialDependencyRecords,1);assert.equal(overlap.openPayrollRecords,1);assert.equal(overlap.unclosedModernInsuranceRecords,1);checks++;
  assert.deepEqual(original.financialContext,{openPayrollPeriods:2,openPayrollPeriodsWithoutParticipants:1,unclosedLegacyBookPeriods:1,
    unclosedLegacyBookPeriodsWithoutMappedMembers:0,unmappedLegacyBookMemberships:1,pendingReconciliationRuns:2,pendingReconciliationRunsWithoutResults:1});checks++;
  // Restore each temporary synthetic mutation exactly. impact() owns its own
  // read-only transaction, so fixture changes cannot wrap it in a writable one.
  async function mutation(label,change,restore){
    await change();const observed=await impact();assert.equal(observed.status,'PASS');
    assert.equal(group(observed,label).historicalCandidateRecords,1);assert.equal(group(observed,label).financialDependencyRecords,0);
    await restore();checks++;
  }
  for(const [table,field,bad,good] of [
    ['hr_payroll_period','status',"'closed'","'open'"],['hr_payroll_period','is_deleted','true','false'],
    ['hr_payroll_run','status',"'cancelled'","'draft'"],['hr_payroll_run','is_deleted','true','false'],
    ['hr_payslip','status',"'cancelled'","'draft'"],['hr_payslip','is_deleted','true','false'],
    ['hr_payroll_run','park_id',"'other'","'20000001'"],['hr_payslip','tenant_id',"'other'","'10000001'"],
  ])await mutation('financial_payroll',()=>client.query(`UPDATE ${table} SET ${field}=${bad}`),()=>client.query(`UPDATE ${table} SET ${field}=${good}`));
  await mutation('financial_book',()=>client.query('UPDATE hr_payroll_book_period SET legacy_close_state=1'),()=>client.query('UPDATE hr_payroll_book_period SET legacy_close_state=0'));
  await mutation('financial_insurance',()=>closeInsurance(insurance),()=>client.query('DELETE FROM hr_insurance_owned_close WHERE revision_id=$1',[insurance]));
  // Reachable correction ordering: close the old revision, then leave the new
  // revision open. Closing one month must not close a separate employee-month.
  const correction=randomUUID(),otherMonth=randomUUID();
  await closeInsurance(insurance);await addInsurance(correction,employees.get('financial_insurance'),2,insurance);
  let corrected=await impact();assert.equal(group(corrected,'financial_insurance').unclosedModernInsuranceRecords,1);checks++;
  await closeInsurance(correction);await addInsurance(otherMonth,employees.get('financial_insurance'),1,null,'2026-11-01');
  corrected=await impact();assert.equal(group(corrected,'financial_insurance').unclosedModernInsuranceRecords,1);checks++;
  await client.query('DELETE FROM hr_insurance_owned_revision WHERE id=$1',[otherMonth]);
  corrected=await impact();assert.equal(group(corrected,'financial_insurance').historicalCandidateRecords,1);checks++;
  await client.query('DELETE FROM hr_insurance_owned_close WHERE revision_id=ANY($1::uuid[])',[[insurance,correction]]);
  await client.query('DELETE FROM hr_insurance_owned_revision WHERE id=$1',[correction]);
  // Adversarial fixture below isolates latest-revision filtering; financial
  // writer guards would reject creating revision two before closing revision one.
  const newer=randomUUID();
  await mutation('financial_insurance',async()=>{await addInsurance(newer,employees.get('financial_insurance'),2,insurance);await closeInsurance(newer);},async()=>{
    await client.query('DELETE FROM hr_insurance_owned_close WHERE revision_id=$1',[newer]);await client.query('DELETE FROM hr_insurance_owned_revision WHERE id=$1',[newer]);
  });
  for(const status of ['accepted','rejected'])await mutation('financial_reconciliation',()=>client.query('UPDATE hr_payroll_reconciliation_run SET status=$1 WHERE id=$2',[status,reconciliation]),
    ()=>client.query("UPDATE hr_payroll_reconciliation_run SET status='review' WHERE id=$1",[reconciliation]));
  const successor=randomUUID();await mutation('financial_reconciliation',()=>addReconciliation(successor,'review',reconciliation),()=>client.query('DELETE FROM hr_payroll_reconciliation_run WHERE id=$1',[successor]));
  stage='actual schema rejects impossible deleted and cross-scope financial facts';
  for(const table of ['hr_payroll_book','hr_payroll_book_period','hr_payroll_book_membership','hr_payroll_reconciliation_run','hr_payroll_reconciliation_result']){
    await assert.rejects(client.query(`UPDATE ${table} SET is_deleted=true`),{code:'23514'});checks++;
  }
  for(const table of ['hr_payroll_book_membership','hr_insurance_owned_revision','hr_insurance_owned_close','hr_payroll_reconciliation_result']){
    if(table==='hr_insurance_owned_close')await closeInsurance(insurance);
    await assert.rejects(client.query(`UPDATE ${table} SET park_id='other'`),{code:'23503'});checks++;
    if(table==='hr_insurance_owned_close')await client.query('DELETE FROM hr_insurance_owned_close WHERE revision_id=$1',[insurance]);
  }
  stage='unmapped membership and missing reconciliation results stay uncertain';
  await client.query("UPDATE hr_payroll_book_membership SET mapping_status='employee_unmapped',employee_id=NULL WHERE mapping_status='mapped'");
  const uncertain=await impact();assert.equal(group(uncertain,'financial_book').historicalCandidateRecords,1);
  assert.equal(uncertain.financialContext.unclosedLegacyBookPeriodsWithoutMappedMembers,1);assert.equal(uncertain.financialContext.unmappedLegacyBookMemberships,2);
  assert.equal(uncertain.archivalClosureCertified,false);checks++;
  await client.query("UPDATE hr_payroll_book_membership SET mapping_status='mapped',employee_id=$1 WHERE legacy_membership_id=1",[employees.get('financial_book')]);
  stage='unknown owners with financial rows remain unknown';
  for(const label of ['invalid_map','unresolved','missing','ambiguous','deleted_owner']){
    const g=group(await impact(),label);assert.equal(g.unknownImpactRecords,1);assert.equal(g.financialDependencyRecords,0);checks++;
  }
  stage='generated query read only enforcement and snapshot settings';
  const settings=await client.query(buildT5QuarantineImpactReadonlySql().replace('WITH operation AS (',
    "SELECT current_setting('transaction_read_only') readonly,current_setting('transaction_isolation') isolation,current_setting('statement_timeout') timeout,current_setting('lock_timeout') lock_timeout; WITH operation AS ("));
  assert.deepEqual(settings.find(r=>r.rows.length).rows[0],{readonly:'on',isolation:'repeatable read',timeout:'30s',lock_timeout:'2s'});checks++;
  await assert.rejects(client.query(buildT5QuarantineImpactReadonlySql().replace('WITH operation AS (',
    "UPDATE hr_employee SET remark='forbidden'; WITH operation AS (")),{code:'25006'});await client.query('ROLLBACK');checks++;
  stage='private current review references';
  const savedState=(await client.query('SELECT owned_state FROM hr_yuzhou_t5_followon_operation')).rows[0].owned_state;
  await client.query("UPDATE hr_yuzhou_t5_followon_projection_receipt SET reason_code='EMPLOYEE_PROFILE_IDENTITY_AMBIGUOUS' WHERE target_table='hr_employee_profile' AND reason_code IN ('ACTIVE_EMPLOYEE','HISTORICAL','UNRESOLVED','MISSING')");
  await client.query('UPDATE hr_yuzhou_t5_followon_operation SET owned_state=hr_yuzhou_t5_followon_owned_state(operation_id)');
  const privateReview=()=>observe(buildT5QuarantineImpactReadonlySql({reviewReferences:true}),sanitizeCurrentReviewReferences);
  let refs=await privateReview();assert.equal(refs.references.length,1);assert.equal(refs.references[0].employeeId,employees.get('active_employee'));checks++;
  await client.query('UPDATE legacy_record_map SET is_active=false WHERE id=$1',[maps.get('active_employee')]);
  refs=await privateReview();assert.equal(refs.references.length,0);checks++;
  await client.query('UPDATE legacy_record_map SET is_active=true WHERE id=$1',[maps.get('active_employee')]);
  await client.query("UPDATE hr_yuzhou_t5_followon_source SET encrypted_source=encrypted_source||'00' WHERE id=$1",[sources.get('active_employee')]);
  await assert.rejects(privateReview(),{code:'PRODUCTION_RUNTIME_REVIEW_RESULT_INVALID'});checks++;
  await client.query("UPDATE hr_yuzhou_t5_followon_source SET encrypted_source=left(encrypted_source,length(encrypted_source)-2) WHERE id=$1",[sources.get('active_employee')]);
  for(const label of ['active_employee','historical','unresolved','missing'])await client.query('UPDATE hr_yuzhou_t5_followon_projection_receipt SET reason_code=$1 WHERE target_table=\'hr_employee_profile\' AND source_identity_sha256=$2',[label.toUpperCase(),sha(label)]);
  await client.query('UPDATE hr_yuzhou_t5_followon_operation SET owned_state=$1',[savedState]);
  stage='source drift';
  await client.query('UPDATE hr_yuzhou_t5_followon_source SET encrypted_source=encrypted_source||\'00\' WHERE id=$1',[sources.get('historical')]);
  let result=await impact();assert.equal(result.status,'FAIL');assert.equal(result.sourceAggregateMatches,false);assert.equal(result.receiptAggregateMatches,true);checks++;
  await client.query('UPDATE hr_yuzhou_t5_followon_source SET encrypted_source=left(encrypted_source,length(encrypted_source)-2) WHERE id=$1',[sources.get('historical')]);
  stage='receipt drift';
  await client.query("UPDATE hr_yuzhou_t5_followon_projection_receipt SET reason_code='CHANGED' WHERE reason_code='HISTORICAL'");
  result=await impact();assert.equal(result.status,'FAIL');assert.equal(result.receiptAggregateMatches,false);checks++;
  await client.query("UPDATE hr_yuzhou_t5_followon_projection_receipt SET reason_code='HISTORICAL' WHERE reason_code='CHANGED'");
  stage='profile modern drift';
  await client.query("UPDATE hr_employee_profile SET remark='synthetic modern edit'");
  result=await aggregate();assert.equal(result.status,'FAIL');assert.equal(result.profileAggregateMatches,false);assert.equal(result.receiptAggregateMatches,true);checks++;
  stage='batch binding drift';
  await client.query("UPDATE migration_batch SET tool_version='wrong'");
  result=await impact();assert.equal(result.status,'FAIL');assert.equal(result.operationBound,false);checks++;
  process.stdout.write(JSON.stringify({status:'PASS',checks,fixture:'synthetic_actual_observer_table_ddl_and_original_owned_state_function',financialWriterTriggersExercised:false,productionWrites:false})+'\n');
} catch(error) {
  process.stderr.write(`T5_IMPACT_PG_FAIL stage=${stage} code=${/^[A-Z0-9_]{1,40}$/u.test(error?.code??'')?error.code:'ASSERTION_OR_ENVIRONMENT'}\n`);
  process.exitCode=1;
} finally {
  if(client)await client.end();
  if(admin){
    try {
      if(created)await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
      const residual=(await admin.query('SELECT count(*)::int n FROM pg_database WHERE datname=$1',[database])).rows[0].n;
      assert.equal(residual,0);process.stdout.write('residual_database_count=0\n');
    } catch {process.stderr.write('T5_IMPACT_PG_CLEANUP_FAILED\n');process.exitCode=1;}
    await admin.end();
  }
}
