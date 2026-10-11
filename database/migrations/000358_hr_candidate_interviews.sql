BEGIN;

CREATE TABLE hr_candidate_interview (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 candidate_id uuid NOT NULL, version integer NOT NULL, round_label varchar(120) NOT NULL,
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, location varchar(240) NOT NULL, interviewer_name varchar(100) NOT NULL,
 status varchar(16) NOT NULL, outcome varchar(16) NOT NULL, result_notes varchar(2000), cancellation_reason varchar(1000),
 updated_by uuid NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT fk_hr_candidate_interview_candidate FOREIGN KEY(tenant_id,park_id,candidate_id) REFERENCES hr_candidate(tenant_id,park_id,id),
 CONSTRAINT fk_hr_candidate_interview_actor FOREIGN KEY(tenant_id,park_id,updated_by) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT uq_hr_candidate_interview_candidate_scope_id UNIQUE(tenant_id,park_id,candidate_id,id),
 CONSTRAINT ck_hr_candidate_interview_version CHECK(version>0),
 CONSTRAINT ck_hr_candidate_interview_time CHECK(ends_at>starts_at),
 CONSTRAINT ck_hr_candidate_interview_required_text CHECK(length(btrim(round_label))>0 AND length(btrim(location))>0 AND length(btrim(interviewer_name))>0),
 CONSTRAINT ck_hr_candidate_interview_state CHECK((status='scheduled' AND outcome='pending' AND result_notes IS NULL AND cancellation_reason IS NULL) OR (status='completed' AND outcome IN ('pass','fail','hold') AND result_notes IS NOT NULL AND length(btrim(result_notes))>0 AND cancellation_reason IS NULL) OR (status='cancelled' AND outcome='pending' AND result_notes IS NULL AND cancellation_reason IS NOT NULL AND length(btrim(cancellation_reason))>0))
);
CREATE INDEX ix_hr_candidate_interview_candidate_time ON hr_candidate_interview(tenant_id,park_id,candidate_id,starts_at DESC,id DESC);

CREATE TABLE hr_candidate_interview_history (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 interview_id uuid NOT NULL, candidate_id uuid NOT NULL, version integer NOT NULL, round_label varchar(120) NOT NULL,
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, location varchar(240) NOT NULL, interviewer_name varchar(100) NOT NULL,
 status varchar(16) NOT NULL, outcome varchar(16) NOT NULL, result_notes varchar(2000), cancellation_reason varchar(1000),
 actor_user_id uuid NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT fk_hr_candidate_interview_history_interview FOREIGN KEY(tenant_id,park_id,candidate_id,interview_id) REFERENCES hr_candidate_interview(tenant_id,park_id,candidate_id,id),
 CONSTRAINT fk_hr_candidate_interview_history_candidate FOREIGN KEY(tenant_id,park_id,candidate_id) REFERENCES hr_candidate(tenant_id,park_id,id),
 CONSTRAINT fk_hr_candidate_interview_history_actor FOREIGN KEY(tenant_id,park_id,actor_user_id) REFERENCES sys_user(tenant_id,park_id,id),
 CONSTRAINT uq_hr_candidate_interview_history_version UNIQUE(tenant_id,park_id,interview_id,version),
 CONSTRAINT uq_hr_candidate_interview_history_scope_id UNIQUE(tenant_id,park_id,id),
 CONSTRAINT ck_hr_candidate_interview_history_version CHECK(version>0),
 CONSTRAINT ck_hr_candidate_interview_history_time CHECK(ends_at>starts_at),
 CONSTRAINT ck_hr_candidate_interview_history_required_text CHECK(length(btrim(round_label))>0 AND length(btrim(location))>0 AND length(btrim(interviewer_name))>0),
 CONSTRAINT ck_hr_candidate_interview_history_state CHECK((status='scheduled' AND outcome='pending' AND result_notes IS NULL AND cancellation_reason IS NULL) OR (status='completed' AND outcome IN ('pass','fail','hold') AND result_notes IS NOT NULL AND length(btrim(result_notes))>0 AND cancellation_reason IS NULL) OR (status='cancelled' AND outcome='pending' AND result_notes IS NULL AND cancellation_reason IS NOT NULL AND length(btrim(cancellation_reason))>0))
);
CREATE INDEX ix_hr_candidate_interview_history_interview ON hr_candidate_interview_history(tenant_id,park_id,candidate_id,interview_id,version DESC,id DESC);
CREATE FUNCTION hr_candidate_interview_history_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Candidate interview history is append-only'; END $$;
CREATE TRIGGER trg_hr_candidate_interview_history_append_only BEFORE UPDATE OR DELETE ON hr_candidate_interview_history FOR EACH ROW EXECUTE FUNCTION hr_candidate_interview_history_append_only();

COMMIT;
