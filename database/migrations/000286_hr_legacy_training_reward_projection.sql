BEGIN;

CREATE TABLE hr_legacy_training_reward_projection (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  migration_batch_id uuid NOT NULL REFERENCES migration_batch(id),
  source_table varchar(64) NOT NULL,
  source_identity_sha256 char(64) NOT NULL,
  source_row_sha256 char(64) NOT NULL,
  projection_kind varchar(32) NOT NULL,
  training_course_id uuid,
  training_course_version_id uuid,
  training_plan_id uuid,
  training_participant_id uuid,
  reward_category_id uuid,
  reward_category_version_id uuid,
  status varchar(16) NOT NULL DEFAULT 'staged',
  create_time timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_hr_legacy_training_reward_projection_source CHECK(source_table IN('dbo.trainhis','dbo.bonuscode') AND source_identity_sha256~'^[0-9a-f]{64}$' AND source_row_sha256~'^[0-9a-f]{64}$'),
  CONSTRAINT ck_hr_legacy_training_reward_projection_kind CHECK((projection_kind='training_history' AND training_course_id IS NOT NULL AND training_course_version_id IS NOT NULL AND training_plan_id IS NOT NULL AND training_participant_id IS NOT NULL AND reward_category_id IS NULL AND reward_category_version_id IS NULL) OR (projection_kind='reward_category' AND training_course_id IS NULL AND training_course_version_id IS NULL AND training_plan_id IS NULL AND training_participant_id IS NULL AND reward_category_id IS NOT NULL AND reward_category_version_id IS NOT NULL)),
  CONSTRAINT ck_hr_legacy_training_reward_projection_status CHECK(status IN('staged','rolled_back')),
  CONSTRAINT uq_hr_legacy_training_reward_projection_scope_id UNIQUE(tenant_id,park_id,id),
  CONSTRAINT uq_hr_legacy_training_reward_projection_source UNIQUE(migration_batch_id,source_table,source_identity_sha256)
);
ALTER TABLE hr_legacy_training_reward_projection
  ADD CONSTRAINT fk_hr_legacy_training_reward_projection_course_scope FOREIGN KEY(tenant_id,park_id,training_course_id) REFERENCES hr_training_course(tenant_id,park_id,id) DEFERRABLE INITIALLY IMMEDIATE,
  ADD CONSTRAINT fk_hr_legacy_training_reward_projection_course_version_scope FOREIGN KEY(tenant_id,park_id,training_course_version_id) REFERENCES hr_training_course_version(tenant_id,park_id,id) DEFERRABLE INITIALLY IMMEDIATE,
  ADD CONSTRAINT fk_hr_legacy_training_reward_projection_plan_scope FOREIGN KEY(tenant_id,park_id,training_plan_id) REFERENCES hr_training_plan(tenant_id,park_id,id) DEFERRABLE INITIALLY IMMEDIATE,
  ADD CONSTRAINT fk_hr_legacy_training_reward_projection_participant_scope FOREIGN KEY(tenant_id,park_id,training_participant_id) REFERENCES hr_training_participant(tenant_id,park_id,id) DEFERRABLE INITIALLY IMMEDIATE,
  ADD CONSTRAINT fk_hr_legacy_training_reward_projection_category_scope FOREIGN KEY(tenant_id,park_id,reward_category_id) REFERENCES hr_reward_discipline_category(tenant_id,park_id,id) DEFERRABLE INITIALLY IMMEDIATE,
  ADD CONSTRAINT fk_hr_legacy_training_reward_projection_category_version_scope FOREIGN KEY(tenant_id,park_id,reward_category_version_id) REFERENCES hr_reward_discipline_category_version(tenant_id,park_id,id) DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX ix_hr_legacy_training_reward_projection_batch ON hr_legacy_training_reward_projection(migration_batch_id,status);
CREATE INDEX ix_hr_legacy_training_reward_projection_training_plan ON hr_legacy_training_reward_projection(tenant_id,park_id,training_plan_id) WHERE training_plan_id IS NOT NULL;
CREATE INDEX ix_hr_legacy_training_reward_projection_reward_category ON hr_legacy_training_reward_projection(tenant_id,park_id,reward_category_id) WHERE reward_category_id IS NOT NULL;

CREATE OR REPLACE FUNCTION hr_legacy_training_reward_rollback_allowed(p_target_table text,p_target_id uuid) RETURNS boolean LANGUAGE plpgsql STABLE SET search_path=public,pg_temp AS $$
DECLARE active_run text:=current_setting('yuzhou.training_reward_rollback',true);
BEGIN
  IF active_run IS NULL OR current_database()!~'^jinhu_hr_migration_lab_[A-Za-z0-9_]{6,64}$' THEN RETURN false; END IF;
  RETURN EXISTS(
    SELECT 1 FROM hr_legacy_training_reward_projection p
    JOIN migration_batch b ON b.id=p.migration_batch_id
    WHERE b.run_id=active_run AND b.target_database=current_database() AND b.status='succeeded' AND p.status='staged'
      AND ((p_target_table='hr_training_course' AND p.training_course_id=p_target_id)
        OR (p_target_table='hr_training_course_version' AND p.training_course_version_id=p_target_id)
        OR (p_target_table='hr_training_plan' AND p.training_plan_id=p_target_id)
        OR (p_target_table='hr_training_participant' AND p.training_participant_id=p_target_id)
        OR (p_target_table='hr_reward_discipline_category' AND p.reward_category_id=p_target_id)
        OR (p_target_table='hr_reward_discipline_category_version' AND p.reward_category_version_id=p_target_id))
  );
