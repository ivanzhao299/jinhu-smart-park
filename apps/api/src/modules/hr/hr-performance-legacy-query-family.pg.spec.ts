import "reflect-metadata";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { after, before, test } from "node:test";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { DataSource } from "typeorm";
import { typeormQueryRows } from "../../shared/property-workbench/typeorm-query-rows";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HrPerformanceLegacyService } from "./hr-performance-legacy.service";

const enabled = process.env.HR_PERFORMANCE_LEGACY_QUERY_PG === "1";
const root = resolve(__dirname, "../../../../..");
const identityMigration = readFileSync(
  resolve(root, "database/migrations/000306_hr_performance_yuzhou_identity_resolution.sql"),
  "utf8",
);
const legacyWriterMigration = readFileSync(
  resolve(root, "database/migrations/000301_hr_performance_yuzhou_legacy_writer.sql"),
  "utf8",
);
const exactKeysStart = legacyWriterMigration.indexOf(
  "CREATE OR REPLACE FUNCTION hr_performance_yuzhou_jsonb_exact_keys",
);
const exactKeysEnd = legacyWriterMigration.indexOf(
  "CREATE OR REPLACE FUNCTION hr_performance_yuzhou_prepare_record_map",
);
assert.ok(exactKeysStart >= 0 && exactKeysEnd > exactKeysStart);
const exactKeysPrerequisite = legacyWriterMigration.slice(exactKeysStart, exactKeysEnd).trim();
const scope = { tenantId: "tenant-a", parkId: "park-a" };
const factBatchId = "00000000-0000-4000-8000-000000000001";
const sessionId = "00000000-0000-4000-8000-000000000002";
const sessionMapId = "00000000-0000-4000-8000-000000000003";
const teamRootOrgId = "00000000-0000-4000-8000-000000000004";
const teamChildOrgId = "00000000-0000-4000-8000-000000000005";
const otherOrgId = "00000000-0000-4000-8000-000000000006";
const teamLeaderId = "00000000-0000-4000-8000-000000000007";
const selfUserId = "00000000-0000-4000-8000-000000000008";
const deletedOrgId = "00000000-0000-4000-8000-000000000009";

let dataSource: DataSource;
let nextId = 100;
const uuid = () => `00000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}`;
const hash = (value: string) => createHash("sha256").update(`synthetic:${value}`).digest("hex");

function actor(sub: string, ...permissions: string[]): JwtPrincipal {
  return {
    sub,
    username: "synthetic-query-actor",
    tenantId: scope.tenantId,
    parkId: scope.parkId,
    roles: [],
    permissions,
  };
}

function queryService(audits: Array<Record<string, unknown>> = []) {
  return new HrPerformanceLegacyService(dataSource, {
    recordOperationRequired: async (input: Record<string, unknown>) => { audits.push(input); },
  } as never);
}

async function materializeIdentity(payload: Record<string, unknown>) {
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction("SERIALIZABLE");
  try {
    await runner.query(
      "CALL materialize_yuzhou_performance_legacy_identity_resolution_lab($1,$2,$3,$4::jsonb)",
      [scope.tenantId, scope.parkId, factBatchId, JSON.stringify(payload)],
    );
    await runner.commitTransaction();
  } catch (error) {
    await runner.rollbackTransaction();
    throw error;
  } finally {
    await runner.release();
  }
}

async function personIdentity(sourcePersonCode: string) {
  const rows = await dataSource.query(
    "SELECT hr_performance_yuzhou_person_identity_sha256($1) hash",
    [sourcePersonCode],
  ) as Array<{ hash: string }>;
  return rows[0]!.hash;
}

