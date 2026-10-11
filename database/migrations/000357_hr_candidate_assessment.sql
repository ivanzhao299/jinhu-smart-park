BEGIN;

CREATE TABLE hr_candidate_assessment (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 candidate_id uuid NOT NULL, version integer NOT NULL,
 heart_test numeric(18,0), heart_memo varchar(200), knowledge_test numeric(18,0), knowledge_memo varchar(200),
 job_test numeric(18,0), job_memo varchar(200), assignment_test numeric(18,0), assignment_memo varchar(200),
 knowhow_test numeric(18,2), knowhow_memo varchar(200), face_test numeric(18,2), face_memo varchar(200),
 total_test numeric(18,2), total_test_memo varchar(200), updated_by uuid NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT fk_hr_candidate_assessment_candidate FOREIGN KEY(tenant_id,park_id,candidate_id) REFERENCES hr_candidate(tenant_id,park_id,id),
 CONSTRAINT fk_hr_candidate_assessment_actor FOREIGN KEY(tenant_id,park_id,updated_by) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT uq_hr_candidate_assessment_candidate UNIQUE(tenant_id,park_id,candidate_id),
 CONSTRAINT ck_hr_candidate_assessment_version CHECK(version>0),
 CONSTRAINT uq_hr_candidate_assessment_scope_id UNIQUE(tenant_id,park_id,id)
);

CREATE TABLE hr_candidate_assessment_history (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 candidate_id uuid NOT NULL, assessment_version integer NOT NULL,
 heart_test numeric(18,0), heart_memo varchar(200), knowledge_test numeric(18,0), knowledge_memo varchar(200),
 job_test numeric(18,0), job_memo varchar(200), assignment_test numeric(18,0), assignment_memo varchar(200),
 knowhow_test numeric(18,2), knowhow_memo varchar(200), face_test numeric(18,2), face_memo varchar(200),
 total_test numeric(18,2), total_test_memo varchar(200), actor_user_id uuid NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT fk_hr_candidate_assessment_history_candidate FOREIGN KEY(tenant_id,park_id,candidate_id) REFERENCES hr_candidate(tenant_id,park_id,id),
 CONSTRAINT fk_hr_candidate_assessment_history_actor FOREIGN KEY(tenant_id,park_id,actor_user_id) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT uq_hr_candidate_assessment_history_version UNIQUE(tenant_id,park_id,candidate_id,assessment_version),
 CONSTRAINT ck_hr_candidate_assessment_history_version CHECK(assessment_version>0),
 CONSTRAINT uq_hr_candidate_assessment_history_scope_id UNIQUE(tenant_id,park_id,id)
);
CREATE INDEX ix_hr_candidate_assessment_history_candidate ON hr_candidate_assessment_history(tenant_id,park_id,candidate_id,assessment_version DESC);
CREATE FUNCTION hr_candidate_assessment_history_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Candidate assessment history is append-only'; END $$;
CREATE TRIGGER trg_hr_candidate_assessment_history_append_only BEFORE UPDATE OR DELETE ON hr_candidate_assessment_history FOR EACH ROW EXECUTE FUNCTION hr_candidate_assessment_history_append_only();
COMMIT;
