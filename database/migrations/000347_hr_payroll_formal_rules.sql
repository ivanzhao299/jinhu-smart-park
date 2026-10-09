BEGIN;

-- Business identities can be created without manufacturing a legacy scheme/id.
CREATE TABLE hr_payroll_rule_set (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 rule_code varchar(64) NOT NULL, display_name varchar(200) NOT NULL, source_book_id uuid,
 head_revision integer NOT NULL DEFAULT 0 CHECK(head_revision>=0),
 created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,park_id,id), UNIQUE(tenant_id,park_id,rule_code), UNIQUE(tenant_id,park_id,source_book_id),
 FOREIGN KEY(tenant_id,park_id,source_book_id) REFERENCES hr_payroll_book(tenant_id,park_id,id),
 CHECK(rule_code ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'), CHECK(length(btrim(display_name))>0)
);

CREATE TABLE hr_payroll_rule_version (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
 rule_set_id uuid NOT NULL, revision_no integer NOT NULL CHECK(revision_no>0), version integer NOT NULL DEFAULT 1 CHECK(version>0),
 status varchar(16) NOT NULL DEFAULT 'draft' CHECK(status IN('draft','submitted','approved','rejected')),
 definition jsonb NOT NULL CHECK(jsonb_typeof(definition)='object'),
 definition_evidence jsonb NOT NULL CHECK(jsonb_typeof(definition_evidence)='object'), definition_sha256 varchar(64) NOT NULL,
 reason varchar(1000) NOT NULL CHECK(length(btrim(reason))>0),
 effective_from date, reviewed_by uuid, reviewed_at timestamptz, review_reason varchar(1000),
 created_by uuid NOT NULL, authored_by uuid NOT NULL, submitted_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,park_id,id), UNIQUE(tenant_id,park_id,rule_set_id,revision_no),
 FOREIGN KEY(tenant_id,park_id,rule_set_id) REFERENCES hr_payroll_rule_set(tenant_id,park_id,id),
 CHECK(definition_sha256 ~ '^[0-9a-f]{64}$'),
 CHECK((status IN('approved','rejected') AND reviewed_by IS NOT NULL AND reviewed_by<>created_by AND reviewed_by<>authored_by AND reviewed_by<>submitted_by
   AND reviewed_at IS NOT NULL AND review_reason IS NOT NULL AND length(btrim(review_reason))>0)
   OR (status IN('draft','submitted') AND reviewed_by IS NULL AND reviewed_at IS NULL AND review_reason IS NULL)),
 CHECK((status='approved' AND effective_from IS NOT NULL AND effective_from=date_trunc('month',effective_from)::date)
   OR (status<>'approved' AND effective_from IS NULL))
 ,CHECK((status='draft' AND submitted_by IS NULL) OR (status<>'draft' AND submitted_by IS NOT NULL))
 ,CHECK(definition ? 'roundingPolicy' AND definition->>'roundingPolicy'='line_items_half_up'
   AND definition ? 'items' AND jsonb_typeof(definition->'items')='array')
);
CREATE UNIQUE INDEX uq_hr_payroll_rule_effective_month ON hr_payroll_rule_version(tenant_id,park_id,rule_set_id,effective_from) WHERE status='approved';
CREATE INDEX idx_hr_payroll_rule_versions ON hr_payroll_rule_version(tenant_id,park_id,rule_set_id,revision_no DESC);

CREATE FUNCTION hr_payroll_formal_rule_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_head integer;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'payroll rule versions cannot be deleted'; END IF;
 IF TG_OP='INSERT' THEN
  SELECT head_revision INTO current_head FROM hr_payroll_rule_set
   WHERE (id,tenant_id,park_id)=(NEW.rule_set_id,NEW.tenant_id,NEW.park_id) FOR UPDATE;
  IF current_head IS NULL OR NEW.revision_no<>current_head+1 OR NEW.version<>1 OR NEW.status<>'draft' OR NEW.authored_by<>NEW.created_by THEN
   RAISE EXCEPTION 'payroll rule draft revision must follow its scoped parent';
  END IF;
  UPDATE hr_payroll_rule_set SET head_revision=NEW.revision_no
   WHERE (id,tenant_id,park_id)=(NEW.rule_set_id,NEW.tenant_id,NEW.park_id);
 ELSE
  IF OLD.status IN('approved','rejected') THEN RAISE EXCEPTION 'reviewed payroll rule version is immutable'; END IF;
  IF NEW.version<>OLD.version+1 OR
   (to_jsonb(NEW)-ARRAY['definition','definition_evidence','definition_sha256','reason','status','version','updated_at','effective_from','reviewed_by','reviewed_at','review_reason','authored_by','submitted_by']) IS DISTINCT FROM
   (to_jsonb(OLD)-ARRAY['definition','definition_evidence','definition_sha256','reason','status','version','updated_at','effective_from','reviewed_by','reviewed_at','review_reason','authored_by','submitted_by']) THEN
   RAISE EXCEPTION 'payroll rule identity or optimistic version changed';
  END IF;
  IF OLD.status='draft' AND NEW.status NOT IN('draft','submitted') THEN RAISE EXCEPTION 'draft must be submitted before review'; END IF;
  IF NEW.status='submitted' AND NEW.authored_by IS DISTINCT FROM OLD.authored_by THEN RAISE EXCEPTION 'submission cannot change rule authorship'; END IF;
  IF OLD.status='submitted' AND (NEW.status NOT IN('approved','rejected') OR
   NEW.definition IS DISTINCT FROM OLD.definition OR NEW.definition_evidence IS DISTINCT FROM OLD.definition_evidence OR NEW.reason IS DISTINCT FROM OLD.reason OR
   NEW.authored_by IS DISTINCT FROM OLD.authored_by OR NEW.submitted_by IS DISTINCT FROM OLD.submitted_by) THEN
   RAISE EXCEPTION 'submitted payroll definition is frozen until review';
  END IF;
 END IF;
 NEW.definition_sha256:=encode(sha256(convert_to(jsonb_build_object('definition',NEW.definition,'evidence',NEW.definition_evidence)::text,'UTF8')),'hex');
 RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_payroll_formal_rule_guard BEFORE INSERT OR UPDATE OR DELETE ON hr_payroll_rule_version
 FOR EACH ROW EXECUTE FUNCTION hr_payroll_formal_rule_guard();

COMMIT;