async function addT0PersonMapping(input: {
  sourcePersonCode: string;
  employeeId: string;
  tenantId?: string;
  parkId?: string;
  active?: boolean;
}) {
  const tenantId = input.tenantId ?? scope.tenantId;
  const parkId = input.parkId ?? scope.parkId;
  const identity = await personIdentity(input.sourcePersonCode);
  const batchId = uuid();
  const mapId = uuid();
  const operationId = `synthetic-t0-${mapId.slice(-12)}`;
  await dataSource.query(
    `INSERT INTO migration_batch(
       id,run_id,source_system,source_snapshot_sha256,target_database,phase,status,
       tool_version,execution_context,production_import_operation_id,production_import_phase
     ) VALUES($1,$2,'yuzhou-v10',$3,current_database(),'verify','succeeded',
       'synthetic-query-contract','production_import',$4,'T0')`,
    [batchId, `query-t0-${mapId.slice(-12)}`, hash(`snapshot-${mapId}`), operationId],
  );
  await dataSource.query(
    `INSERT INTO hr_yuzhou_production_import_operation(
       operation_id,status,execution_contract_version,target_tenant_id,target_park_id
     ) VALUES($1,'succeeded',2,$2,$3)`,
    [operationId, tenantId, parkId],
  );
  await dataSource.query(
    "INSERT INTO hr_yuzhou_production_import_phase VALUES($1,'T0','succeeded')",
    [operationId],
  );
  await dataSource.query(
    `INSERT INTO legacy_record_map(
       id,batch_id,source_system,source_table,source_pk_canonical,
       source_identity_sha256,source_row_sha256,target_table,target_id,mapping_status,is_active
     ) VALUES($1,$2,'yuzhou-v10','dbo.person','sha256:'||$3::text,$3::char(64),$4,
       'hr_employee',$5,'verified',$6)`,
    [mapId, batchId, identity, hash(`row-${mapId}`), input.employeeId, input.active ?? true],
  );
  await dataSource.query(
    `INSERT INTO hr_yuzhou_production_import_record(
       operation_id,phase,source_identity_sha256,source_system,source_table,
       source_pk_canonical,disposition,target_table,target_id,rollback_status
     ) VALUES($1,'T0',$2::char(64),'yuzhou-v10','dbo.person','sha256:'||$2::text,
       'insert','hr_employee',$3,'not_started')`,
    [operationId, identity, input.employeeId],
  );
  await dataSource.query(
    `INSERT INTO hr_yuzhou_production_import_projection_receipt(
       operation_id,phase,source_identity_sha256,migration_batch_id,legacy_record_map_id
     ) VALUES($1,'T0',$2,$3,$4)`,
    [operationId, identity, batchId, mapId],
  );
  return { identity, mapId };
}

async function addMasterFact(sourcePersonCode: string, sourceMasterId: number) {
  const factId = uuid();
  const factMapId = uuid();
  await dataSource.query(
    `INSERT INTO legacy_record_map(
       id,batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,
       source_row_sha256,target_table,target_id,mapping_status,is_active
     ) VALUES($1,$2,'yuzhou-v10','dbo.assessmentmaster','sha256:'||$3,$3,$4,
       'hr_performance_legacy_master_result',$5,'verified',true)`,
    [factMapId, factBatchId, hash(`master-identity-${sourceMasterId}`), hash(`master-row-${sourceMasterId}`), factId],
  );
  await dataSource.query(
    `INSERT INTO hr_performance_legacy_master_result(
       id,tenant_id,park_id,migration_batch_id,legacy_record_map_id,source_person_code,
       source_master_id,source_session_id,source_self_grade,source_ass_grade,
       source_item_value,source_master_value,source_timekeep_value,source_bonus_value,
       source_total_value,source_appraisal,target_cycle_employee_id
     ) VALUES($1,$2,$3,$4,$5,$6,$7,9,'A','A',78,3,NULL,1,82,
       'Synthetic appraisal',NULL)`,
    [factId, scope.tenantId, scope.parkId, factBatchId, factMapId, sourcePersonCode, sourceMasterId],
  );
  return factId;
}

async function addDimensionFact(sourcePersonCode: string, sourceDetailId: number) {
  const factId = uuid();
  const factMapId = uuid();
  await dataSource.query(
    `INSERT INTO legacy_record_map(
       id,batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,
       source_row_sha256,target_table,target_id,mapping_status,is_active
     ) VALUES($1,$2,'yuzhou-v10','dbo.assessmentdetail','sha256:'||$3,$3,$4,
       'hr_performance_legacy_dimension_result',$5,'verified',true)`,
    [
      factMapId,
      factBatchId,
      hash(`dimension-identity-${sourceDetailId}`),
      hash(`dimension-row-${sourceDetailId}`),
      factId,
    ],
  );
  await dataSource.query(
    `INSERT INTO hr_performance_legacy_dimension_result(
       id,tenant_id,park_id,migration_batch_id,legacy_record_map_id,source_detail_id,
       source_session_id,source_person_code,source_item_id,source_self_value,
       source_m_item_value,source_item_value,source_x_item_value,source_c_item_value,
       source_self_grade,source_ass_grade,source_appraisal,legacy_dimension_profile_id,
       target_cycle_employee_id,target_template_version_id,target_dimension_id
     ) VALUES($1,$2,$3,$4,$5,$6,9,$7,71,76,77,78,79,80,'A','A',
       'Synthetic dimension appraisal',NULL,NULL,NULL,NULL)`,
    [
      factId,
      scope.tenantId,
      scope.parkId,
      factBatchId,
      factMapId,
      sourceDetailId,
      sourcePersonCode,
    ],
  );
  return factId;
}

