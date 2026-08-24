BEGIN;

CREATE TABLE IF NOT EXISTS hr_payroll_review_action (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  review_case_id uuid NOT NULL,
  sequence_no integer NOT NULL,
  action varchar(32) NOT NULL,
  decision varchar(32) NOT NULL,
  comment varchar(1000) NOT NULL,
  actor_id uuid NOT NULL,
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500),
  CONSTRAINT fk_hr_payroll_review_action_case
    FOREIGN KEY (tenant_id,park_id,review_case_id)
    REFERENCES hr_payroll_review_case(tenant_id,park_id,id),
  CONSTRAINT ck_hr_payroll_review_action_sequence CHECK (sequence_no > 0),
  CONSTRAINT ck_hr_payroll_review_action_action CHECK (action IN ('comment','resolve','reject')),
  CONSTRAINT ck_hr_payroll_review_action_decision CHECK (decision IN ('needs_follow_up','accepted_exception','mapping_confirmed','unsafe_rejected')),
  CONSTRAINT ck_hr_payroll_review_action_transition CHECK (
    (action='comment' AND decision='needs_follow_up') OR
    (action='resolve' AND decision IN ('accepted_exception','mapping_confirmed')) OR
    (action='reject' AND decision='unsafe_rejected')
  ),
  CONSTRAINT ck_hr_payroll_review_action_not_deleted CHECK (is_deleted=false),
  CONSTRAINT uq_hr_payroll_review_action_sequence UNIQUE (tenant_id,park_id,review_case_id,sequence_no),
  CONSTRAINT uq_hr_payroll_review_action_scope_id UNIQUE (tenant_id,park_id,id)
);
CREATE INDEX IF NOT EXISTS idx_hr_payroll_review_action_case_fk
  ON hr_payroll_review_action(tenant_id,park_id,review_case_id);
CREATE INDEX IF NOT EXISTS idx_hr_payroll_review_action_actor_fk
  ON hr_payroll_review_action(tenant_id,park_id,actor_id);

CREATE OR REPLACE FUNCTION public.hr_payroll_review_action_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  prior_terminal boolean;
BEGIN
  PERFORM 1
  FROM public.hr_payroll_review_case
  WHERE tenant_id=NEW.tenant_id AND park_id=NEW.park_id AND id=NEW.review_case_id
  FOR UPDATE;

  SELECT EXISTS (
    SELECT 1 FROM public.hr_payroll_review_action
    WHERE tenant_id=NEW.tenant_id AND park_id=NEW.park_id
      AND review_case_id=NEW.review_case_id AND is_deleted=false
      AND action IN ('resolve','reject')
  ) INTO prior_terminal;
  IF prior_terminal THEN
    RAISE EXCEPTION 'Legacy payroll review case already has a terminal action';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_hr_payroll_review_action_insert_guard ON hr_payroll_review_action;
CREATE TRIGGER trg_hr_payroll_review_action_insert_guard
  BEFORE INSERT ON hr_payroll_review_action
  FOR EACH ROW EXECUTE FUNCTION hr_payroll_review_action_insert_guard();

CREATE OR REPLACE FUNCTION public.hr_payroll_review_action_append_only_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Legacy payroll review actions are append-only';
END $$;
DROP TRIGGER IF EXISTS trg_hr_payroll_review_action_guard ON hr_payroll_review_action;
CREATE TRIGGER trg_hr_payroll_review_action_guard
  BEFORE UPDATE OR DELETE ON hr_payroll_review_action
  FOR EACH ROW EXECUTE FUNCTION hr_payroll_review_action_append_only_guard();

COMMIT;
