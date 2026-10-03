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

test("incremental import commits additions and protects exact legacy bindings", { skip: !required, timeout: 90000 }, async () => {
  assert.equal(process.env.POSTGRES_HOST, "127.0.0.1");
  assert.equal(Number(process.env.POSTGRES_PORT), 55491);
  const schema = `hr_incremental_${randomBytes(8).toString("hex")}`;
  const connection = { type:"postgres" as const,host:"127.0.0.1",port:55491,database:"postgres",username:process.env.POSTGRES_USER,password:process.env.POSTGRES_PASSWORD };
  const admin = new DataSource(connection); await admin.initialize(); let db: DataSource | undefined;
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    db = new DataSource({...connection,schema,synchronize:true,entities:[HrEmployeeEntity,HrEmployeeProfileEntity,HrContractEntity,HrContractTypeEntity,HrContractActionEntity],extra:{options:`-c search_path=${schema},public`}}); await db.initialize();
    await db.query(`CREATE TABLE migration_batch(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE legacy_record_map(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),batch_id uuid NOT NULL REFERENCES migration_batch(id),source_system varchar(64) NOT NULL,source_table varchar(256) NOT NULL,source_pk_canonical varchar(512) NOT NULL,source_identity_sha256 char(64) NOT NULL,source_row_sha256 char(64) NOT NULL,target_table varchar(256) NOT NULL,target_id uuid,mapping_status varchar(32) NOT NULL,is_active boolean NOT NULL DEFAULT true);
      CREATE UNIQUE INDEX uq_legacy_record_map_active_source ON legacy_record_map(source_system,source_table,source_identity_sha256) WHERE is_active;`);
    await db.query(readFileSync(resolve(__dirname,"../../../../../database/migrations/000327_hr_yuzhou_incremental_import_ledger.sql"),"utf8"));
    const sensitive = { encrypt:(value:string)=>Buffer.from(value).toString("base64"), decrypt:(value:string)=>Buffer.from(value,"base64").toString("utf8"), identityProfile:(value:string)=>({encrypted:`enc:${value}`,masked:"**",hash:`h:${value}`}) };
    const service = new HrYuzhouIncrementalImportService(db, sensitive as never);
    const scope={tenantId:"incremental-tenant",parkId:"incremental-park"},actor={sub:"00000000-0000-4000-8000-000000000011",permissions:[HR_PERMISSIONS.HR_EMPLOYEE_MANAGE,HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_MANAGE,HR_PERMISSIONS.HR_CONTRACT_MANAGE]} as never;
    const employeeKey=key("dbo.person\0E-001"), profileKey=key("dbo.profile\0E-001"), contractKey=key("dbo.compact\0HT-2026-001");
    const type=(await db.getRepository(HrContractTypeEntity).save({tenantId:scope.tenantId,parkId:scope.parkId,typeCode:"fixed",typeName:"Fixed",status:"enabled",isHistoricalImport:false}));
    // Bridge-equivalent normalized payload uses stable source identities and an enabled current-scope type UUID.
    const addition=pkg([
      {domain:"employee",sourceTable:"dbo.person",sourceKey:employeeKey,sourceUpdatedAt:"2026-10-03T01:00:00.000Z",fields:{employeeCode:"INC-1",fullName:"Initial",employmentStatus:"active"}},
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
    const bridgeEmployee=await db.getRepository(HrEmployeeEntity).save({tenantId:scope.tenantId,parkId:scope.parkId,employeeCode:"E-001",fullName:"Bridge employee",employmentStatus:"active"}); const bridgeKey=key("dbo.person\0E-001"); await db.query(`INSERT INTO migration_batch DEFAULT VALUES RETURNING id`).then(async rows=>db!.query(`INSERT INTO legacy_record_map(batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,target_table,target_id,mapping_status) VALUES($1,'yuzhou-v10','dbo.person',$2,$3,$4,'hr_employee',$5,'verified')`,[rows[0].id,bridgeKey,bridgeKey.slice(7),createHash("sha256").update("bridge").digest("hex"),bridgeEmployee.id])); const fixtureRoot=mkdtempSync(resolve(tmpdir(),"yuzhou-incremental-")); try { const stdout=execFileSync(process.execPath,["scripts/e2e/yuzhou-reusable-incremental-package-fixture.mjs","--root",fixtureRoot,"--contract-type-id",type.id],{cwd:repoRoot,encoding:"utf8"}); const paths=JSON.parse(stdout.trim().split(/\r?\n/u).at(-1)!) as {packagePath:string}; const actual=JSON.parse(readFileSync(paths.packagePath,"utf8")) as PreviewYuzhouIncrementalImportDto; const actualPreview=operation(await service.preview(scope,actor,actual)); assert.equal(operation(await service.commit(scope,actor,actualPreview.id)).status,"committed"); const actualContract=(await db.query(`SELECT status,contract_type_id,contract_no,to_char(start_date,'YYYY-MM-DD') AS start_date,to_char(end_date,'YYYY-MM-DD') AS end_date,to_char(probation_end_date,'YYYY-MM-DD') AS probation_end_date FROM hr_contract WHERE contract_no='HT-2026-001'`))[0]; assert.equal(actualContract.status,"draft"); assert.equal(actualContract.contract_type_id,type.id); assert.equal(actualContract.start_date,"2024-01-01"); assert.equal(actualContract.end_date,"2025-12-31"); assert.equal(actualContract.probation_end_date,"2024-03-31"); } finally { rmSync(fixtureRoot,{recursive:true,force:true}); }
    // Pause both real transactions after their absent-source reads, so the race
    // is deterministic and still exercises PostgreSQL uniqueness/rollback.
    const runRace = async (sameSource: boolean) => {
      const label = sameSource ? "CON-SOURCE" : "CON-CODE";
      const keys = [key(`${label}-a`), key(sameSource ? `${label}-a` : `${label}-b`)];
      // Distinct target codes force the same-source race past target creation
      // and into the ledger unique constraint, proving the losing target rolls back.
      const codes = sameSource ? [`${label}-a`, `${label}-b`] : [label, label];
      const operations = await Promise.all(keys.map((sourceKey, index) => service.preview(scope, actor, pkg([
        { domain: "employee", sourceTable: "dbo.person", sourceKey,
          fields: { employeeCode: codes[index]!, fullName: "Concurrent", employmentStatus: "active" } },
      ], `${label}-${index}`))));
      let arrivals = 0;
      const createdTargets: string[] = [];
      let release!: () => void;
      const barrier = new Promise<void>(done => { release = done; });
      const raceDb = Object.create(db!) as DataSource;
      raceDb.transaction = (async (callback: (manager: EntityManager) => Promise<unknown>) => db!.transaction(async manager => {
        const proxy = Object.create(manager) as EntityManager;
        proxy.query = async (sql: string, parameters?: unknown[]) => {
          const result = await manager.query(sql, parameters);
          if (sql.startsWith("INSERT INTO hr_employee(")) createdTargets.push(result[0].id as string);
          if (sql.startsWith("SELECT id,target_table,target_id") && sql.includes("hr_incremental_import_item") && sql.endsWith("FOR UPDATE")) {
            assert.equal(result.length, 0);
            arrivals += 1;
            if (arrivals === 2) release();
            await barrier;
          }
          return result;
        };
        return callback(proxy);
      })) as DataSource["transaction"];
      const raceService = new HrYuzhouIncrementalImportService(raceDb, sensitive as never);
      const results = await Promise.allSettled(operations.map(row => raceService.commit(scope, actor, operation(row).id)));
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
    const forbiddenActor={sub:"00000000-0000-4000-8000-000000000011",permissions:[HR_PERMISSIONS.HR_EMPLOYEE_MANAGE]} as never; await assert.rejects(service.preview(scope,forbiddenActor,addition),/hr:employee_profile:manage/);
    const invalidContractKey=key("invalid contract"); const invalid=pkg([{domain:"contract",sourceTable:"dbo.contract",sourceKey:invalidContractKey,fields:{employeeSourceKey:employeeKey,employeeSourceTable:"dbo.person",contractTypeId:type.id,contractStatus:"draft",contractNo:"INC-C-invalid",startDate:"2026-10-10",endDate:"2026-10-09"}}],"invalid-contract-dates"); const invalidPreview=operation(await service.preview(scope,actor,invalid)); await assert.rejects(service.commit(scope,actor,invalidPreview.id),/Contract end date cannot precede/); assert.equal(Number((await db.query(`SELECT count(*)::int AS count FROM hr_contract WHERE contract_no='INC-C-invalid'`))[0].count),0);
  } finally { if (db?.isInitialized) await db.destroy(); await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.destroy(); }
});