before(async () => {
  if (!enabled) return;
  dataSource = new DataSource({
    type: "postgres",
    host: process.env.POSTGRES_HOST,
    port: Number(process.env.POSTGRES_PORT),
    username: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB,
  });
  await dataSource.initialize();
  await dataSource.query(`
    CREATE EXTENSION "uuid-ossp";
    CREATE EXTENSION pgcrypto;
    CREATE TABLE migration_batch(
      id uuid PRIMARY KEY,run_id varchar(64) NOT NULL,source_system varchar(64) NOT NULL,
      source_snapshot_sha256 char(64) NOT NULL,target_database varchar(128) NOT NULL,
      phase varchar(32) NOT NULL,status varchar(32) NOT NULL,tool_version varchar(64) NOT NULL,
      execution_context varchar(32) NOT NULL DEFAULT 'lab_rehearsal',
      production_import_operation_id varchar(64),production_import_phase varchar(8)
    );
    CREATE TABLE legacy_record_map(
      id uuid PRIMARY KEY,batch_id uuid NOT NULL REFERENCES migration_batch(id),
      source_system varchar(64) NOT NULL,source_table varchar(256) NOT NULL,
      source_pk_canonical varchar(512) NOT NULL,source_identity_sha256 char(64) NOT NULL,
      source_row_sha256 char(64) NOT NULL,target_table varchar(256) NOT NULL,target_id uuid,
      mapping_status varchar(32) NOT NULL,is_active boolean NOT NULL,
      update_time timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE hr_yuzhou_production_import_operation(
      operation_id varchar(64) PRIMARY KEY,status varchar(32) NOT NULL,
      execution_contract_version smallint NOT NULL,target_tenant_id varchar(64),target_park_id varchar(64)
    );
    CREATE TABLE hr_yuzhou_production_import_phase(
      operation_id varchar(64) NOT NULL,phase varchar(8) NOT NULL,status varchar(24) NOT NULL,
      PRIMARY KEY(operation_id,phase)
    );
    CREATE TABLE hr_yuzhou_production_import_record(
      operation_id varchar(64) NOT NULL,phase varchar(8) NOT NULL,
      source_identity_sha256 char(64) NOT NULL,source_system varchar(64),source_table varchar(256),
      source_pk_canonical varchar(512),disposition varchar(24) NOT NULL,target_table varchar(96),
      target_id uuid,rollback_status varchar(24) NOT NULL,
      PRIMARY KEY(operation_id,phase,source_identity_sha256)
    );
    CREATE TABLE hr_yuzhou_production_import_projection_receipt(
      operation_id varchar(64) NOT NULL,phase varchar(8) NOT NULL,
      source_identity_sha256 char(64) NOT NULL,migration_batch_id uuid NOT NULL,
      legacy_record_map_id uuid NOT NULL UNIQUE,
      PRIMARY KEY(operation_id,phase,source_identity_sha256)
    );
    CREATE TABLE sys_org(
      id uuid PRIMARY KEY,tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
      org_code varchar(64) NOT NULL,parent_id uuid,leader_user_id varchar(64),
      status varchar(32) NOT NULL,is_deleted boolean NOT NULL,
      UNIQUE(id,tenant_id,park_id)
    );
    CREATE TABLE hr_employee(
      id uuid PRIMARY KEY,tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
      full_name varchar(100) NOT NULL,primary_org_id uuid,user_id varchar(64),
      is_deleted boolean NOT NULL DEFAULT false,UNIQUE(tenant_id,park_id,id)
    );
    CREATE TABLE hr_performance_review_cycle(
      id uuid PRIMARY KEY,tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
      UNIQUE(id,tenant_id,park_id)
    );
    CREATE TABLE hr_performance_cycle_employee(
      id uuid PRIMARY KEY,tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
      cycle_id uuid NOT NULL,employee_id uuid NOT NULL,UNIQUE(id,tenant_id,park_id),
      UNIQUE(tenant_id,park_id,cycle_id,employee_id)
    );
    CREATE TABLE hr_performance_legacy_session(
      id uuid PRIMARY KEY,tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
      migration_batch_id uuid NOT NULL,legacy_record_map_id uuid NOT NULL,
      source_identity_sha256 char(64) NOT NULL,source_session_id integer NOT NULL,
      source_session_name varchar(50) NOT NULL,source_assessment_type varchar(12),
      target_review_cycle_id uuid,UNIQUE(id,tenant_id,park_id,migration_batch_id)
    );
    CREATE TABLE hr_performance_legacy_dimension_result(
      id uuid PRIMARY KEY,tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
      migration_batch_id uuid NOT NULL,legacy_record_map_id uuid NOT NULL,
      source_detail_id integer NOT NULL,source_session_id integer,source_person_code varchar(10),
      source_item_id integer,source_self_value numeric(18,2),source_m_item_value numeric(18,2),
      source_item_value numeric(18,2),source_x_item_value numeric(18,2),
      source_c_item_value numeric(18,2),source_self_grade varchar(12),source_ass_grade varchar(12),
      source_appraisal varchar(500),legacy_dimension_profile_id uuid,target_cycle_employee_id uuid,
      target_template_version_id uuid,target_dimension_id uuid,
      UNIQUE(id,tenant_id,park_id)
    );
    CREATE TABLE hr_performance_legacy_master_result(
      id uuid PRIMARY KEY,tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
      migration_batch_id uuid NOT NULL,legacy_record_map_id uuid NOT NULL,
      source_master_id integer NOT NULL,source_session_id integer,source_person_code varchar(10),
      source_self_grade varchar(12),source_ass_grade varchar(12),source_item_value numeric(18,2),
      source_master_value numeric(18,2),source_timekeep_value numeric(18,2),
      source_bonus_value numeric(18,2),source_total_value numeric(18,2),
      source_appraisal varchar(500),source_assessment_person varchar(50),
      source_recorded_at timestamp,source_operator_code varchar(10),target_cycle_employee_id uuid,
      UNIQUE(id,tenant_id,park_id)
    );
    CREATE TABLE hr_performance_legacy_score_source(
      id uuid PRIMARY KEY,tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
      migration_batch_id uuid NOT NULL,source_person_code varchar(10),source_session_id integer,
      UNIQUE(id,tenant_id,park_id)
    );
    CREATE TABLE hr_performance_legacy_source_person_assignment(
      id uuid PRIMARY KEY,tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
      migration_batch_id uuid NOT NULL,source_person_code varchar(10),
      source_assessor_code varchar(50),source_session_id integer,UNIQUE(id,tenant_id,park_id)
    );
  `);
  // Execute the generic payload helper from the real 000301 migration bytes.
  // The authority candidate function, guards and materializer all come from
  // the complete, unmodified 000306 migration below.
  await dataSource.query(exactKeysPrerequisite);
  await dataSource.query(identityMigration);
  await dataSource.query(
    `INSERT INTO migration_batch(
       id,run_id,source_system,source_snapshot_sha256,target_database,phase,status,
       tool_version,execution_context
     ) VALUES($1,'query-family-facts','yuzhou-v10',$2,current_database(),
       'load','running','synthetic-query-contract','lab_rehearsal')`,
    [factBatchId, hash("fact-snapshot")],
  );
  await dataSource.query(
    `INSERT INTO sys_org VALUES
       ($1,$4,$5,'TEAM',NULL,$6,'enabled',false),
       ($2,$4,$5,'TEAM-CHILD',$1,NULL,'enabled',false),
       ($3,$4,$5,'OTHER',NULL,NULL,'enabled',false),
       ($7,$4,$5,'TEAM-DELETED',NULL,NULL,'enabled',true)`,
    [
      teamRootOrgId, teamChildOrgId, otherOrgId, scope.tenantId, scope.parkId,
      teamLeaderId, deletedOrgId,
    ],
  );

  const validEmployee = uuid();
  const otherEmployee = uuid();
  const deletedEmployee = uuid();
  const noOrgEmployee = uuid();
  const inactiveEmployee = uuid();
  const deletedOrgEmployee = uuid();
  const wrongEmployee = uuid();
  const unrelatedEmployee = uuid();
  const ambiguousEmployee = uuid();
  const foreignEmployee = uuid();
  await dataSource.query(
    `INSERT INTO hr_employee VALUES
       ($1,$11,$12,'Synthetic current name',$13,$14,false),
       ($2,$11,$12,'Synthetic other team',$15,NULL,false),
       ($3,$11,$12,'Synthetic deleted',$13,NULL,true),
       ($4,$11,$12,'Synthetic no org',NULL,NULL,false),
       ($5,$11,$12,'Synthetic inactive map',$13,NULL,false),
       ($6,$11,$12,'Synthetic deleted org',$16,NULL,false),
       ($7,$11,$12,'Synthetic wrong',$15,NULL,false),
       ($8,$11,$12,'Synthetic unrelated',$13,NULL,false),
       ($9,$11,$12,'Synthetic ambiguous',$13,NULL,false),
       ($10,'tenant-b','park-b','Synthetic foreign',NULL,NULL,false)`,
    [
      validEmployee, otherEmployee, deletedEmployee, noOrgEmployee, inactiveEmployee,
      deletedOrgEmployee, wrongEmployee, unrelatedEmployee, ambiguousEmployee, foreignEmployee,
      scope.tenantId, scope.parkId, teamChildOrgId, selfUserId, otherOrgId, deletedOrgId,
    ],
  );

  const valid = await addT0PersonMapping({ sourcePersonCode: "P-VALID", employeeId: validEmployee });
  await addT0PersonMapping({ sourcePersonCode: "P-OTHER", employeeId: otherEmployee });
  await addT0PersonMapping({ sourcePersonCode: "P-DELETED", employeeId: deletedEmployee });
  await addT0PersonMapping({ sourcePersonCode: "P-NOORG", employeeId: noOrgEmployee });
  await addT0PersonMapping({ sourcePersonCode: "P-ORGDEL", employeeId: deletedOrgEmployee });
  await addT0PersonMapping({ sourcePersonCode: "P-INACTIVE", employeeId: inactiveEmployee, active: false });
  const wrong = await addT0PersonMapping({ sourcePersonCode: "P-WRONG", employeeId: wrongEmployee });
  const unrelated = await addT0PersonMapping({ sourcePersonCode: "P-UNREL", employeeId: unrelatedEmployee });
  await addT0PersonMapping({ sourcePersonCode: "P-AMBIG", employeeId: ambiguousEmployee });
  await addT0PersonMapping({ sourcePersonCode: "P-AMBIG", employeeId: validEmployee });
  await addT0PersonMapping({
    sourcePersonCode: "P-FOREIGN", employeeId: foreignEmployee, tenantId: "tenant-b", parkId: "park-b",
  });

  await dataSource.query(
    `INSERT INTO hr_performance_legacy_session(
       id,tenant_id,park_id,migration_batch_id,legacy_record_map_id,source_identity_sha256,
       source_session_id,source_session_name,source_assessment_type,target_review_cycle_id
     ) VALUES($1,$2,$3,$4,$5,$6,9,'Synthetic period','YEAR',NULL)`,
    [sessionId, scope.tenantId, scope.parkId, factBatchId, sessionMapId, hash("session-identity")],
  );
  await dataSource.query(
    `INSERT INTO legacy_record_map(
       id,batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,
       source_row_sha256,target_table,target_id,mapping_status,is_active
     ) VALUES($1,$2,'yuzhou-v10','dbo.asssession','sha256:'||$3,$3,$4,
       'hr_performance_legacy_session',$5,'verified',true)`,
    [sessionMapId, factBatchId, hash("session-identity"), hash("session-row"), sessionId],
  );
  const sourceCodes = [
    "P-VALID", "P-OTHER", "P-MISSING", "P-INACTIVE", "P-DELETED", "P-NOORG",
    "P-ORGDEL", "P-AMBIG", "P-FOREIGN", "P-WRONG",
  ];
  for (const [index, sourceCode] of sourceCodes.entries()) {
    await addMasterFact(sourceCode, 9000 + index);
  }
  await addDimensionFact("P-VALID", 7001);

  const wrongFact = (await dataSource.query(
    "SELECT id FROM hr_performance_legacy_master_result WHERE source_person_code='P-WRONG'",
  ) as Array<{ id: string }>)[0]!.id;
  await assert.rejects(
    dataSource.query(
      `INSERT INTO hr_performance_legacy_identity_resolution(
         id,tenant_id,park_id,migration_batch_id,fact_kind,person_role,
         legacy_master_result_id,source_person_identity_sha256,person_resolution_status,
         person_resolution_reason_code,owner_t0_record_map_id,target_employee_id,
         session_binding_id,cycle_resolution_status,cycle_resolution_reason_code,evidence_sha256)
       VALUES(uuid_generate_v4(),$1,$2,$3,'master_result','subject',$4,$5,'resolved',
         'EXACT_T0_PERSON_MAP',$6,$7,NULL,'unmatched','SESSION_BINDING_UNRESOLVED',
         hr_performance_yuzhou_identity_resolution_evidence_sha256(
           'master_result',$4,'subject',$5,'resolved','EXACT_T0_PERSON_MAP',$6,$7,
           NULL,'unmatched','SESSION_BINDING_UNRESOLVED',NULL))`,
      [
        scope.tenantId, scope.parkId, factBatchId, wrongFact, wrong.identity,
        unrelated.mapId, unrelatedEmployee,
      ],
    ),
    /HR_PERFORMANCE_LEGACY_T0_PERSON_RESOLUTION_MISMATCH/u,
  );

  const identityPayload = {
    sessions: [{
      sourceSessionIdentitySha256: hash("session-identity"),
      status: "semantics_unverified",
      reasonCode: "SESSION_SEMANTICS_UNVERIFIED",
      targetReviewCycleId: null,
      decisionAttestationSha256: hash("session-decision"),
    }],
  };
  await materializeIdentity(identityPayload);

  const resolutionFacts = await dataSource.query(
    `SELECT fact.source_person_code "sourcePersonCode",resolution.person_resolution_status "personStatus",
       resolution.cycle_resolution_status "cycleStatus",resolution.target_cycle_employee_id "cycleEmployeeId",
       fact.target_cycle_employee_id "legacyCycleEmployeeId"
     FROM hr_performance_legacy_master_result fact
     JOIN hr_performance_legacy_identity_resolution resolution
       ON resolution.legacy_master_result_id=fact.id AND resolution.person_role='subject'
     ORDER BY fact.source_master_id`,
  ) as Array<Record<string, unknown>>;
  assert.equal(resolutionFacts.length, sourceCodes.length);
  assert.deepEqual(
    resolutionFacts.find((row) => row.sourcePersonCode === "P-VALID"),
    {
      sourcePersonCode: "P-VALID",
      personStatus: "resolved",
      cycleStatus: "unmatched",
      cycleEmployeeId: null,
      legacyCycleEmployeeId: null,
    },
  );
  assert.equal(resolutionFacts.find((row) => row.sourcePersonCode === "P-INACTIVE")?.personStatus, "unmatched");
  assert.equal(resolutionFacts.find((row) => row.sourcePersonCode === "P-AMBIG")?.personStatus, "ambiguous");
  assert.equal(resolutionFacts.find((row) => row.sourcePersonCode === "P-FOREIGN")?.personStatus, "unmatched");
  assert.equal(resolutionFacts.find((row) => row.sourcePersonCode === "P-WRONG")?.personStatus, "resolved");
  assert.equal(
    (await dataSource.query(
      `SELECT count(*)::int total
       FROM hr_performance_yuzhou_t0_person_candidate($1,$2,$3)`,
      [scope.tenantId, scope.parkId, valid.identity],
    ) as Array<{ total: number }>)[0]?.total,
    1,
  );

  // This second dimension fact deliberately arrives after the real 000306
  // materializer. A resolved master_result identity exists for the same source
  // person, but this fact has no dimension_result identity of its own.
  await addDimensionFact("P-VALID", 7002);

  // 000306 intentionally writes only in a lab batch. This disposable fixture
  // changes only its visibility state after the guarded materializer succeeds,
  // so the service can exercise its production-import read gate without a
  // production connection or a fabricated identity row.
  await dataSource.query(
    `UPDATE migration_batch SET execution_context='production_import',status='succeeded',phase='verify'
     WHERE id=$1`,
    [factBatchId],
  );
});

