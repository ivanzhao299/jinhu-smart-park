import "reflect-metadata";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { DataSource, EntityManager } from "typeorm";
import { ConflictException } from "@nestjs/common";
import { HrYuzhouIncrementalImportService } from "./hr-yuzhou-incremental-import.service";
import { HrContractActionEntity, HrContractEntity, HrContractTypeEntity, HrEmployeeEntity, HrEmployeeProfileEntity } from "./entities/hr.entities";
import { HR_PERMISSIONS, type YuzhouIncrementalItem } from "@jinhu/shared";
import type { PreviewYuzhouIncrementalImportDto } from "./dto/yuzhou-incremental-import.dto";

const required = process.env.HR_YUZHOU_INCREMENTAL_PG_REQUIRED === "1";
const repoRoot = resolve(__dirname,"../../../../../");
const canonical = (value: unknown): string => value === null || typeof value !== "object" ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : `{${Object.keys(value as Record<string, unknown>).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
type TestItem = Omit<YuzhouIncrementalItem, "rowDigest">;
const digest = (item: TestItem) => createHash("sha256").update(canonical({ domain:item.domain,sourceTable:item.sourceTable,sourceKey:item.sourceKey,sourceUpdatedAt:item.sourceUpdatedAt ?? null,fields:item.fields })).digest("hex");
const key = (label: string) => `sha256:${createHash("sha256").update(label).digest("hex")}`;
const pkg = (items: TestItem[], manifestId: string): PreviewYuzhouIncrementalImportDto => ({ version:1,sourceSystem:"yuzhou-v10",manifestId,extractedAt:"2026-10-03T00:00:00.000Z",items:items.map(item => ({...item,rowDigest:digest(item)})) });
type OperationResult = { id: string; status: string; appliedCount?: number; unchangedCount?: number };
const operation = (value: unknown): OperationResult => value as OperationResult;

test("incremental import commits additions and protects exact legacy bindings", { skip: !required, timeout: 90000 }, async t => {
  assert.equal(process.env.POSTGRES_HOST, "127.0.0.1");
  assert.equal(Number(process.env.POSTGRES_PORT), 55491);
  const database = process.env.POSTGRES_DB ?? `jinhu_hr_incremental_lab_${randomBytes(12).toString("hex")}`;
  assert.match(database,/^jinhu_hr_incremental_lab_[0-9a-f]{24}$/u);
  const connection = { type:"postgres" as const,host:"127.0.0.1",port:55491,database,username:process.env.POSTGRES_USER,password:process.env.POSTGRES_PASSWORD };
  // postgres is used only to provision/drop this new random database. All fixture
  // tables, migration SQL and service operations use the dedicated target below.
  const admin = new DataSource({...connection,database:"postgres"}); await admin.initialize(); let db: DataSource | undefined; let created=false;
  try {
    await admin.query(`CREATE DATABASE "${database}" TEMPLATE template0`); created=true;
    db = new DataSource({...connection,synchronize:true,entities:[HrEmployeeEntity,HrEmployeeProfileEntity,HrContractEntity,HrContractTypeEntity,HrContractActionEntity]}); await db.initialize();
    assert.equal((await db.query(`SELECT current_database() AS database`))[0].database,connection.database);
    await db.query(`CREATE TABLE migration_batch(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE legacy_record_map(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),batch_id uuid NOT NULL REFERENCES migration_batch(id),source_system varchar(64) NOT NULL,source_table varchar(256) NOT NULL,source_pk_canonical varchar(512) NOT NULL,source_identity_sha256 char(64) NOT NULL,source_row_sha256 char(64) NOT NULL,target_table varchar(256) NOT NULL,target_id uuid,mapping_status varchar(32) NOT NULL,is_active boolean NOT NULL DEFAULT true);
      CREATE UNIQUE INDEX uq_legacy_record_map_active_source ON legacy_record_map(source_system,source_table,source_identity_sha256) WHERE is_active;`);
    await db.query(readFileSync(resolve(__dirname,"../../../../../database/migrations/000327_hr_yuzhou_incremental_import_ledger.sql"),"utf8"));
    await db.query(`CREATE TABLE hr_yuzhou_production_import_projection_receipt(operation_id varchar(64),phase varchar(8),source_identity_sha256 char(64),PRIMARY KEY(operation_id,phase,source_identity_sha256))`);
    await db.query(readFileSync(resolve(repoRoot,"database/migrations/000329_hr_incremental_initial_baseline.sql"),"utf8"));
    await db.query(readFileSync(resolve(repoRoot,"database/migrations/000331_hr_incremental_org_position.sql"),"utf8"));
    // Faithful minimal organization target plus empty immutable-original inventory;
    // the accepted dependency below is created through the real incremental API.
    await db.query(`CREATE TABLE sys_org(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,parent_id uuid,org_code varchar(64) NOT NULL,org_name varchar(100) NOT NULL,org_type varchar(32) NOT NULL,status varchar(32) NOT NULL DEFAULT 'enabled',sort_order integer NOT NULL DEFAULT 0,remark text,version integer NOT NULL DEFAULT 1,is_deleted boolean NOT NULL DEFAULT false,create_by uuid,update_by uuid,create_time timestamptz NOT NULL DEFAULT now(),update_time timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant_id,park_id,id),UNIQUE(tenant_id,park_id,org_code),FOREIGN KEY(tenant_id,park_id,parent_id) REFERENCES sys_org(tenant_id,park_id,id));
      CREATE TABLE hr_yuzhou_production_import_record(source_system varchar(64),source_table varchar(256),source_pk_canonical varchar(512),target_table varchar(256));`);
    const visibleScopes={buildScopeFilter:async()=>({unrestricted:true,allowed_ids:[]})};
    const sensitive = { encrypt:(value:string)=>Buffer.from(value).toString("base64"), decrypt:(value:string)=>Buffer.from(value,"base64").toString("utf8"), identityProfile:(value:string)=>({encrypted:`enc:${value}`,masked:"**",hash:`h:${value}`}) };
    const service = new HrYuzhouIncrementalImportService(db, sensitive as never,visibleScopes as never);
    const scope={tenantId:"incremental-tenant",parkId:"incremental-park"},actor={sub:"00000000-0000-4000-8000-000000000011",permissions:[HR_PERMISSIONS.HR_EMPLOYEE_MANAGE,HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_MANAGE,HR_PERMISSIONS.HR_CONTRACT_MANAGE]} as never;
    const orgSourceKey=key("dbo.departmentcode\0INC-ORG");
    const orgActor={...actor as object,isSuper:true,permissions:["*"]} as never;
    const orgPreview=operation(await service.preview(scope,orgActor,pkg([{domain:"organization",sourceTable:"dbo.departmentcode",sourceKey:orgSourceKey,fields:{orgCode:"INC-ORG",orgName:"Synthetic exact organization",orgType:"department",status:"enabled"}}],"organization-dependency")));
    assert.equal(operation(await service.commit(scope,orgActor,orgPreview.id)).status,"committed");
    const employeeKey=key("dbo.person\0E-001"), profileKey=key("dbo.profile\0E-001"), contractKey=key("dbo.compact\0HT-2026-001");
    const type=(await db.getRepository(HrContractTypeEntity).save({tenantId:scope.tenantId,parkId:scope.parkId,typeCode:"fixed",typeName:"Fixed",status:"enabled",isHistoricalImport:false}));
    // Bridge-equivalent normalized payload uses stable source identities and an enabled current-scope type UUID.
    const addition=pkg([
      {domain:"employee",sourceTable:"dbo.person",sourceKey:employeeKey,sourceUpdatedAt:"2026-10-03T01:00:00.000Z",fields:{employeeCode:"INC-1",fullName:"Initial",employmentStatus:"active",orgSourceKey}},
      {domain:"profile",sourceTable:"dbo.profile",sourceKey:profileKey,fields:{employeeSourceKey:employeeKey,employeeSourceTable:"dbo.person",personalMobile:"13800000000"}},
      {domain:"contract",sourceTable:"dbo.contract",sourceKey:contractKey,fields:{employeeSourceKey:employeeKey,employeeSourceTable:"dbo.person",contractTypeId:type.id,contractStatus:"draft",contractNo:"INC-C-1",startDate:"2026-10-03"}}
    ],"addition");
    const preview=operation(await service.preview(scope,actor,addition)); assert.deepEqual((preview as unknown as {plan:Array<{action:string;fields:string[]}>}).plan.map(item=>item.action),["create","create","create"]); assert.equal(JSON.stringify((preview as unknown as {plan:unknown}).plan).includes("Initial"),false); const committed=operation(await service.commit(scope,actor,preview.id)); assert.equal(committed.status,"committed"); assert.equal(committed.appliedCount,3); const bridgedContract=(await db.query(`SELECT status,contract_type_id FROM hr_contract WHERE contract_no='INC-C-1'`))[0]; assert.equal(bridgedContract.status,"draft"); assert.equal(bridgedContract.contract_type_id,type.id); assert.equal(Number((await db.query(`SELECT count(*)::int AS count FROM hr_contract_action`))[0].count),1);
    const retry=operation(await service.commit(scope,actor,preview.id)); assert.equal(retry.appliedCount,3);
    const repeated=operation(await service.preview(scope,actor,addition)); assert.equal(repeated.id,preview.id);
    const revised=pkg([{domain:"employee",sourceTable:"dbo.person",sourceKey:employeeKey,sourceUpdatedAt:"2026-10-03T02:00:00.000Z",fields:{employeeCode:"INC-1",fullName:"Source revision",employmentStatus:"active"}}],"revision");
    const revision=operation(await service.preview(scope,actor,revised)); const revisionStatus=operation(await service.commit(scope,actor,revision.id)); assert.equal(revisionStatus.status,"committed",JSON.stringify(revisionStatus)); assert.equal(revisionStatus.appliedCount,1,JSON.stringify(revisionStatus));
    const employee=(await db.query(`SELECT id,full_name FROM hr_employee WHERE employee_code='INC-1'`))[0]; assert.equal(employee.full_name,"Source revision",JSON.stringify({employee,items:await db.query(`SELECT target_id,last_row_sha256,field_baseline,target_baseline,version FROM hr_incremental_import_item WHERE source_key=$1`,[employeeKey])}));
    const sameExtract=pkg([{domain:"employee",sourceTable:"dbo.person",sourceKey:employeeKey,sourceUpdatedAt:"2026-10-03T02:00:00.000Z",fields:{employeeCode:"INC-1",fullName:"Source revision",employmentStatus:"active"}}],"same-extract-new-manifest");
    const sameExtractPreview=operation(await service.preview(scope,actor,sameExtract)); const sameExtractStatus=operation(await service.commit(scope,actor,sameExtractPreview.id)); assert.equal(sameExtractStatus.status,"committed"); assert.equal(sameExtractStatus.unchangedCount,1);
    await db.query(`UPDATE hr_employee SET full_name='Modern edit',version=version+1 WHERE id=$1`,[employee.id]);
    const conflict=pkg([{domain:"employee",sourceTable:"dbo.person",sourceKey:employeeKey,fields:{employeeCode:"INC-1",fullName:"Later source",employmentStatus:"active"}}],"modern-conflict");
    const conflictPreview=operation(await service.preview(scope,actor,conflict)); assert.equal(operation(await service.commit(scope,actor,conflictPreview.id)).status,"conflicted"); assert.equal((await db.query(`SELECT full_name FROM hr_employee WHERE id=$1`,[employee.id]))[0].full_name,"Modern edit");
    const legacy=await db.getRepository(HrEmployeeEntity).save({tenantId:scope.tenantId,parkId:scope.parkId,employeeCode:"LEG-1",fullName:"Modern retained",employmentStatus:"active"}); const legacyKey=key("initial legacy");
    await db.query(`INSERT INTO migration_batch DEFAULT VALUES RETURNING id`).then(async rows=>db!.query(`INSERT INTO legacy_record_map(batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,target_table,target_id,mapping_status) VALUES($1,'yuzhou-v10','dbo.person',$2,$3,$4,'hr_employee',$5,'verified')`,[rows[0].id,legacyKey,legacyKey.slice(7),createHash("sha256").update("old").digest("hex"),legacy.id]));
    const initial=pkg([{domain:"employee",sourceTable:"dbo.person",sourceKey:legacyKey,fields:{employeeCode:"LEG-1",fullName:"Unsafe overwrite"}}],"initial-map");
    const initialPreview=operation(await service.preview(scope,actor,initial)); assert.equal(operation(await service.commit(scope,actor,initialPreview.id)).status,"conflicted"); assert.equal((await db.query(`SELECT full_name FROM hr_employee WHERE id=$1`,[legacy.id]))[0].full_name,"Modern retained");
    const initialRetry=pkg([{domain:"employee",sourceTable:"dbo.person",sourceKey:legacyKey,fields:{employeeCode:"LEG-1",fullName:"Unsafe overwrite"}}],"initial-map-retry");
    const retryPreview=operation(await service.preview(scope,actor,initialRetry)); assert.equal(operation(await service.commit(scope,actor,retryPreview.id)).status,"conflicted");
    const initialReceipts=await db.query(`SELECT count(*)::int AS count FROM hr_incremental_import_revision revision JOIN hr_incremental_import_item item ON item.id=revision.item_id WHERE item.source_key=$1`,[legacyKey]); assert.equal(Number(initialReceipts[0].count),2);
    const map=await db.query(`SELECT source_pk_canonical,source_identity_sha256 FROM legacy_record_map WHERE target_id=$1`,[legacy.id]); assert.equal(map[0].source_pk_canonical,legacyKey); assert.equal(map[0].source_identity_sha256,legacyKey.slice(7));
    await db.query(`UPDATE hr_contract SET status='active' WHERE contract_no='INC-C-1'`); const activeContractKey=key("dbo.compact\0HT-2026-ACTIVE"); const activePackage=pkg([{domain:"contract",sourceTable:"dbo.compact",sourceKey:activeContractKey,fields:{employeeSourceKey:employeeKey,employeeSourceTable:"dbo.person",contractTypeId:type.id,contractStatus:"active",contractNo:"INC-C-ACTIVE",startDate:"2027-01-01"}}],"active-source"); const activePreview=operation(await service.preview(scope,actor,activePackage)); await assert.rejects(service.commit(scope,actor,activePreview.id),/already has an active contract/); assert.equal(Number((await db.query(`SELECT count(*)::int AS count FROM hr_contract WHERE contract_no='INC-C-ACTIVE'`))[0].count),0);
    await db.query(`UPDATE hr_contract SET status='expired' WHERE contract_no='INC-C-1'`); const expiredContractKey=key("dbo.compact\0HT-2026-EXPIRED"); const expiredPackage=pkg([{domain:"contract",sourceTable:"dbo.compact",sourceKey:expiredContractKey,fields:{employeeSourceKey:employeeKey,employeeSourceTable:"dbo.person",contractTypeId:type.id,contractStatus:"active",contractNo:"INC-C-ACTIVE",startDate:"2027-01-01"}}],"active-source-after-expired"); const expiredPreview=operation(await service.preview(scope,actor,expiredPackage)); assert.equal(operation(await service.commit(scope,actor,expiredPreview.id)).status,"committed"); assert.equal((await db.query(`SELECT status FROM hr_contract WHERE contract_no='INC-C-ACTIVE'`))[0].status,"active");
    const fixtureRoot=mkdtempSync(resolve(tmpdir(),"yuzhou-incremental-")); try { const stdout=execFileSync(process.execPath,["scripts/e2e/yuzhou-reusable-incremental-package-fixture.mjs","--root",fixtureRoot,"--contract-type-id",type.id],{cwd:repoRoot,encoding:"utf8"}); const paths=JSON.parse(stdout.trim().split(/\r?\n/u).at(-1)!) as {packagePath:string}; const actual=JSON.parse(readFileSync(paths.packagePath,"utf8")) as PreviewYuzhouIncrementalImportDto; const actualPreview=operation(await service.preview(scope,actor,actual)); assert.equal(operation(await service.commit(scope,actor,actualPreview.id)).status,"committed"); const actualEmployee=(await db.query(`SELECT id,full_name,work_location,version FROM hr_employee WHERE employee_code='CLI-E-001'`))[0]; assert.equal(actualEmployee.full_name,"Incremental employee"); const actualContract=(await db.query(`SELECT status,contract_type_id,contract_no,to_char(start_date,'YYYY-MM-DD') AS start_date,to_char(end_date,'YYYY-MM-DD') AS end_date,to_char(probation_end_date,'YYYY-MM-DD') AS probation_end_date FROM hr_contract WHERE contract_no='HT-2026-001'`))[0]; assert.equal(actualContract.status,"draft"); assert.equal(actualContract.contract_type_id,type.id); assert.equal(actualContract.start_date,"2024-01-01"); assert.equal(actualContract.end_date,"2025-12-31"); assert.equal(actualContract.probation_end_date,"2024-03-31"); await db.query(`UPDATE hr_employee SET work_location='Modern site',employment_status='suspended',version=version+1 WHERE id=$1`,[actualEmployee.id]); const revisionRoot=mkdtempSync(resolve(tmpdir(),"yuzhou-incremental-revision-")); try { const revisionStdout=execFileSync(process.execPath,["scripts/e2e/yuzhou-reusable-incremental-package-fixture.mjs","--root",revisionRoot,"--contract-type-id",type.id,"--full-name","Incremental employee revision","--employee-only","yes"],{cwd:repoRoot,encoding:"utf8"}); const revisionPaths=JSON.parse(revisionStdout.trim().split(/\r?\n/u).at(-1)!) as {packagePath:string}; const revisedActual=JSON.parse(readFileSync(revisionPaths.packagePath,"utf8")) as PreviewYuzhouIncrementalImportDto; const revisedPreview=await service.preview(scope,actor,revisedActual); assert.deepEqual((revisedPreview as {plan:Array<{action:string;conflictFields:string[]}>}).plan,[{domain:"employee",sourceTable:"dbo.person",sourceKey:revisedActual.items[0]!.sourceKey,fields:["employeeCode","employmentStatus","employmentType","fullName","hireDate"],action:"update",conflictFields:[]}]); assert.equal(operation(await service.commit(scope,actor,operation(revisedPreview).id)).status,"committed"); const revisedEmployee=(await db.query(`SELECT full_name,work_location,employment_status FROM hr_employee WHERE id=$1`,[actualEmployee.id]))[0]; assert.equal(revisedEmployee.full_name,"Incremental employee revision"); assert.equal(revisedEmployee.work_location,"Modern site"); assert.equal(revisedEmployee.employment_status,"suspended"); const casPackage=pkg([{domain:"employee",sourceTable:"dbo.person",sourceKey:revisedActual.items[0]!.sourceKey,fields:{employeeCode:"CLI-E-001",fullName:"CAS source revision",employmentStatus:"active",employmentType:"full_time",hireDate:"2024-01-01"}}],"cli-cas-race"); const casPreview=operation(await service.preview(scope,actor,casPackage)); const countsBefore=await db.query(`SELECT (SELECT count(*)::int FROM hr_incremental_import_revision) revisions,(SELECT count(*)::int FROM hr_incremental_import_item WHERE source_key=$1) items`,[revisedActual.items[0]!.sourceKey]); let reached!:()=>void,release!:()=>void; const reachedBarrier=new Promise<void>(done=>{reached=done}),releaseBarrier=new Promise<void>(done=>{release=done}); let paused=false; const raceDb=Object.create(db!) as DataSource; raceDb.transaction=(async(callback:(manager:EntityManager)=>Promise<unknown>)=>db!.transaction(async manager=>{const proxy=Object.create(manager) as EntityManager; proxy.query=async(sql:string,parameters?:unknown[])=>{const result=await manager.query(sql,parameters); if(!paused&&sql.startsWith("SELECT *,")&&sql.includes("FROM hr_employee")&&parameters?.[0]===actualEmployee.id){paused=true;reached();await releaseBarrier;} return result;}; return callback(proxy);})) as DataSource["transaction"]; const raceService=new HrYuzhouIncrementalImportService(raceDb,sensitive as never,visibleScopes as never); const committing=raceService.commit(scope,actor,casPreview.id); await Promise.race([reachedBarrier,new Promise((_,reject)=>setTimeout(()=>reject(new Error("CAS read barrier timeout")),2000))]); await db.query(`UPDATE hr_employee SET work_location='CAS modern site',version=version+1 WHERE id=$1`,[actualEmployee.id]); release(); await assert.rejects(committing,error=>error instanceof ConflictException&&error.getStatus()===409); const casTarget=(await db.query(`SELECT full_name,work_location FROM hr_employee WHERE id=$1`,[actualEmployee.id]))[0]; assert.deepEqual(casTarget,{full_name:"Incremental employee revision",work_location:"CAS modern site"}); const countsAfter=await db.query(`SELECT (SELECT count(*)::int FROM hr_incremental_import_revision) revisions,(SELECT count(*)::int FROM hr_incremental_import_item WHERE source_key=$1) items`,[revisedActual.items[0]!.sourceKey]); assert.deepEqual(countsAfter,countsBefore); const casOperation=(await db.query(`SELECT status,applied_count FROM hr_incremental_import_operation WHERE id=$1`,[casPreview.id]))[0]; assert.deepEqual(casOperation,{status:"previewed",applied_count:0}); } finally { rmSync(revisionRoot,{recursive:true,force:true}); } } finally { rmSync(fixtureRoot,{recursive:true,force:true}); }
    // Actual CLI source status changes still require lifecycle processing, even
    // when the modern target happens to have already reached that status.
    for (const modernStatus of ["suspended", "probation"]) {
      await db.query(`UPDATE hr_employee SET employment_status=$1,version=version+1 WHERE employee_code='CLI-E-001'`,[modernStatus]);
      const targetBefore: Record<string,unknown>[]=await db.query(`SELECT * FROM hr_employee WHERE employee_code='CLI-E-001'`);
      const ledgerBefore: Record<string,unknown>[]=await db.query(`SELECT * FROM hr_incremental_import_item WHERE source_key=$1 AND domain='employee'`,[key("dbo.person\0CLI-E-001")]);
      const statusRoot=mkdtempSync(resolve(tmpdir(),"yuzhou-incremental-status-"));
      try {
        const stdout=execFileSync(process.execPath,["scripts/e2e/yuzhou-reusable-incremental-package-fixture.mjs","--root",statusRoot,"--contract-type-id",type.id,"--employee-only","yes","--full-name","Source status revision","--legacy-status","6"],{cwd:repoRoot,encoding:"utf8"});
        const paths=JSON.parse(stdout.trim().split(/\r?\n/u).at(-1)!) as {packagePath:string};
        const actual=JSON.parse(readFileSync(paths.packagePath,"utf8")) as PreviewYuzhouIncrementalImportDto;
        // A distinct extraction identifies the second source-status observation.
        actual.manifestId+=`-${modernStatus}`;
        const preview=await service.preview(scope,actor,actual);
        const plan=(preview as {plan:Array<{action:string;conflictFields:string[]}>}).plan[0]!;
        assert.equal(plan.action,"conflict");assert.ok(plan.conflictFields.includes("NORMAL_EMPLOYMENT_WORKFLOW_REQUIRED"));
        assert.equal(operation(await service.commit(scope,actor,operation(preview).id)).status,"conflicted");
        assert.deepEqual(await db.query(`SELECT * FROM hr_employee WHERE employee_code='CLI-E-001'`),targetBefore);
        assert.deepEqual(await db.query(`SELECT * FROM hr_incremental_import_item WHERE source_key=$1 AND domain='employee'`,[key("dbo.person\0CLI-E-001")]),ledgerBefore);
      } finally {rmSync(statusRoot,{recursive:true,force:true});}
    }
    // Contend at the real hierarchy lock before target/source reads. Active
    // employee assignments serialize there; PostgreSQL uniqueness still rolls back the loser.
    const runRace = async (sameSource: boolean) => {
      const label = sameSource ? "CON-SOURCE" : "CON-CODE";
      const keys = [key(`${label}-a`), key(sameSource ? `${label}-a` : `${label}-b`)];
      // Distinct codes verify same-source replay cannot create a second target.
      const codes = sameSource ? [`${label}-a`, `${label}-b`] : [label, label];
      const operations = await Promise.all(keys.map((sourceKey, index) => service.preview(scope, actor, pkg([
        { domain: "employee", sourceTable: "dbo.person", sourceKey,
          fields: { employeeCode: codes[index]!, fullName: "Concurrent", employmentStatus: "active", orgSourceKey } },
      ], `${label}-${index}`))));
      let arrivals = 0;
      const createdTargets: string[] = [];
      let release!: () => void;
      const barrier = new Promise<void>(done => { release = done; });
      const raceDb = Object.create(db!) as DataSource;
      raceDb.transaction = (async (callback: (manager: EntityManager) => Promise<unknown>) => db!.transaction(async manager => {
        const proxy = Object.create(manager) as EntityManager;
        proxy.query = async (sql: string, parameters?: unknown[]) => {
          // Both connections reach the ordinary hierarchy lock before either
          // proceeds, without bypassing the lock or forcing impossible concurrent reads.
          if (sql.includes("pg_advisory_xact_lock") && parameters?.[0] === `org-hierarchy:${scope.tenantId}:${scope.parkId}`) {
            arrivals += 1;
            if (arrivals === 2) release();
            await barrier;
          }
          const result = await manager.query(sql, parameters);
          if (sql.startsWith("INSERT INTO hr_employee(")) createdTargets.push(result[0].id as string);
          return result;
        };
        return callback(proxy);
      })) as DataSource["transaction"];
      const raceService = new HrYuzhouIncrementalImportService(raceDb, sensitive as never,visibleScopes as never);
      const results = await Promise.allSettled(operations.map(row => raceService.commit(scope, actor, operation(row).id)));
      assert.equal(arrivals,2);
      if (sameSource) {
        assert.equal(results.filter(row => row.status === "fulfilled").length,2);
        assert.equal(createdTargets.length,1);
        assert.equal(Number((await db!.query(`SELECT count(*)::int AS count FROM hr_incremental_import_item WHERE source_key=$1`,[keys[0]]))[0].count),1);
        return;
      }
      assert.equal(results.filter(row => row.status === "fulfilled").length, 1);
      const rejected = results.find(row => row.status === "rejected");
      assert.ok(rejected && rejected.status === "rejected");
      assert.ok(rejected.reason instanceof ConflictException);
      assert.equal(rejected.reason.getStatus(), 409);
      assert.equal(createdTargets.length, sameSource ? 2 : 1);
      assert.equal(Number((await db!.query(`SELECT count(*)::int AS count FROM hr_employee WHERE id=ANY($1::uuid[])`, [createdTargets]))[0].count), 1);
      assert.equal(Number((await db!.query(`SELECT count(*)::int AS count FROM hr_employee WHERE employee_code=ANY($1::text[])`, [codes]))[0].count), 1);
      assert.equal(Number((await db!.query(`SELECT count(*)::int AS count FROM hr_incremental_import_item WHERE source_key=ANY($1::text[]) AND domain='employee'`, [keys]))[0].count), 1);
      const receipts = await db!.query(`SELECT o.status,o.applied_count,count(r.id)::int AS revision_count FROM hr_incremental_import_operation o LEFT JOIN hr_incremental_import_revision r ON r.operation_id=o.id WHERE o.id=ANY($1::uuid[]) GROUP BY o.id`, [operations.map(row => operation(row).id)]);
      assert.deepEqual(receipts.map((row: {status:string;applied_count:number;revision_count:number}) => [row.status,row.applied_count,row.revision_count]).sort(), [["committed",1,1],["previewed",0,0]].sort());
    };
    await runRace(true);
    await runRace(false);
    const employmentChange = operation(await service.preview(scope,actor,pkg([{domain:"employee",sourceTable:"dbo.person",sourceKey:employeeKey,fields:{employeeCode:"INC-1",fullName:"Source revision",employmentStatus:"departed"}}],"employment-change")));
    assert.equal(operation(await service.commit(scope,actor,employmentChange.id)).status,"conflicted");
    assert.equal((await db.query(`SELECT employment_status FROM hr_employee WHERE id=$1`,[employee.id]))[0].employment_status,"active");
    // Same-package previews must converge even with independent request keys.
    const previewPackage = pkg([{domain:"employee",sourceTable:"dbo.person",sourceKey:key("preview-race"),fields:{employeeCode:"PREVIEW-RACE",fullName:"Preview race",employmentStatus:"active",orgSourceKey}}],"preview-race");
    const previews = await Promise.all([service.preview(scope,actor,previewPackage),service.preview(scope,actor,previewPackage)]);
    assert.equal(operation(previews[0]).id,operation(previews[1]).id);
    assert.equal(Number((await db.query(`SELECT count(*)::int AS count FROM hr_incremental_import_operation WHERE manifest_id='preview-race'`))[0].count),1);
    await service.commit(scope,actor,operation(previews[0]).id);
    const emptySource=operation(await service.preview(scope,actor,pkg([{domain:"employee",sourceTable:"dbo.person",sourceKey:key("preview-race"),fields:{}}],"empty-source-fields")));
    await service.commit(scope,actor,emptySource.id);
    const afterEmpty=operation(await service.preview(scope,actor,pkg([{domain:"employee",sourceTable:"dbo.person",sourceKey:key("preview-race"),fields:{fullName:"After empty source"}}],"after-empty-source")));
    assert.equal(operation(await service.commit(scope,actor,afterEmpty.id)).status,"committed");
    // Identity clearing removes all protected projections; an unchanged repeat is a no-op.
    const profileFields = {employeeSourceKey:employeeKey,employeeSourceTable:"dbo.person",personalMobile:"13800000000",idNumber:"TEST-IDENTITY"};
    const setIdentity = operation(await service.preview(scope,actor,pkg([{domain:"profile",sourceTable:"dbo.profile",sourceKey:profileKey,fields:profileFields}],"identity-set")));
    assert.equal(operation(await service.commit(scope,actor,setIdentity.id)).status,"committed");
    const clearIdentityPackage = pkg([{domain:"profile",sourceTable:"dbo.profile",sourceKey:profileKey,fields:{...profileFields,idNumber:null}}],"identity-clear");
    const clearIdentity = operation(await service.preview(scope,actor,clearIdentityPackage));
    assert.equal(operation(await service.commit(scope,actor,clearIdentity.id)).status,"committed");
    const clearedIdentity = (await db.query(`SELECT id_number_encrypted,id_number_masked,id_number_fingerprint,version FROM hr_employee_profile WHERE employee_id=$1`,[employee.id]))[0];
    assert.equal(clearedIdentity.id_number_encrypted,null); assert.equal(clearedIdentity.id_number_masked,null); assert.equal(clearedIdentity.id_number_fingerprint,null);
    const clearedRepeat = operation(await service.preview(scope,actor,{...clearIdentityPackage,manifestId:"identity-clear-again"}));
    assert.equal(operation(await service.commit(scope,actor,clearedRepeat.id)).unchangedCount,1);
    assert.equal((await db.query(`SELECT version FROM hr_employee_profile WHERE employee_id=$1`,[employee.id]))[0].version,clearedIdentity.version);
    // Relationship/type changes are explicit conflicts, never silently applied source receipts.
    const profileRelation = pkg([{domain:"profile",sourceTable:"dbo.profile",sourceKey:profileKey,fields:{...profileFields,idNumber:null,employeeSourceKey:key("different-employee")}}],"profile-relation");
    const relationPreview = await service.preview(scope,actor,profileRelation);
    assert.equal((relationPreview as {plan:Array<{action:string}>}).plan[0]!.action,"conflict");
    assert.equal(operation(await service.commit(scope,actor,operation(relationPreview).id)).status,"conflicted");
    const contractTypeChange = pkg([{domain:"contract",sourceTable:"dbo.contract",sourceKey:contractKey,fields:{...addition.items[2]!.fields,contractStatus:"expired",contractTypeId:"00000000-0000-4000-8000-000000000099"}}],"contract-type-change");
    const changedType = operation(await service.preview(scope,actor,contractTypeChange));
    assert.equal(operation(await service.commit(scope,actor,changedType.id)).status,"conflicted");
    assert.equal((await db.query(`SELECT contract_type_id FROM hr_contract WHERE contract_no='INC-C-1'`))[0].contract_type_id,type.id);
    // A source NULL clears a nullable draft field through the real versioned writer.
    const nullKey = key("nullable-contract");
    const nullFields = {...addition.items[2]!.fields,contractNo:"NULL-C",startDate:"2026-10-03",endDate:"2027-10-03"};
    const nullInitial = operation(await service.preview(scope,actor,pkg([{domain:"contract",sourceTable:"dbo.compact",sourceKey:nullKey,fields:nullFields}],"null-initial")));
    await service.commit(scope,actor,nullInitial.id);
    const nullRevision = operation(await service.preview(scope,actor,pkg([{domain:"contract",sourceTable:"dbo.compact",sourceKey:nullKey,fields:{...nullFields,endDate:null}}],"null-revision")));
    assert.equal(operation(await service.commit(scope,actor,nullRevision.id)).status,"committed");
    assert.equal((await db.query(`SELECT end_date FROM hr_contract WHERE contract_no='NULL-C'`))[0].end_date,null);
    // All writers serialize the employee anchor before testing active-contract absence.
    const concurrentEmployee = await db.getRepository(HrEmployeeEntity).save({tenantId:scope.tenantId,parkId:scope.parkId,employeeCode:"ACTIVE-RACE-E",fullName:"Active race",employmentStatus:"active"});
    const activeEmployeeKey=key("active-race-employee");
    await db.query(`INSERT INTO migration_batch DEFAULT VALUES RETURNING id`).then(async rows=>db!.query(`INSERT INTO legacy_record_map(batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,target_table,target_id,mapping_status) VALUES($1,'yuzhou-v10','dbo.person',$2,$3,$4,'hr_employee',$5,'verified')`,[rows[0].id,activeEmployeeKey,activeEmployeeKey.slice(7),createHash("sha256").update("active-race").digest("hex"),concurrentEmployee.id]));
    const activeOperations=await Promise.all([0,1].map(index=>service.preview(scope,actor,pkg([{domain:"contract",sourceTable:"dbo.compact",sourceKey:key(`active-race-${index}`),fields:{...addition.items[2]!.fields,employeeSourceKey:activeEmployeeKey,contractStatus:"active",contractNo:`ACTIVE-RACE-${index}`}}],`active-race-${index}`))));
    const activeResults=await Promise.allSettled(activeOperations.map(row=>service.commit(scope,actor,operation(row).id)));
    assert.equal(activeResults.filter(row=>row.status==="fulfilled").length,1);
    const activeRejected=activeResults.find(row=>row.status==="rejected"); assert.ok(activeRejected?.status==="rejected" && activeRejected.reason instanceof ConflictException);
    assert.equal(Number((await db.query(`SELECT count(*)::int AS count FROM hr_contract WHERE employee_id=$1 AND status='active'`,[concurrentEmployee.id]))[0].count),1);
    for (const fields of [{hireDate:"2026-02-30"},{employmentType:"arbitrary"},{employmentStatus:null},{fullName:null},{workEmail:"invalid"}]) {
      await assert.rejects(service.preview(scope,actor,pkg([{domain:"employee",sourceTable:"dbo.person",sourceKey:key("invalid-fields"),fields:{employeeCode:"INVALID",fullName:"Invalid",employmentStatus:"active",...fields}}],"invalid-fields")),error=>error instanceof Error && "getStatus" in error && (error as {getStatus:()=>number}).getStatus()===400);
    }
    const forbiddenActor={sub:"00000000-0000-4000-8000-000000000011",permissions:[HR_PERMISSIONS.HR_EMPLOYEE_MANAGE]} as never; await assert.rejects(service.preview(scope,forbiddenActor,addition),/hr:employee_profile:manage/);
    await assert.rejects(service.status(scope,forbiddenActor,preview.id),/hr:employee_profile:read/);
    await assert.rejects(service.status({...scope,parkId:"other-park"},actor,preview.id),/not found/);
    await assert.rejects(service.commit({...scope,tenantId:"other-tenant"},actor,preview.id),/not found/);
    const invalidContractKey=key("invalid contract"); const invalid=pkg([{domain:"contract",sourceTable:"dbo.contract",sourceKey:invalidContractKey,fields:{employeeSourceKey:employeeKey,employeeSourceTable:"dbo.person",contractTypeId:type.id,contractStatus:"draft",contractNo:"INC-C-invalid",startDate:"2026-10-10",endDate:"2026-10-09"}}],"invalid-contract-dates"); const invalidPreview=operation(await service.preview(scope,actor,invalid)); await assert.rejects(service.commit(scope,actor,invalidPreview.id),/Contract end date cannot precede/); assert.equal(Number((await db.query(`SELECT count(*)::int AS count FROM hr_contract WHERE contract_no='INC-C-invalid'`))[0].count),0);
  } finally {
    if (db?.isInitialized) await db.destroy();
    if(created){await admin.query(`DROP DATABASE "${database}"`);assert.equal((await admin.query(`SELECT count(*)::int AS count FROM pg_database WHERE datname=$1`,[database]))[0].count,0);}
    await admin.destroy();
    if(created)t.diagnostic("Dedicated database identity asserted; disposable database residual=0");
  }
});
