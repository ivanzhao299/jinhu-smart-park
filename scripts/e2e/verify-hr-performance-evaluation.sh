#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/docker/docker-compose.yml}"
POSTGRES_USER="${POSTGRES_USER:-jinhu}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"

docker compose -f "$COMPOSE_FILE" exec -T postgres psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<'SQL'
BEGIN;

CREATE TEMP TABLE perf_gate_ids(manager_user uuid,employee_user_1 uuid,employee_user_2 uuid,org_id uuid) ON COMMIT DROP;
INSERT INTO perf_gate_ids
SELECT
 (array_agg(u.id ORDER BY u.id))[1],
 (array_agg(u.id ORDER BY u.id))[2],
 (array_agg(u.id ORDER BY u.id))[3],
 (SELECT id FROM sys_org WHERE tenant_id='10000001' AND park_id='20000001' AND is_deleted=false ORDER BY id LIMIT 1)
FROM sys_user u WHERE u.tenant_id='10000001' AND u.park_id='20000001' AND u.is_deleted=false;
DO $$BEGIN IF EXISTS(SELECT 1 FROM perf_gate_ids WHERE manager_user IS NULL OR employee_user_1 IS NULL OR employee_user_2 IS NULL OR org_id IS NULL)THEN RAISE EXCEPTION 'performance gate requires three users and one organization';END IF;END$$;

INSERT INTO hr_employee(id,tenant_id,park_id,employee_code,full_name,user_id,primary_org_id,employment_status)
SELECT '25900000-0000-4000-8000-000000000001','10000001','20000001','T6P2B-M','校准主管',manager_user,org_id,'active' FROM perf_gate_ids;
INSERT INTO hr_employee(id,tenant_id,park_id,employee_code,full_name,user_id,primary_org_id,manager_employee_id,employment_status)
SELECT '25900000-0000-4000-8000-000000000002','10000001','20000001','T6P2B-E1','绩效员工一',employee_user_1,org_id,'25900000-0000-4000-8000-000000000001','active' FROM perf_gate_ids;
INSERT INTO hr_employee(id,tenant_id,park_id,employee_code,full_name,user_id,primary_org_id,manager_employee_id,employment_status)
SELECT '25900000-0000-4000-8000-000000000003','10000001','20000001','T6P2B-E2','绩效员工二',employee_user_2,org_id,'25900000-0000-4000-8000-000000000001','active' FROM perf_gate_ids;

CREATE TEMP TABLE perf_online_before AS
SELECT
 (SELECT md5(string_agg(id::text||':'||version::text,',' ORDER BY id)) FROM hr_employee WHERE id::text LIKE '25900000-%') employee_hash,
 (SELECT count(*) FROM hr_payroll_run) payroll_runs,
 (SELECT count(*) FROM hr_payslip) payslips,
 (SELECT count(*) FROM hr_employee_attendance_daily_result) attendance_results;

INSERT INTO hr_performance_template(id,tenant_id,park_id,template_code,template_name,status,current_version_no)
VALUES('25910000-0000-4000-8000-000000000001','10000001','20000001','T6P2B-GATE','Phase2B PG Gate','draft',1);
INSERT INTO hr_performance_template_version(id,tenant_id,park_id,template_id,version_no,version_name,status,total_weight)
VALUES('25910000-0000-4000-8000-000000000002','10000001','20000001','25910000-0000-4000-8000-000000000001',1,'Gate v1','draft',1);
INSERT INTO hr_performance_template_dimension(id,tenant_id,park_id,template_version_id,dimension_code,dimension_name,weight,score_min,score_max,sort_order)VALUES
 ('25910000-0000-4000-8000-000000000011','10000001','20000001','25910000-0000-4000-8000-000000000002','result','结果',0.6,0,100,1),
 ('25910000-0000-4000-8000-000000000012','10000001','20000001','25910000-0000-4000-8000-000000000002','ability','能力',0.4,0,100,2);
INSERT INTO hr_performance_template_level(id,tenant_id,park_id,template_version_id,level_code,level_name,score_min,score_max,sort_order)VALUES
 ('25910000-0000-4000-8000-000000000021','10000001','20000001','25910000-0000-4000-8000-000000000002','B','良好',80,100,1),
 ('25910000-0000-4000-8000-000000000022','10000001','20000001','25910000-0000-4000-8000-000000000002','C','合格',0,79.99,2);
UPDATE hr_performance_template_version SET status='published',published_at=now() WHERE id='25910000-0000-4000-8000-000000000002';
UPDATE hr_performance_template SET status='published' WHERE id='25910000-0000-4000-8000-000000000001';