after(async () => {
  if (enabled && dataSource?.isInitialized) await dataSource.destroy();
});

test("current-person query families use actual 000306 identity without a modern cycle", { skip: !enabled }, async () => {
  const audits: Array<Record<string, unknown>> = [];
  const service = queryService(audits);
  const parkActor = actor(uuid(), HR_PERMISSIONS.HR_PERFORMANCE_READ);
  const assessment = await service.assessmentValueQuery(scope, parkActor, {
    ass_session: "Synthetic period", department_prefix: "TEAM", page: 1, page_size: 20,
  });
  assert.equal(assessment.total, 1);
  assert.equal(assessment.items[0]?.employeeDisplayName, "Synthetic current name");
  assert.equal(assessment.items[0]?.sourcePersonCode, "P-VALID");

  const web = await service.webAssQuery(scope, parkActor, {
    ass_session: "Synthetic period", person_like: "P-VALID", right_scope_prefix: "TEAM",
    item_value_min: 0, item_value_max: 100, page: 1, page_size: 20,
  });
  assert.equal(web.total, 1);
  assert.equal(web.items[0]?.employeeDisplayName, "Synthetic current name");

  const assessmentMaster = await service.assessmentMasterQuery(scope, parkActor, {
    ass_session: "Synthetic period", assessment_type: "YEAR",
    department_match_mode: "legacy_like", department_like: "TEAM%", page: 1, page_size: 20,
  });
  assert.equal(assessmentMaster.total, 1);
  assert.equal(assessmentMaster.items[0]?.employeeDisplayName, "Synthetic current name");
  assert.deepEqual(
    audits.map((entry) => (entry.afterJson as { itemCount: number }).itemCount),
    [1, 1, 1],
  );
});

