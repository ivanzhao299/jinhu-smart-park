BEGIN;

CREATE TABLE hr_performance_template (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 template_code varchar(64) NOT NULL, template_name varchar(120) NOT NULL, status varchar(16) NOT NULL DEFAULT 'draft', current_version_no integer NOT NULL DEFAULT 0,
 create_by uuid, create_time timestamptz NOT NULL DEFAULT now(), update_by uuid, update_time timestamptz NOT NULL DEFAULT now(), is_deleted boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1,
 CONSTRAINT uq_hr_perf_template_scope UNIQUE(id,tenant_id,park_id), CONSTRAINT ck_hr_perf_template_status CHECK(status IN('draft','published','retired'))
);
CREATE UNIQUE INDEX uq_hr_perf_template_code ON hr_performance_template(tenant_id,park_id,template_code) WHERE is_deleted=false;

CREATE TABLE hr_performance_template_version (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL, template_id uuid NOT NULL, version_no integer NOT NULL,
 version_name varchar(120) NOT NULL, status varchar(16) NOT NULL DEFAULT 'draft', total_weight numeric(7,4) NOT NULL, published_at timestamptz,
 create_by uuid, create_time timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT uq_hr_perf_template_version_scope UNIQUE(id,tenant_id,park_id), CONSTRAINT uq_hr_perf_template_version_no UNIQUE(tenant_id,park_id,template_id,version_no),
 CONSTRAINT fk_hr_perf_template_version FOREIGN KEY(template_id,tenant_id,park_id) REFERENCES hr_performance_template(id,tenant_id,park_id),
 CONSTRAINT ck_hr_perf_template_version_status CHECK(status IN('draft','published')), CONSTRAINT ck_hr_perf_template_weight CHECK(total_weight=1)
);
CREATE INDEX idx_hr_perf_template_version_parent ON hr_performance_template_version(template_id,tenant_id,park_id);

CREATE TABLE hr_performance_template_dimension (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL, template_version_id uuid NOT NULL,
 dimension_code varchar(64) NOT NULL, dimension_name varchar(120) NOT NULL, weight numeric(7,4) NOT NULL, score_min numeric(7,2) NOT NULL DEFAULT 0, score_max numeric(7,2) NOT NULL DEFAULT 100, sort_order integer NOT NULL DEFAULT 0,
 scoring_guide jsonb NOT NULL DEFAULT '{}'::jsonb, create_time timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT uq_hr_perf_dimension_scope UNIQUE(id,tenant_id,park_id), CONSTRAINT uq_hr_perf_dimension_code UNIQUE(tenant_id,park_id,template_version_id,dimension_code),
 CONSTRAINT fk_hr_perf_dimension_version FOREIGN KEY(template_version_id,tenant_id,park_id) REFERENCES hr_performance_template_version(id,tenant_id,park_id),
 CONSTRAINT ck_hr_perf_dimension_weight CHECK(weight>0 AND weight<=1), CONSTRAINT ck_hr_perf_dimension_scores CHECK(score_max>score_min AND score_min>=0 AND score_max<=100)
);
CREATE INDEX idx_hr_perf_dimension_parent ON hr_performance_template_dimension(template_version_id,tenant_id,park_id);

CREATE TABLE hr_performance_template_level (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL, template_version_id uuid NOT NULL,
 level_code varchar(32) NOT NULL, level_name varchar(64) NOT NULL, score_min numeric(7,2) NOT NULL, score_max numeric(7,2) NOT NULL, sort_order integer NOT NULL DEFAULT 0, create_time timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT uq_hr_perf_level_scope UNIQUE(id,tenant_id,park_id), CONSTRAINT uq_hr_perf_level_code UNIQUE(tenant_id,park_id,template_version_id,level_code),
 CONSTRAINT fk_hr_perf_level_version FOREIGN KEY(template_version_id,tenant_id,park_id) REFERENCES hr_performance_template_version(id,tenant_id,park_id),
 CONSTRAINT ck_hr_perf_level_scores CHECK(score_min>=0 AND score_max<=100 AND score_max>=score_min)
);
CREATE INDEX idx_hr_perf_level_parent ON hr_performance_template_level(template_version_id,tenant_id,park_id);

