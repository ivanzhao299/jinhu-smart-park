import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const previous = readFileSync(new URL("../../database/migrations/000292_hr_yuzhou_production_import_t5_custom_fields.sql", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../database/migrations/000312_hr_yuzhou_orphan_quarantine_dependencies.sql", import.meta.url), "utf8");
const functionBody = sql => {
  const match = sql.match(/CREATE OR REPLACE FUNCTION hr_yuzhou_validate_production_import_v2_dependency_graph\(\) RETURNS trigger[\s\S]*?END\$\$;/u);
  assert.ok(match, "expected dependency function required");
  return match[0];
};
const exception = `
  -- Missing parents are the reason for quarantine, not a reason to lose the source.
  -- Supplied roles/tables/parents remain validated below and by existing graph FKs.
  IF v_record.disposition='quarantine' THEN
    v_optional := v_optional || v_required;
    v_required := ARRAY[]::text[];
  END IF;
`;

test("forward-only orphan migration changes only required-to-optional quarantine references", () => {
  assert.equal(functionBody(migration).replace(exception, ""), functionBody(previous));
  assert.match(migration, /^BEGIN;[\s\S]*COMMIT;\s*$/u);
  assert.doesNotMatch(migration, /\b(?:ALTER TABLE|DROP|GRANT|INSERT INTO|UPDATE|DELETE FROM)\b/u);
});

test("real PostgreSQL reproduces old rejection then accepts orphan quarantine with no permanent objects", { skip: !process.env.YUZHOU_ORPHAN_QUARANTINE_PG_CONTAINER }, () => {
  const container = process.env.YUZHOU_ORPHAN_QUARANTINE_PG_CONTAINER;
  assert.match(container, /^[A-Za-z0-9][A-Za-z0-9_.-]{0,100}$/u);
  const docker = (args, input) => {
    const result = spawnSync("docker", args, { input, encoding: "utf8", timeout: 30000, maxBuffer: 131072 });
    // Never surface arbitrary database diagnostics or connection material.
    assert.equal(result.status, 0, "ORPHAN_QUARANTINE_PG_CHECK_FAILED");
    return result.stdout.trim();
  };
  const context = docker(["context", "show"]);
  assert.match(docker(["context", "inspect", context, "--format", "{{.Endpoints.docker.Host}}"]), /^unix:\/\//u);
  const tempFunction = source => functionBody(source)
    .replace("FUNCTION hr_yuzhou_", "FUNCTION pg_temp.hr_yuzhou_")
    .replace("SET search_path=public,pg_temp", "SET search_path=pg_temp");
  const sql = `
BEGIN;
SET LOCAL statement_timeout='10s';
CREATE TEMP TABLE hr_yuzhou_production_import_operation(operation_id varchar(64) PRIMARY KEY,execution_contract_version smallint);
CREATE TEMP TABLE hr_yuzhou_production_import_record(
  operation_id varchar(64),phase varchar(8),source_identity_sha256 char(64),planned_target_table text,
  disposition text,target_table text,target_id uuid,PRIMARY KEY(operation_id,phase,source_identity_sha256));
CREATE TEMP TABLE hr_yuzhou_production_import_record_dependency(
  operation_id varchar(64),phase varchar(8),source_identity_sha256 char(64),dependency_role text,
  depends_on_phase varchar(8),depends_on_source_identity_sha256 char(64),expected_target_table text,
  PRIMARY KEY(operation_id,phase,source_identity_sha256,dependency_role),
  FOREIGN KEY(operation_id,phase,source_identity_sha256) REFERENCES hr_yuzhou_production_import_record,
  FOREIGN KEY(operation_id,depends_on_phase,depends_on_source_identity_sha256) REFERENCES hr_yuzhou_production_import_record);
${tempFunction(previous)}
CREATE CONSTRAINT TRIGGER orphan_dependency_record AFTER INSERT OR UPDATE ON hr_yuzhou_production_import_record
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION pg_temp.hr_yuzhou_validate_production_import_v2_dependency_graph();
CREATE CONSTRAINT TRIGGER orphan_dependency_ref AFTER INSERT OR UPDATE OR DELETE ON hr_yuzhou_production_import_record_dependency
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION pg_temp.hr_yuzhou_validate_production_import_v2_dependency_graph();
INSERT INTO hr_yuzhou_production_import_operation VALUES ('synthetic-orphan',2);
DO $$ BEGIN
  BEGIN
    INSERT INTO hr_yuzhou_production_import_record VALUES ('synthetic-orphan','T2','old','hr_contract_change','quarantine',NULL,NULL);
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'OLD_BLOCKER_NOT_REPRODUCED';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT IN ('HR_PRODUCTION_IMPORT_V2_DEPENDENCY_SET_INVALID','HR_PRODUCTION_IMPORT_V2_DEPENDENCY_REQUIRED') THEN RAISE; END IF;
  END;
END $$;
${tempFunction(migration)}
DO $$ DECLARE name text; BEGIN
  FOREACH name IN ARRAY ARRAY['sys_org','hr_position','hr_employee','hr_employment_event','hr_contract_type','hr_contract','hr_contract_change','hr_contract_legacy_evidence','hr_attendance_import_batch','hr_attendance_symbol_rule','hr_attendance_calendar_source','hr_attendance_day','hr_insurance_policy','hr_insurance_policy_item','hr_employee_insurance_period','hr_employee_insurance_item','hr_employee_profile','hr_employee_family','hr_employee_skill','hr_employee_credential','hr_custom_field_definition','hr_employee_custom_value'] LOOP
    INSERT INTO hr_yuzhou_production_import_record VALUES ('synthetic-orphan','T2',name,name,'quarantine',NULL,NULL);
  END LOOP;
END $$;
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
DO $$ DECLARE disposition_name text; BEGIN
  FOREACH disposition_name IN ARRAY ARRAY['insert','merge','skip_approved'] LOOP
    BEGIN
      INSERT INTO hr_yuzhou_production_import_record VALUES ('synthetic-orphan','T2','active','hr_contract_change',disposition_name,'hr_contract_change','11111111-1111-4111-8111-111111111111');
      SET CONSTRAINTS ALL IMMEDIATE;
      RAISE EXCEPTION 'ACTIVE_MISSING_PARENT_ACCEPTED';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM NOT IN ('HR_PRODUCTION_IMPORT_V2_DEPENDENCY_SET_INVALID','HR_PRODUCTION_IMPORT_V2_DEPENDENCY_REQUIRED') THEN RAISE; END IF;
    END;
  END LOOP;
END $$;
-- A known employee reference can be retained without fabricating a contract type.
INSERT INTO hr_yuzhou_production_import_record_dependency VALUES ('synthetic-orphan','T2','hr_contract','employee','T2','hr_employee','hr_employee');
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
DO $$ BEGIN
  BEGIN
    INSERT INTO hr_yuzhou_production_import_record_dependency VALUES ('synthetic-orphan','T2','hr_contract_change','contract','T2','hr_employee','hr_contract');
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'WRONG_PARENT_TABLE_ACCEPTED';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'HR_PRODUCTION_IMPORT_V2_DEPENDENCY_TARGET_INVALID' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO hr_yuzhou_production_import_record_dependency VALUES ('synthetic-orphan','T2','hr_contract_change','contract','T2','missing','hr_contract');
    RAISE EXCEPTION 'MISSING_PARENT_MAP_ACCEPTED';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO hr_yuzhou_production_import_record VALUES ('synthetic-orphan','T2','active-child','hr_contract_change','insert','hr_contract_change','11111111-1111-4111-8111-111111111111');
    INSERT INTO hr_yuzhou_production_import_record_dependency VALUES ('synthetic-orphan','T2','active-child','contract','T2','hr_contract','hr_contract');
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'QUARANTINED_PARENT_ACCEPTED_FOR_INSERT';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'HR_PRODUCTION_IMPORT_V2_DEPENDENCY_TARGET_INVALID' THEN RAISE; END IF;
  END;
END $$;
SELECT count(*) FROM hr_yuzhou_production_import_record;
ROLLBACK;
SELECT count(*) FROM pg_class WHERE relnamespace=pg_my_temp_schema();
SELECT count(*) FROM pg_proc WHERE pronamespace=pg_my_temp_schema();
`;
  const output = docker(["exec", "-i", container, "psql", "-X", "-w", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-U", "jinhu", "-d", "postgres"], sql);
  assert.equal(output, "22\n0\n0", "22 synthetic quarantine rows and zero residual temporary relations/functions");
});