test("person-summary preserves web_ass inner and web_assessmentquery orphan semantics", { skip: !enabled }, async () => {
  const service = queryService();
  const parkActor = actor(uuid(), HR_PERMISSIONS.HR_PERFORMANCE_READ);
  const mapped = await service.personSummary(scope, parkActor, {
    source_person_code: "P-VALID", source_routine: "web_ass", page: 1, page_size: 20,
  });
  assert.equal(mapped.total, 1);
  assert.equal(mapped.items[0]?.employeeDisplayName, "Synthetic current name");
  const omitted = await service.personSummary(scope, parkActor, {
    source_person_code: "P-MISSING", source_routine: "web_ass", page: 1, page_size: 20,
  });
  assert.equal(omitted.total, 0);
  const orphan = await service.personSummary(scope, parkActor, {
    source_person_code: "P-MISSING", source_routine: "web_assessmentquery", page: 1, page_size: 20,
  });
  assert.equal(orphan.total, 1);
  assert.equal(orphan.items[0]?.employeeDisplayName, null);
  const ambiguousOrphan = await service.personSummary(scope, parkActor, {
    source_person_code: "P-AMBIG", source_routine: "web_assessmentquery", page: 1, page_size: 20,
  });
  assert.equal(ambiguousOrphan.total, 1);
  assert.equal(ambiguousOrphan.items[0]?.employeeDisplayName, null);
});

