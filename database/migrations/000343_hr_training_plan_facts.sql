-- Append current plan facts without replacing published snapshots or completion times.
CREATE TABLE hr_training_plan_fact_revision (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
 tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL, plan_id uuid NOT NULL,
 sequence_no integer NOT NULL CHECK(sequence_no>0),
 course_title varchar(160) NOT NULL CHECK(length(btrim(course_title))>0),
 start_date date NOT NULL, end_date date NOT NULL CHECK(end_date>=start_date),
 reason varchar(1000) NOT NULL CHECK(length(btrim(reason))>0),
 create_by uuid NOT NULL, create_time timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT fk_hr_training_plan_fact_plan FOREIGN KEY(tenant_id,park_id,plan_id)
  REFERENCES hr_training_plan(tenant_id,park_id,id),
 CONSTRAINT fk_hr_training_plan_fact_actor FOREIGN KEY(tenant_id,park_id,create_by)
  REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT uq_hr_training_plan_fact_sequence UNIQUE(tenant_id,park_id,plan_id,sequence_no)
);
CREATE INDEX ix_hr_training_plan_fact_actor ON hr_training_plan_fact_revision(tenant_id,park_id,create_by);
CREATE FUNCTION fn_hr_training_plan_fact_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ps varchar(24); expected integer;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'training plan facts revisions are append only'; END IF;
 SELECT status INTO ps FROM hr_training_plan
  WHERE tenant_id=NEW.tenant_id AND park_id=NEW.park_id AND id=NEW.plan_id AND NOT is_deleted FOR UPDATE;
 IF ps IS NULL OR ps NOT IN('published','in_progress','completed') THEN
  RAISE EXCEPTION 'training plan facts revision requires a published active or completed plan';
 END IF;
 SELECT COALESCE(max(sequence_no),0)+1 INTO expected FROM hr_training_plan_fact_revision
  WHERE tenant_id=NEW.tenant_id AND park_id=NEW.park_id AND plan_id=NEW.plan_id;
 IF NEW.sequence_no<>expected THEN RAISE EXCEPTION 'training plan facts revision sequence is stale'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_hr_training_plan_fact_guard BEFORE INSERT OR UPDATE OR DELETE ON hr_training_plan_fact_revision
 FOR EACH ROW EXECUTE FUNCTION fn_hr_training_plan_fact_guard();