CREATE TABLE hr_performance_review_cycle (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL, cycle_code varchar(64) NOT NULL, cycle_name varchar(120) NOT NULL,
 start_date date NOT NULL, end_date date NOT NULL, status varchar(20) NOT NULL DEFAULT 'planning', template_version_id uuid NOT NULL, template_snapshot jsonb NOT NULL,
 applicable_org_ids jsonb NOT NULL DEFAULT '[]'::jsonb, published_at timestamptz, create_by uuid, create_time timestamptz NOT NULL DEFAULT now(), update_by uuid, update_time timestamptz NOT NULL DEFAULT now(), version integer NOT NULL DEFAULT 1,
 CONSTRAINT uq_hr_perf_review_cycle_scope UNIQUE(id,tenant_id,park_id), CONSTRAINT uq_hr_perf_review_cycle_code UNIQUE(tenant_id,park_id,cycle_code),
 CONSTRAINT fk_hr_perf_review_cycle_template FOREIGN KEY(template_version_id,tenant_id,park_id) REFERENCES hr_performance_template_version(id,tenant_id,park_id),
 CONSTRAINT ck_hr_perf_review_cycle_dates CHECK(end_date>=start_date), CONSTRAINT ck_hr_perf_review_cycle_status CHECK(status IN('planning','self_review','manager_review','calibration','employee_acknowledged','appealed','confirmed')),
 CONSTRAINT ck_hr_perf_review_cycle_orgs CHECK(jsonb_typeof(applicable_org_ids)='array')
);
CREATE INDEX idx_hr_perf_review_cycle_template ON hr_performance_review_cycle(template_version_id,tenant_id,park_id);

CREATE TABLE hr_performance_cycle_employee (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL, cycle_id uuid NOT NULL, employee_id uuid NOT NULL,
 employee_snapshot jsonb NOT NULL, goal_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb, status varchar(20) NOT NULL DEFAULT 'planning', create_time timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT uq_hr_perf_cycle_employee_scope UNIQUE(id,tenant_id,park_id), CONSTRAINT uq_hr_perf_cycle_employee UNIQUE(tenant_id,park_id,cycle_id,employee_id),
 CONSTRAINT fk_hr_perf_cycle_employee_cycle FOREIGN KEY(cycle_id,tenant_id,park_id) REFERENCES hr_performance_review_cycle(id,tenant_id,park_id),
 CONSTRAINT fk_hr_perf_cycle_employee_employee FOREIGN KEY(tenant_id,park_id,employee_id) REFERENCES hr_employee(tenant_id,park_id,id),
 CONSTRAINT ck_hr_perf_cycle_employee_status CHECK(status IN('planning','self_review','manager_review','calibration','employee_acknowledged','appealed','confirmed')),
 CONSTRAINT ck_hr_perf_employee_goals CHECK(jsonb_typeof(goal_snapshot)='array')
);
CREATE INDEX idx_hr_perf_cycle_employee_cycle ON hr_performance_cycle_employee(cycle_id,tenant_id,park_id);
CREATE INDEX idx_hr_perf_cycle_employee_employee ON hr_performance_cycle_employee(tenant_id,park_id,employee_id);

CREATE TABLE hr_performance_evidence_reference (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL, cycle_employee_id uuid NOT NULL,
 source_type varchar(24) NOT NULL, source_id uuid NOT NULL, source_version integer NOT NULL, source_snapshot jsonb NOT NULL, create_by uuid, create_time timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT uq_hr_perf_evidence UNIQUE(tenant_id,park_id,cycle_employee_id,source_type,source_id,source_version),
 CONSTRAINT fk_hr_perf_evidence_employee FOREIGN KEY(cycle_employee_id,tenant_id,park_id) REFERENCES hr_performance_cycle_employee(id,tenant_id,park_id),
 CONSTRAINT ck_hr_perf_evidence_type CHECK(source_type IN('attendance','reward','training','feedback_360')), CONSTRAINT ck_hr_perf_evidence_version CHECK(source_version>0)
);
CREATE INDEX idx_hr_perf_evidence_parent ON hr_performance_evidence_reference(cycle_employee_id,tenant_id,park_id);

CREATE FUNCTION hr_performance_snapshot_score(p_template jsonb,p_scores jsonb) RETURNS numeric LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE d jsonb; total numeric:=0; supplied numeric; seen integer:=0;
BEGIN
 IF jsonb_typeof(p_template->'dimensions')<>'array' OR jsonb_typeof(p_scores)<>'object' THEN RAISE EXCEPTION 'invalid performance score payload'; END IF;
 FOR d IN SELECT value FROM jsonb_array_elements(p_template->'dimensions') LOOP
  IF NOT p_scores ? (d->>'code') THEN RAISE EXCEPTION 'missing dimension score'; END IF;
  supplied:=(p_scores->>(d->>'code'))::numeric;
  IF supplied<(d->>'scoreMin')::numeric OR supplied>(d->>'scoreMax')::numeric THEN RAISE EXCEPTION 'dimension score outside frozen range'; END IF;
  total:=total+supplied*(d->>'weight')::numeric; seen:=seen+1;
 END LOOP;
 IF seen=0 OR (SELECT count(*) FROM jsonb_object_keys(p_scores))<>seen THEN RAISE EXCEPTION 'unknown dimension score'; END IF;
 RETURN round(total,2);