END $$;

CREATE OR REPLACE FUNCTION fn_hr_training_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' AND hr_legacy_training_reward_rollback_allowed(TG_TABLE_NAME,OLD.id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION '% is append-only',TG_TABLE_NAME;
END $$;

CREATE OR REPLACE FUNCTION fn_hr_training_plan_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF hr_legacy_training_reward_rollback_allowed(TG_TABLE_NAME,OLD.id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'training plan is immutable';
 END IF;
 IF NEW.status IS DISTINCT FROM OLD.status AND NOT ((OLD.status='draft' AND NEW.status='published') OR (OLD.status='published' AND NEW.status='in_progress') OR (OLD.status='in_progress' AND NEW.status IN('completed','cancelled'))) THEN RAISE EXCEPTION 'invalid training plan transition'; END IF;
 IF OLD.status<>'draft' AND (NEW.course_id,NEW.course_version_id,NEW.mandatory,NEW.start_date,NEW.end_date,NEW.budget_amount,NEW.cost_currency,NEW.participant_scope,NEW.snapshot,NEW.published_at) IS DISTINCT FROM (OLD.course_id,OLD.course_version_id,OLD.mandatory,OLD.start_date,OLD.end_date,OLD.budget_amount,OLD.cost_currency,OLD.participant_scope,OLD.snapshot,OLD.published_at) THEN RAISE EXCEPTION 'published training plan snapshot is immutable'; END IF;
 IF OLD.status IN('completed','cancelled') AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'terminal training plan is immutable'; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION fn_hr_training_participant_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ps varchar(24);
BEGIN
 IF TG_OP='DELETE' AND hr_legacy_training_reward_rollback_allowed(TG_TABLE_NAME,OLD.id) THEN RETURN OLD; END IF;
 SELECT status INTO ps FROM hr_training_plan WHERE tenant_id=COALESCE(NEW.tenant_id,OLD.tenant_id) AND park_id=COALESCE(NEW.park_id,OLD.park_id) AND id=COALESCE(NEW.plan_id,OLD.plan_id) FOR SHARE;
 IF TG_OP='INSERT' AND ps<>'draft' THEN RAISE EXCEPTION 'published training participants are immutable'; END IF;
 IF TG_OP='DELETE' AND ps<>'draft' THEN RAISE EXCEPTION 'published training participants are immutable'; END IF;
 IF TG_OP='UPDATE' AND (NEW.tenant_id,NEW.park_id,NEW.plan_id,NEW.employee_id) IS DISTINCT FROM (OLD.tenant_id,OLD.park_id,OLD.plan_id,OLD.employee_id) THEN RAISE EXCEPTION 'training participant ownership is immutable'; END IF;
 IF TG_OP='UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NOT ((OLD.status='assigned' AND NEW.status IN('checked_in','completed','cancelled')) OR (OLD.status='checked_in' AND NEW.status IN('completed','cancelled'))) THEN RAISE EXCEPTION 'invalid training participant transition'; END IF;
 IF TG_OP='UPDATE' AND OLD.status='completed' AND (NEW.status,NEW.checked_in_at,NEW.completed_at,NEW.completed_hours,NEW.score,NEW.evaluation,NEW.actual_cost,NEW.certificate_file_id) IS DISTINCT FROM (OLD.status,OLD.checked_in_at,OLD.completed_at,OLD.completed_hours,OLD.score,OLD.evaluation,OLD.actual_cost,OLD.certificate_file_id) THEN RAISE EXCEPTION 'completed training result requires correction'; END IF;
 RETURN COALESCE(NEW,OLD);
END $$;

CREATE OR REPLACE FUNCTION fn_hr_reward_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' AND hr_legacy_training_reward_rollback_allowed(TG_TABLE_NAME,OLD.id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION '% is append-only',TG_TABLE_NAME;
END $$;

CREATE OR REPLACE FUNCTION fn_hr_reward_category_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF hr_legacy_training_reward_rollback_allowed(TG_TABLE_NAME,OLD.id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'reward category is immutable';
 END IF;
 IF (NEW.tenant_id,NEW.park_id,NEW.category_code,NEW.create_by,NEW.create_time,NEW.is_deleted) IS DISTINCT FROM (OLD.tenant_id,OLD.park_id,OLD.category_code,OLD.create_by,OLD.create_time,OLD.is_deleted) THEN RAISE EXCEPTION 'reward category identity is immutable'; END IF;
 IF NEW.current_version_no IS DISTINCT FROM OLD.current_version_no THEN
  IF NEW.current_version_no<>OLD.current_version_no+1 OR NOT EXISTS(SELECT 1 FROM hr_reward_discipline_category_version v WHERE v.tenant_id=NEW.tenant_id AND v.park_id=NEW.park_id AND v.category_id=NEW.id AND v.version_no=NEW.current_version_no FOR SHARE) THEN RAISE EXCEPTION 'invalid reward category version pointer'; END IF;
 END IF;
 RETURN NEW;
END $$;

COMMIT;
