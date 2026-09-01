BEGIN;

CREATE TABLE hr_training_position_requirement (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 position_id uuid NOT NULL, course_id uuid NOT NULL, course_version_id uuid NOT NULL, status varchar(16) NOT NULL DEFAULT 'enabled',
 create_by uuid NOT NULL, create_time timestamptz NOT NULL DEFAULT now(), disabled_by uuid, disabled_at timestamptz,
 CONSTRAINT ck_hr_training_position_requirement_status CHECK(status IN('enabled','disabled')),
 CONSTRAINT ck_hr_training_position_requirement_disabled CHECK((status='enabled' AND disabled_by IS NULL AND disabled_at IS NULL) OR (status='disabled' AND disabled_by IS NOT NULL AND disabled_at IS NOT NULL)),
 CONSTRAINT fk_hr_training_position_requirement_position FOREIGN KEY(tenant_id,park_id,position_id) REFERENCES hr_position(tenant_id,park_id,id),
 CONSTRAINT fk_hr_training_position_requirement_course FOREIGN KEY(tenant_id,park_id,course_id) REFERENCES hr_training_course(tenant_id,park_id,id),
 CONSTRAINT fk_hr_training_position_requirement_course_version FOREIGN KEY(tenant_id,park_id,course_id,course_version_id) REFERENCES hr_training_course_version(tenant_id,park_id,course_id,id),
 CONSTRAINT fk_hr_training_position_requirement_creator FOREIGN KEY(tenant_id,park_id,create_by) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT fk_hr_training_position_requirement_disabler FOREIGN KEY(tenant_id,park_id,disabled_by) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT uq_hr_training_position_requirement_scope_id UNIQUE(tenant_id,park_id,id)
);
CREATE UNIQUE INDEX uq_hr_training_position_requirement_active ON hr_training_position_requirement(tenant_id,park_id,position_id,course_id) WHERE status='enabled';
CREATE INDEX ix_hr_training_position_requirement_position ON hr_training_position_requirement(tenant_id,park_id,position_id,status);
CREATE INDEX ix_hr_training_position_requirement_course ON hr_training_position_requirement(tenant_id,park_id,course_id,status);

CREATE OR REPLACE FUNCTION fn_hr_training_position_requirement_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'training position requirement is immutable'; END IF;
 IF (NEW.tenant_id,NEW.park_id,NEW.position_id,NEW.course_id,NEW.course_version_id,NEW.create_by,NEW.create_time) IS DISTINCT FROM (OLD.tenant_id,OLD.park_id,OLD.position_id,OLD.course_id,OLD.course_version_id,OLD.create_by,OLD.create_time) THEN RAISE EXCEPTION 'training position requirement identity is immutable'; END IF;
 IF OLD.status='disabled' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'disabled training position requirement is immutable'; END IF;
 IF NEW.status IS DISTINCT FROM OLD.status AND NOT(OLD.status='enabled' AND NEW.status='disabled') THEN RAISE EXCEPTION 'invalid training position requirement transition'; END IF;
 IF OLD.status='enabled' AND NEW.status='enabled' AND (NEW.disabled_by,NEW.disabled_at) IS DISTINCT FROM (OLD.disabled_by,OLD.disabled_at) THEN RAISE EXCEPTION 'enabled training position requirement cannot be altered'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_hr_training_position_requirement_guard BEFORE UPDATE OR DELETE ON hr_training_position_requirement FOR EACH ROW EXECUTE FUNCTION fn_hr_training_position_requirement_guard();

COMMIT;