END $$;

CREATE FUNCTION hr_performance_freeze_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'published performance configuration is immutable'; END $$;
CREATE FUNCTION hr_performance_template_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'performance template is immutable'; END IF;
 IF (NEW.tenant_id,NEW.park_id,NEW.id,NEW.template_code,NEW.template_name,NEW.create_by,NEW.create_time,NEW.is_deleted) IS DISTINCT FROM (OLD.tenant_id,OLD.park_id,OLD.id,OLD.template_code,OLD.template_name,OLD.create_by,OLD.create_time,OLD.is_deleted) THEN RAISE EXCEPTION 'performance template identity is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_perf_template_immutable BEFORE UPDATE OR DELETE ON hr_performance_template FOR EACH ROW EXECUTE FUNCTION hr_performance_template_guard();
CREATE FUNCTION hr_performance_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE dimension_weight numeric; level_count integer; level_invalid boolean;BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'performance template version is immutable'; END IF;
 IF (NEW.tenant_id,NEW.park_id,NEW.template_id,NEW.version_no,NEW.version_name,NEW.total_weight,NEW.create_by,NEW.create_time) IS DISTINCT FROM (OLD.tenant_id,OLD.park_id,OLD.template_id,OLD.version_no,OLD.version_name,OLD.total_weight,OLD.create_by,OLD.create_time) THEN RAISE EXCEPTION 'performance template version identity is immutable'; END IF;
 IF OLD.status='published' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'published performance configuration is immutable'; END IF;
 IF NEW.status IS DISTINCT FROM OLD.status THEN
  IF OLD.status<>'draft' OR NEW.status<>'published' OR NEW.published_at IS NULL THEN RAISE EXCEPTION 'invalid performance template transition'; END IF;
  SELECT COALESCE(sum(weight),0) INTO dimension_weight FROM hr_performance_template_dimension WHERE tenant_id=OLD.tenant_id AND park_id=OLD.park_id AND template_version_id=OLD.id;
  SELECT count(*) INTO level_count FROM hr_performance_template_level WHERE tenant_id=OLD.tenant_id AND park_id=OLD.park_id AND template_version_id=OLD.id;
  SELECT count(*)=0 OR min(score_min)<>0 OR max(score_max)<>100 OR COALESCE(bool_or(score_max<score_min OR (previous_max IS NOT NULL AND score_min<>previous_max+0.01)),false) INTO level_invalid FROM(SELECT score_min,score_max,lag(score_max)OVER(ORDER BY score_min,score_max,level_code)previous_max FROM hr_performance_template_level WHERE tenant_id=OLD.tenant_id AND park_id=OLD.park_id AND template_version_id=OLD.id)levels;
  IF dimension_weight<>OLD.total_weight OR level_count=0 OR level_invalid THEN RAISE EXCEPTION 'performance template children are incomplete'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_perf_version_immutable BEFORE UPDATE OR DELETE ON hr_performance_template_version FOR EACH ROW EXECUTE FUNCTION hr_performance_version_guard();
CREATE FUNCTION hr_performance_child_freeze_guard() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE r record; published boolean;BEGIN r:=CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;SELECT v.status='published' INTO published FROM hr_performance_template_version v WHERE v.id=r.template_version_id AND v.tenant_id=r.tenant_id AND v.park_id=r.park_id FOR SHARE;IF COALESCE(published,false) THEN RAISE EXCEPTION 'published performance configuration is immutable'; END IF; RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END $$;
CREATE TRIGGER trg_hr_perf_dimension_immutable BEFORE INSERT OR UPDATE OR DELETE ON hr_performance_template_dimension FOR EACH ROW EXECUTE FUNCTION hr_performance_child_freeze_guard();
CREATE TRIGGER trg_hr_perf_level_immutable BEFORE INSERT OR UPDATE OR DELETE ON hr_performance_template_level FOR EACH ROW EXECUTE FUNCTION hr_performance_child_freeze_guard();
CREATE FUNCTION hr_performance_cycle_freeze_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'performance cycle is immutable'; END IF;
 IF (NEW.tenant_id,NEW.park_id,NEW.id,NEW.cycle_code,NEW.create_by,NEW.create_time) IS DISTINCT FROM (OLD.tenant_id,OLD.park_id,OLD.id,OLD.cycle_code,OLD.create_by,OLD.create_time) THEN RAISE EXCEPTION 'performance cycle identity is immutable'; END IF;
 IF OLD.status<>'planning' AND (NEW.template_version_id,NEW.template_snapshot,NEW.applicable_org_ids,NEW.start_date,NEW.end_date) IS DISTINCT FROM (OLD.template_version_id,OLD.template_snapshot,OLD.applicable_org_ids,OLD.start_date,OLD.end_date) THEN RAISE EXCEPTION 'published performance cycle snapshot is immutable'; END IF;
 IF NEW.status IS DISTINCT FROM OLD.status AND NOT ((OLD.status='planning' AND NEW.status='self_review') OR (OLD.status='self_review' AND NEW.status='manager_review') OR (OLD.status='manager_review' AND NEW.status='calibration') OR (OLD.status='calibration' AND NEW.status='employee_acknowledged') OR (OLD.status='employee_acknowledged' AND NEW.status IN('appealed','confirmed')) OR (OLD.status='appealed' AND NEW.status='confirmed')) THEN RAISE EXCEPTION 'invalid performance cycle transition'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_perf_cycle_immutable BEFORE UPDATE OR DELETE ON hr_performance_review_cycle FOR EACH ROW EXECUTE FUNCTION hr_performance_cycle_freeze_guard();