test("team and self scopes narrow through resolved employee identity", { skip: !enabled }, async () => {
  const service = queryService();
  const query = {
    ass_session: "Synthetic period", department_prefix: "TEAM", page: 1, page_size: 20,
  };
  assert.equal((await service.assessmentValueQuery(
    scope, actor(teamLeaderId, HR_PERMISSIONS.HR_PERFORMANCE_TEAM_READ), query,
  )).total, 1);
  assert.equal((await service.assessmentValueQuery(
    scope, actor(selfUserId, HR_PERMISSIONS.HR_PERFORMANCE_SELF_READ), query,
  )).total, 1);
  assert.equal((await service.assessmentValueQuery(
    scope, actor(uuid(), HR_PERMISSIONS.HR_PERFORMANCE_SELF_READ), query,
  )).total, 0);
});

test("dimension results cannot borrow master identity and require a verified unique T0 owner for scoped reads", { skip: !enabled }, async () => {
  const audits: Array<Record<string, unknown>> = [];
  const service = queryService(audits);
  const query = { source_session_id: 9, page: 1, page_size: 20 };

  const park = await service.results(
    scope,
    actor(uuid(), HR_PERMISSIONS.HR_PERFORMANCE_READ),
    query,
  );
  assert.equal(park.total, 2);
  assert.deepEqual(park.items.map((item) => item.sourceDetailId), [7001, 7002]);

  const team = await service.results(
    scope,
    actor(teamLeaderId, HR_PERMISSIONS.HR_PERFORMANCE_TEAM_READ),
    query,
  );
  assert.equal(team.total, 1);
  assert.equal(team.items[0]?.sourceDetailId, 7001);

  const self = await service.results(
    scope,
    actor(selfUserId, HR_PERMISSIONS.HR_PERFORMANCE_SELF_READ),
    query,
  );
  assert.equal(self.total, 1);
  assert.equal(self.items[0]?.sourceDetailId, 7001);

  const identityKinds = await dataSource.query(
    `SELECT fact.source_detail_id "sourceDetailId",resolution.fact_kind "factKind"
     FROM hr_performance_legacy_dimension_result fact
     LEFT JOIN hr_performance_legacy_identity_resolution resolution
       ON resolution.legacy_dimension_result_id=fact.id
      AND resolution.fact_kind='dimension_result'
      AND resolution.person_role='subject'
     WHERE fact.source_person_code='P-VALID'
     ORDER BY fact.source_detail_id`,
  ) as Array<{ sourceDetailId: number; factKind: string | null }>;
  assert.deepEqual(identityKinds, [
    { sourceDetailId: 7001, factKind: "dimension_result" },
    { sourceDetailId: 7002, factKind: null },
  ]);
  assert.equal(
    (await dataSource.query(
      `SELECT count(*)::int total
       FROM hr_performance_legacy_identity_resolution resolution
       JOIN hr_performance_legacy_master_result fact
         ON fact.id=resolution.legacy_master_result_id
       WHERE resolution.fact_kind='master_result'
         AND resolution.person_role='subject'
         AND resolution.person_resolution_status='resolved'
         AND fact.source_person_code='P-VALID'`,
    ) as Array<{ total: number }>)[0]?.total,
    1,
  );
  assert.deepEqual(
    audits.map((entry) => (entry.afterJson as { itemCount: number }).itemCount),
    [2, 1, 1],
  );
});

