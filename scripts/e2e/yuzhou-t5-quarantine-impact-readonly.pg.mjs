import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { URL } from 'node:url';
import pg from 'pg';
import { buildT5QuarantineImpactReadonlySql, sanitizeT5QuarantineImpactObservation,
  buildT5ProfileAggregateReadonlySql, sanitizeT5ProfileAggregateObservation } from '../diagnose-production-runtime-revision.mjs';

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
  await client.query('UPDATE hr_yuzhou_t5_followon_operation SET owned_state=hr_yuzhou_t5_followon_owned_state(operation_id)');
  async function observe(sql,sanitize) {
    const results=await client.query(sql);
    const data=results.find(r=>r.rows.length)?.rows[0];assert.ok(data);
    return sanitize(Object.values(data)[0]);
  }
  const impact=()=>observe(buildT5QuarantineImpactReadonlySql(),sanitizeT5QuarantineImpactObservation);
  const aggregate=()=>observe(buildT5ProfileAggregateReadonlySql(),sanitizeT5ProfileAggregateObservation);
  stage='classification and original hash parity';
  const original=await impact();assert.equal(original.status,'PASS');assert.equal(original.quarantineCount,14);
  const historical=new Set(['HISTORICAL','DISABLED_USER','DELETED_CONTRACT','EXPIRED_CONTRACT']);
  const current=new Set(['ENABLED_USER','PAST_ACTIVE_CONTRACT','FUTURE_ACTIVE_CONTRACT','ACTIVE_EMPLOYEE']);
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
  stage='read only enforcement';
  await client.query('BEGIN READ ONLY');
  await assert.rejects(client.query("UPDATE hr_employee SET remark='forbidden'"),{code:'25006'});await client.query('ROLLBACK');checks++;
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
  process.stdout.write(JSON.stringify({status:'PASS',checks,fixture:'synthetic_actual_317_table_ddl_and_original_owned_state_function',productionWrites:false})+'\n');
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
