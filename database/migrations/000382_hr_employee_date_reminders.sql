BEGIN;

-- User storage can belong to a different home scope in enterprise mode.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_user_employee_reminder_tenant_id ON sys_user(tenant_id,id);

CREATE TABLE hr_employee_date_reminder(
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,
 employee_id uuid NOT NULL,reminder_kind varchar(32) NOT NULL,window_days integer NOT NULL,due_date date NOT NULL,
 recipient_user_id uuid NOT NULL,source_date date NOT NULL,source_version integer NOT NULL,leap_day_policy varchar(16) NOT NULL,
 recipient_kinds text[] NOT NULL,
 dedupe_key char(64) NOT NULL,status varchar(32) NOT NULL DEFAULT 'open',read_at timestamptz,acknowledged_at timestamptz,resolved_at timestamptz,cancelled_at timestamptz,cancel_reason varchar(64),
 create_by uuid,update_by uuid,create_time timestamptz NOT NULL DEFAULT now(),update_time timestamptz NOT NULL DEFAULT now(),is_deleted boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1,
 CONSTRAINT ck_hr_employee_date_reminder_kind CHECK(reminder_kind IN('birthday','hire_anniversary')),
 CONSTRAINT ck_hr_employee_date_reminder_window CHECK(window_days BETWEEN 0 AND 365),
 CONSTRAINT ck_hr_employee_date_reminder_policy CHECK(leap_day_policy IN('skip','feb_28','mar_1')),
 CONSTRAINT ck_hr_employee_date_reminder_status CHECK(status IN('open','read','acknowledged','resolved','cancelled')),
 CONSTRAINT ck_hr_employee_date_reminder_recipients CHECK(cardinality(recipient_kinds) BETWEEN 1 AND 3 AND recipient_kinds <@ ARRAY['hr','manager','employee']::text[]),
 CONSTRAINT ck_hr_employee_date_reminder_dedupe CHECK(dedupe_key~'^[0-9a-f]{64}$'),
 CONSTRAINT fk_hr_employee_date_reminder_employee FOREIGN KEY(tenant_id,park_id,employee_id) REFERENCES hr_employee(tenant_id,park_id,id),
 CONSTRAINT fk_hr_employee_date_reminder_recipient FOREIGN KEY(tenant_id,recipient_user_id) REFERENCES sys_user(tenant_id,id),
 CONSTRAINT uq_hr_employee_date_reminder_scope_id UNIQUE(tenant_id,park_id,id),
 CONSTRAINT uq_hr_employee_date_reminder_scope_key UNIQUE(tenant_id,park_id,dedupe_key)
);
CREATE INDEX ix_hr_employee_date_reminder_inbox ON hr_employee_date_reminder(tenant_id,park_id,recipient_user_id,status,due_date);
CREATE INDEX ix_hr_employee_date_reminder_employee ON hr_employee_date_reminder(tenant_id,park_id,employee_id,status);

CREATE TABLE hr_employee_date_reminder_action(
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,reminder_id uuid NOT NULL,
 sequence_no integer NOT NULL,action varchar(32) NOT NULL,actor_user_id uuid NOT NULL,occurred_at timestamptz NOT NULL DEFAULT now(),comment_digest char(64),
 CONSTRAINT fk_hr_employee_date_reminder_action_actor FOREIGN KEY(tenant_id,actor_user_id) REFERENCES sys_user(tenant_id,id),
 CONSTRAINT ck_hr_employee_date_reminder_action CHECK(action IN('read','acknowledge','resolve','cancel')),
 CONSTRAINT fk_hr_employee_date_reminder_action FOREIGN KEY(tenant_id,park_id,reminder_id) REFERENCES hr_employee_date_reminder(tenant_id,park_id,id),
 CONSTRAINT uq_hr_employee_date_reminder_action UNIQUE(tenant_id,park_id,reminder_id,sequence_no)
);
CREATE FUNCTION reject_hr_employee_date_reminder_action_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Employee reminder action history is immutable and append-only';
END;
$$;
CREATE TRIGGER trg_hr_employee_date_reminder_action_immutable
 BEFORE UPDATE OR DELETE ON hr_employee_date_reminder_action
 FOR EACH ROW EXECUTE FUNCTION reject_hr_employee_date_reminder_action_change();
COMMIT;