test("unresolved inactive ambiguous deleted orgless and foreign facts remain invisible", { skip: !enabled }, async () => {
  const service = queryService();
  for (const sourcePersonCode of [
    "P-MISSING", "P-INACTIVE", "P-DELETED", "P-NOORG", "P-ORGDEL", "P-AMBIG", "P-FOREIGN",
  ]) {
    const result = await service.webAssQuery(
      scope,
      actor(uuid(), HR_PERMISSIONS.HR_PERFORMANCE_READ),
      {
        ass_session: "Synthetic period",
        person_like: sourcePersonCode,
        right_scope_prefix: "TEAM",
        item_value_min: 0,
        item_value_max: 100,
        page: 1,
        page_size: 20,
      },
    );
    assert.equal(result.total, 0, sourcePersonCode);
    assert.deepEqual(result.items, [], sourcePersonCode);
  }
});

test("an unverified T0 owner cannot supply person labels or team/self authority", { skip: !enabled }, async () => {
  const changed = await dataSource.query(
    `UPDATE legacy_record_map map SET mapping_status='loaded'
     FROM hr_employee employee
     WHERE map.target_table='hr_employee' AND map.target_id=employee.id
       AND map.source_table='dbo.person' AND map.is_active
       AND employee.user_id=$1 AND employee.tenant_id=$2 AND employee.park_id=$3
       AND map.source_identity_sha256=$4
     RETURNING map.id`,
    [selfUserId, scope.tenantId, scope.parkId, await personIdentity("P-VALID")],
  );
  const maps = typeormQueryRows<{ id: string }>(changed);
  assert.equal(maps.length, 1);
  try {
    const service = queryService();
    const parkActor = actor(uuid(), HR_PERMISSIONS.HR_PERFORMANCE_READ);
    const assessment = await service.assessmentValueQuery(scope, parkActor, {
      ass_session: "Synthetic period", department_prefix: "TEAM", page: 1, page_size: 20,
    });
    assert.equal(assessment.total, 0);
    assert.equal((await service.results(
      scope,
      actor(teamLeaderId, HR_PERMISSIONS.HR_PERFORMANCE_TEAM_READ),
      { source_session_id: 9, page: 1, page_size: 20 },
    )).total, 0);
    assert.equal((await service.results(
      scope,
      actor(selfUserId, HR_PERMISSIONS.HR_PERFORMANCE_SELF_READ),
      { source_session_id: 9, page: 1, page_size: 20 },
    )).total, 0);
    assert.equal((await service.results(
      scope,
      parkActor,
      { source_session_id: 9, page: 1, page_size: 20 },
    )).total, 2);
    for (const principal of [
      parkActor,
      actor(teamLeaderId, HR_PERMISSIONS.HR_PERFORMANCE_TEAM_READ),
      actor(selfUserId, HR_PERMISSIONS.HR_PERFORMANCE_SELF_READ),
    ]) {
      const summary = await service.personSummary(scope, principal, {
        source_person_code: "P-VALID", source_routine: "web_ass", page: 1, page_size: 20,
      });
      assert.equal(summary.total, 0);
    }
    const orphan = await service.personSummary(scope, parkActor, {
      source_person_code: "P-VALID", source_routine: "web_assessmentquery", page: 1, page_size: 20,
    });
    assert.equal(orphan.total, 1);
    assert.equal(orphan.items[0]?.employeeDisplayName, null);
  } finally {
    await dataSource.query("UPDATE legacy_record_map SET mapping_status='verified' WHERE id=$1", [maps[0]!.id]);
  }
});