CREATE FUNCTION hr_performance_cycle_employee_guard() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE r record; cycle_status varchar(20);BEGIN
 r:=CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
 SELECT status INTO cycle_status FROM hr_performance_review_cycle WHERE id=r.cycle_id AND tenant_id=r.tenant_id AND park_id=r.park_id FOR SHARE;
 IF TG_OP='INSERT' AND cycle_status<>'planning' THEN RAISE EXCEPTION 'published performance cycle employees are frozen'; END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'performance cycle employee is immutable'; END IF;
 IF TG_OP='UPDATE' AND (NEW.tenant_id,NEW.park_id,NEW.cycle_id,NEW.employee_id,NEW.employee_snapshot,NEW.goal_snapshot,NEW.create_time) IS DISTINCT FROM (OLD.tenant_id,OLD.park_id,OLD.cycle_id,OLD.employee_id,OLD.employee_snapshot,OLD.goal_snapshot,OLD.create_time) THEN RAISE EXCEPTION 'performance cycle employee snapshot is immutable'; END IF;
 IF TG_OP='UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NOT ((OLD.status='planning' AND NEW.status='self_review') OR (OLD.status='self_review' AND NEW.status='manager_review') OR (OLD.status='manager_review' AND NEW.status='calibration') OR (OLD.status='calibration' AND NEW.status='employee_acknowledged') OR (OLD.status='employee_acknowledged' AND NEW.status IN('appealed','confirmed')) OR (OLD.status='appealed' AND NEW.status='confirmed')) THEN RAISE EXCEPTION 'invalid performance employee transition'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER trg_hr_perf_cycle_employee_immutable BEFORE INSERT OR UPDATE OR DELETE ON hr_performance_cycle_employee FOR EACH ROW EXECUTE FUNCTION hr_performance_cycle_employee_guard();
CREATE FUNCTION hr_performance_evidence_guard() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE r record; cycle_status varchar(20);BEGIN
 r:=CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
 IF TG_OP='UPDATE' OR TG_OP='DELETE' THEN RAISE EXCEPTION 'performance evidence is append-only'; END IF;
 SELECT c.status INTO cycle_status FROM hr_performance_cycle_employee ce JOIN hr_performance_review_cycle c ON c.id=ce.cycle_id AND c.tenant_id=ce.tenant_id AND c.park_id=ce.park_id WHERE ce.id=r.cycle_employee_id AND ce.tenant_id=r.tenant_id AND ce.park_id=r.park_id FOR SHARE OF c;
 IF cycle_status<>'planning' THEN RAISE EXCEPTION 'published performance evidence is frozen'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_perf_evidence_immutable BEFORE INSERT OR UPDATE OR DELETE ON hr_performance_evidence_reference FOR EACH ROW EXECUTE FUNCTION hr_performance_evidence_guard();

ALTER TABLE hr_performance_plan ADD COLUMN IF NOT EXISTS source_kind varchar(24) NOT NULL DEFAULT 'legacy_000232';
ALTER TABLE hr_performance_plan ADD COLUMN IF NOT EXISTS review_cycle_id uuid;
ALTER TABLE hr_performance_plan ADD COLUMN IF NOT EXISTS frozen_template_snapshot jsonb;
ALTER TABLE hr_performance_item ADD COLUMN IF NOT EXISTS source_goal_version integer;
ALTER TABLE hr_performance_plan ADD CONSTRAINT fk_hr_perf_legacy_plan_review_cycle FOREIGN KEY(review_cycle_id,tenant_id,park_id) REFERENCES hr_performance_review_cycle(id,tenant_id,park_id);
CREATE INDEX idx_hr_perf_legacy_plan_review_cycle ON hr_performance_plan(review_cycle_id,tenant_id,park_id);

COMMIT;