INSERT INTO hr_performance_review_cycle(id,tenant_id,park_id,cycle_code,cycle_name,start_date,end_date,status,template_version_id,template_snapshot,applicable_org_ids)
VALUES('25920000-0000-4000-8000-000000000001','10000001','20000001','T6P2B-CYCLE','Phase2B Gate Cycle','2026-01-01','2026-12-31','planning','25910000-0000-4000-8000-000000000002',jsonb_build_object('dimensions',jsonb_build_array(jsonb_build_object('code','result','name','结果','weight','0.6000','scoreMin','0','scoreMax','100'),jsonb_build_object('code','ability','name','能力','weight','0.4000','scoreMin','0','scoreMax','100')),'levels',jsonb_build_array(jsonb_build_object('code','B','name','良好','scoreMin','80','scoreMax','100'),jsonb_build_object('code','C','name','合格','scoreMin','0','scoreMax','79.99'))),(SELECT jsonb_build_array(org_id)FROM perf_gate_ids));
INSERT INTO hr_performance_cycle_employee(id,tenant_id,park_id,cycle_id,employee_id,employee_snapshot,status)VALUES
 ('25930000-0000-4000-8000-000000000001','10000001','20000001','25920000-0000-4000-8000-000000000001','25900000-0000-4000-8000-000000000002','{"employeeCode":"T6P2B-E1","fullName":"绩效员工一","managerEmployeeId":"25900000-0000-4000-8000-000000000001"}','planning'),
 ('25930000-0000-4000-8000-000000000002','10000001','20000001','25920000-0000-4000-8000-000000000001','25900000-0000-4000-8000-000000000003','{"employeeCode":"T6P2B-E2","fullName":"绩效员工二","managerEmployeeId":"25900000-0000-4000-8000-000000000001"}','planning');
UPDATE hr_performance_review_cycle SET status='self_review',published_at=now() WHERE id='25920000-0000-4000-8000-000000000001';
UPDATE hr_performance_cycle_employee SET status='self_review' WHERE cycle_id='25920000-0000-4000-8000-000000000001';

DO $$DECLARE target uuid; score numeric;BEGIN
 FOR target IN SELECT id FROM hr_performance_cycle_employee WHERE cycle_id='25920000-0000-4000-8000-000000000001' ORDER BY id LOOP
  SELECT hr_performance_snapshot_score(template_snapshot,'{"result":80.10,"ability":90.20}') INTO score FROM hr_performance_review_cycle WHERE id='25920000-0000-4000-8000-000000000001';
  IF score<>84.14 THEN RAISE EXCEPTION 'numeric score mismatch: %',score;END IF;
  INSERT INTO hr_performance_review_submission(tenant_id,park_id,cycle_employee_id,submission_type,submission_no,dimension_scores,computed_score,actor_user_id,actor_employee_id)
  SELECT '10000001','20000001',target,'self',1,'{"result":80.10,"ability":90.20}',score,user_id,id FROM hr_employee WHERE id=(SELECT employee_id FROM hr_performance_cycle_employee WHERE id=target);
  UPDATE hr_performance_cycle_employee SET status='manager_review',self_score=score WHERE id=target;
  INSERT INTO hr_performance_review_submission(tenant_id,park_id,cycle_employee_id,submission_type,submission_no,dimension_scores,computed_score,actor_user_id,actor_employee_id)
  SELECT '10000001','20000001',target,'manager',1,'{"result":90.00,"ability":80.00}',86,user_id,id FROM hr_employee WHERE id='25900000-0000-4000-8000-000000000001';
  UPDATE hr_performance_cycle_employee SET status='calibration',manager_score=86 WHERE id=target;
 END LOOP;
END$$;
UPDATE hr_performance_review_cycle SET status='manager_review' WHERE id='25920000-0000-4000-8000-000000000001';
UPDATE hr_performance_review_cycle SET status='calibration' WHERE id='25920000-0000-4000-8000-000000000001';

INSERT INTO hr_performance_calibration_batch(id,tenant_id,park_id,cycle_id,batch_name,meeting_at,status,created_by)
SELECT '25940000-0000-4000-8000-000000000001','10000001','20000001','25920000-0000-4000-8000-000000000001','Gate Calibration',now(),'draft',manager_user FROM perf_gate_ids;
INSERT INTO hr_performance_calibration_participant(tenant_id,park_id,batch_id,participant_user_id,participant_employee_id)
SELECT '10000001','20000001','25940000-0000-4000-8000-000000000001',manager_user,'25900000-0000-4000-8000-000000000001' FROM perf_gate_ids;
UPDATE hr_performance_calibration_batch SET status='active' WHERE id='25940000-0000-4000-8000-000000000001';
INSERT INTO hr_performance_calibration_entry(tenant_id,park_id,batch_id,cycle_employee_id,entry_no,before_score,after_score,dimension_scores,reason,actor_user_id)
SELECT '10000001','20000001','25940000-0000-4000-8000-000000000001','25930000-0000-4000-8000-000000000001',1,86,88,'{"result":90,"ability":85}','校准会一致确认',manager_user FROM perf_gate_ids;