test("current employee and organization changes drive current-person projection", { skip: !enabled }, async () => {
  const service = queryService();
  await dataSource.query("UPDATE hr_employee SET full_name='Synthetic renamed' WHERE user_id=$1", [selfUserId]);
  await dataSource.query("UPDATE sys_org SET org_code='RENAMED-ORG' WHERE id=$1", [teamChildOrgId]);
  const oldPrefix = await service.assessmentValueQuery(
    scope,
    actor(uuid(), HR_PERMISSIONS.HR_PERFORMANCE_READ),
    { ass_session: "Synthetic period", department_prefix: "TEAM", page: 1, page_size: 20 },
  );
  assert.equal(oldPrefix.total, 0);
  const current = await service.assessmentValueQuery(
    scope,
    actor(uuid(), HR_PERMISSIONS.HR_PERFORMANCE_READ),
    { ass_session: "Synthetic period", department_prefix: "RENAMED", page: 1, page_size: 20 },
  );
  assert.equal(current.total, 1);
  assert.equal(current.items[0]?.employeeDisplayName, "Synthetic renamed");
});

test("a newly ambiguous T0 candidate fails closed without dropping an orphan-preserving row", { skip: !enabled }, async () => {
  const secondEmployeeId = uuid();
  await dataSource.query(
    `INSERT INTO hr_employee(
       id,tenant_id,park_id,user_id,full_name,primary_org_id,is_deleted
     ) VALUES($1,$2,$3,$4,'Synthetic conflicting employee',$5,false)`,
    [secondEmployeeId, scope.tenantId, scope.parkId, uuid(), otherOrgId],
  );
  await addT0PersonMapping({ sourcePersonCode: "P-VALID", employeeId: secondEmployeeId });

  const service = queryService();
  const parkActor = actor(uuid(), HR_PERMISSIONS.HR_PERFORMANCE_READ);
  const inner = await service.personSummary(scope, parkActor, {
    source_person_code: "P-VALID", source_routine: "web_ass", page: 1, page_size: 20,
  });
  assert.equal(inner.total, 0);
  const orphan = await service.personSummary(scope, parkActor, {
    source_person_code: "P-VALID", source_routine: "web_assessmentquery", page: 1, page_size: 20,
  });
  assert.equal(orphan.total, 1);
  assert.equal(orphan.items[0]?.employeeDisplayName, null);
  assert.equal((await service.results(
    scope,
    actor(teamLeaderId, HR_PERMISSIONS.HR_PERFORMANCE_TEAM_READ),
    { source_session_id: 9, page: 1, page_size: 20 },
  )).total, 0);
  assert.equal((await service.results(
    scope,
    actor(selfUserId, HR_PERMISSIONS.HR_PERFORMANCE_SELF_READ),
    { source_session_id: 9, page: 1, page_size: 20 },
  )).total, 0);
});