DO $$BEGIN
 BEGIN
  INSERT INTO hr_performance_calibration_entry(tenant_id,park_id,batch_id,cycle_employee_id,entry_no,before_score,after_score,dimension_scores,reason,actor_user_id)
  SELECT '10000001','20000001','25940000-0000-4000-8000-000000000001','25930000-0000-4000-8000-000000000001',2,88,89,'{"result":90,"ability":87.5}',' ',manager_user FROM perf_gate_ids;
  RAISE EXCEPTION 'blank calibration reason accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
END$$;

UPDATE hr_performance_cycle_employee SET status='employee_acknowledged',calibrated_score=88,final_score=88,final_level_code='B',final_level_name='良好',result_finalized_at=now() WHERE id='25930000-0000-4000-8000-000000000001';
UPDATE hr_performance_cycle_employee SET status='employee_acknowledged',calibrated_score=86,final_score=86,final_level_code='B',final_level_name='良好',result_finalized_at=now() WHERE id='25930000-0000-4000-8000-000000000002';
UPDATE hr_performance_review_cycle SET status='employee_acknowledged' WHERE id='25920000-0000-4000-8000-000000000001';

INSERT INTO hr_performance_appeal(tenant_id,park_id,cycle_employee_id,appeal_no,reason,status,submitted_by)
SELECT '10000001','20000001','25930000-0000-4000-8000-000000000001',1,'对目标证据认定有异议','submitted',employee_user_1 FROM perf_gate_ids;
UPDATE hr_performance_cycle_employee SET status='appealed' WHERE id='25930000-0000-4000-8000-000000000001';
UPDATE hr_performance_review_cycle SET status='appealed' WHERE id='25920000-0000-4000-8000-000000000001';
UPDATE hr_performance_appeal SET status='upheld',decision='upheld',decision_reason='补充证据成立',resolved_by=(SELECT manager_user FROM perf_gate_ids),resolved_at=now() WHERE cycle_employee_id='25930000-0000-4000-8000-000000000001';
INSERT INTO hr_performance_review_action(tenant_id,park_id,cycle_employee_id,action_no,action_type,from_status,to_status,actor_user_id,reference_type,reference_id,reason,result_snapshot)
SELECT '10000001','20000001','25930000-0000-4000-8000-000000000001',1,'appeal_upheld','appealed','confirmed',manager_user,'appeal',(SELECT id FROM hr_performance_appeal WHERE cycle_employee_id='25930000-0000-4000-8000-000000000001'),'补充证据成立','{"dimensionScores":{"result":90,"ability":90},"beforeScore":"88","afterScore":"90","levelCode":"B"}' FROM perf_gate_ids;
UPDATE hr_performance_cycle_employee SET status='confirmed',final_score=90,final_level_code='B',final_level_name='良好',confirmed_at=now() WHERE id='25930000-0000-4000-8000-000000000001';
UPDATE hr_performance_cycle_employee SET status='confirmed',acknowledged_at=now(),confirmed_at=now() WHERE id='25930000-0000-4000-8000-000000000002';

DO $$BEGIN
 BEGIN UPDATE hr_performance_cycle_employee SET final_score=91 WHERE id='25930000-0000-4000-8000-000000000001';RAISE EXCEPTION 'terminal performance result accepted mutation';EXCEPTION WHEN OTHERS THEN IF SQLERRM='terminal performance result accepted mutation' THEN RAISE;END IF;END;
 BEGIN UPDATE hr_performance_review_submission SET computed_score=1 WHERE cycle_employee_id='25930000-0000-4000-8000-000000000001';RAISE EXCEPTION 'performance submission accepted mutation';EXCEPTION WHEN OTHERS THEN IF SQLERRM='performance submission accepted mutation' THEN RAISE;END IF;END;
 BEGIN DELETE FROM hr_performance_calibration_entry WHERE cycle_employee_id='25930000-0000-4000-8000-000000000001';RAISE EXCEPTION 'calibration entry accepted deletion';EXCEPTION WHEN OTHERS THEN IF SQLERRM='calibration entry accepted deletion' THEN RAISE;END IF;END;
END$$;

DO $$DECLARE before_row record;after_employee text;after_runs bigint;after_payslips bigint;after_attendance bigint;BEGIN
 SELECT * INTO before_row FROM perf_online_before;
 SELECT md5(string_agg(id::text||':'||version::text,',' ORDER BY id)) INTO after_employee FROM hr_employee WHERE id::text LIKE '25900000-%';
 SELECT count(*) INTO after_runs FROM hr_payroll_run;SELECT count(*) INTO after_payslips FROM hr_payslip;SELECT count(*) INTO after_attendance FROM hr_employee_attendance_daily_result;
 IF (before_row.employee_hash,before_row.payroll_runs,before_row.payslips,before_row.attendance_results) IS DISTINCT FROM (after_employee,after_runs,after_payslips,after_attendance) THEN RAISE EXCEPTION 'performance evaluation changed employee/payroll/attendance facts';END IF;
END$$;

ROLLBACK;
SELECT 'HR performance Phase2-B PostgreSQL gate passed' AS result;
SQL
