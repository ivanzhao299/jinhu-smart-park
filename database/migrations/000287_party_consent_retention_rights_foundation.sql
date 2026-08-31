BEGIN;

ALTER TABLE public.biz_party
  ADD COLUMN IF NOT EXISTS current_consent_fact_id uuid,
  ADD COLUMN IF NOT EXISTS processing_restricted_at timestamptz,
  ADD COLUMN IF NOT EXISTS processing_restriction_reason varchar(500),
  ADD COLUMN IF NOT EXISTS processing_restriction_request_id uuid;

CREATE TABLE IF NOT EXISTS public.biz_party_consent_fact (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  party_id uuid NOT NULL,
  status varchar(32) NOT NULL,
  lawful_basis varchar(32) NOT NULL,
  processing_purpose varchar(64) NOT NULL,
  notice_version varchar(128),
  effective_at timestamptz,
  revoked_at timestamptz,
  channel varchar(32),
  provenance varchar(32) NOT NULL,
  observed_legacy_status varchar(32),
  operator_id uuid,
  request_key varchar(128) NOT NULL,
  request_hash varchar(64) NOT NULL,
  create_by varchar(64),
  create_time timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_party_consent_fact_scope_id UNIQUE (tenant_id, park_id, id),
  CONSTRAINT uq_party_consent_fact_request UNIQUE (tenant_id, park_id, party_id, request_key),
  CONSTRAINT fk_party_consent_fact_party FOREIGN KEY (tenant_id, park_id, party_id)
    REFERENCES public.biz_party(tenant_id, park_id, id) ON DELETE RESTRICT,
  CONSTRAINT ck_party_consent_fact_status CHECK (status IN ('pending_evidence','granted','withdrawn','not_applicable')),
  CONSTRAINT ck_party_consent_fact_basis CHECK (lawful_basis IN ('consent','legal_obligation')),
  CONSTRAINT ck_party_consent_fact_purpose CHECK (processing_purpose IN ('identity_verification','accommodation_checkin','housing_move_in','legal_compliance')),
  CONSTRAINT ck_party_consent_fact_channel CHECK (channel IS NULL OR channel IN ('in_person','web','mobile','paper','system_migration')),
  CONSTRAINT ck_party_consent_fact_provenance CHECK (provenance IN ('operator_recorded','legacy_unknown')),
  CONSTRAINT ck_party_consent_fact_legacy_truth CHECK (
    (provenance='legacy_unknown' AND status='pending_evidence' AND lawful_basis='consent'
      AND processing_purpose='identity_verification' AND notice_version IS NULL
      AND effective_at IS NULL AND revoked_at IS NULL AND channel IS NULL
      AND operator_id IS NULL AND observed_legacy_status IN ('pending','granted','withdrawn'))
    OR
    (provenance='operator_recorded' AND observed_legacy_status IS NULL AND channel IS NOT NULL
      AND operator_id IS NOT NULL AND (
        (lawful_basis='consent' AND status IN ('granted','withdrawn') AND notice_version IS NOT NULL
          AND effective_at IS NOT NULL AND (status<>'withdrawn' OR revoked_at IS NOT NULL))
        OR
        (lawful_basis='legal_obligation' AND status='not_applicable' AND notice_version IS NULL)
      ))
  )
);

ALTER TABLE public.biz_party_consent_fact
  ADD CONSTRAINT ck_party_consent_fact_time_order CHECK (
    revoked_at IS NULL OR (effective_at IS NOT NULL AND revoked_at >= effective_at)
  );

INSERT INTO public.biz_party_consent_fact(
  tenant_id, park_id, party_id, status, lawful_basis, processing_purpose,
  provenance, observed_legacy_status, request_key, request_hash, create_by, create_time
)
SELECT party.tenant_id, party.park_id, party.id, 'pending_evidence', 'consent',
       'identity_verification', 'legacy_unknown', party.consent_status,
       'migration-000287-legacy-consent', repeat('0',64), 'system:migration:000287', now()
FROM public.biz_party party
WHERE NOT EXISTS (
  SELECT 1 FROM public.biz_party_consent_fact fact
  WHERE fact.tenant_id=party.tenant_id AND fact.park_id=party.park_id
    AND fact.party_id=party.id AND fact.request_key='migration-000287-legacy-consent'
);

ALTER TABLE public.biz_party
  ADD CONSTRAINT fk_biz_party_current_consent_fact
  FOREIGN KEY (tenant_id, park_id, current_consent_fact_id)
  REFERENCES public.biz_party_consent_fact(tenant_id, park_id, id) ON DELETE RESTRICT;

UPDATE public.biz_party party
SET current_consent_fact_id=fact.id
FROM public.biz_party_consent_fact fact
WHERE fact.tenant_id=party.tenant_id AND fact.park_id=party.park_id
  AND fact.party_id=party.id AND fact.request_key='migration-000287-legacy-consent'
  AND party.current_consent_fact_id IS NULL;

-- Flush the deferred Party projection event before later ALTER TABLE statements.
-- The migration remains atomic; a projection mismatch still aborts this transaction.
SET CONSTRAINTS ALL IMMEDIATE;

CREATE INDEX IF NOT EXISTS idx_party_consent_fact_party_time
  ON public.biz_party_consent_fact(tenant_id, park_id, party_id, create_time DESC);

CREATE OR REPLACE FUNCTION public.fn_party_consent_fact_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'party consent facts are append-only';
END;
$$;
DROP TRIGGER IF EXISTS trg_party_consent_fact_immutable ON public.biz_party_consent_fact;
CREATE TRIGGER trg_party_consent_fact_immutable
BEFORE UPDATE OR DELETE ON public.biz_party_consent_fact
FOR EACH ROW EXECUTE FUNCTION public.fn_party_consent_fact_immutable();

CREATE OR REPLACE FUNCTION public.fn_biz_party_current_consent_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE fact_party_id uuid; fact_status varchar(32); fact_provenance varchar(32); legacy_status varchar(32);
BEGIN
  IF NEW.current_consent_fact_id IS NULL THEN RETURN NEW; END IF;
  SELECT party_id,status,provenance,observed_legacy_status
    INTO fact_party_id,fact_status,fact_provenance,legacy_status
  FROM public.biz_party_consent_fact
  WHERE tenant_id=NEW.tenant_id AND park_id=NEW.park_id AND id=NEW.current_consent_fact_id;
  IF fact_party_id IS DISTINCT FROM NEW.id THEN
    RAISE EXCEPTION 'current consent fact must belong to the same party';
  END IF;
  IF fact_provenance='legacy_unknown' AND legacy_status IS DISTINCT FROM NEW.consent_status THEN
    RAISE EXCEPTION 'legacy consent projection must preserve the observed status';
  END IF;
  IF fact_provenance='operator_recorded' AND
     (CASE fact_status WHEN 'granted' THEN 'granted' WHEN 'withdrawn' THEN 'withdrawn' ELSE 'pending' END)
       IS DISTINCT FROM NEW.consent_status THEN
    RAISE EXCEPTION 'consent projection must match the current fact';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_biz_party_current_consent_guard ON public.biz_party;
CREATE CONSTRAINT TRIGGER trg_biz_party_current_consent_guard
AFTER INSERT OR UPDATE OF current_consent_fact_id,consent_status ON public.biz_party
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION public.fn_biz_party_current_consent_guard();

CREATE TABLE IF NOT EXISTS public.biz_party_identity_retention_policy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  submission_days integer NOT NULL DEFAULT 730,
  submission_action varchar(32) NOT NULL DEFAULT 'restrict_processing',
  snapshot_days integer NOT NULL DEFAULT 1825,
  snapshot_action varchar(32) NOT NULL DEFAULT 'restrict_processing',
  identity_photo_days integer NOT NULL DEFAULT 730,
  identity_photo_action varchar(32) NOT NULL DEFAULT 'restrict_processing',
  protected_audit_days integer NOT NULL DEFAULT 1825,
  protected_audit_action varchar(32) NOT NULL DEFAULT 'retain_restricted',
  legal_review_status varchar(32) NOT NULL DEFAULT 'pending_legal_review',
  version bigint NOT NULL DEFAULT 1,
  create_by varchar(64), create_time timestamptz NOT NULL DEFAULT now(),
  update_by varchar(64), update_time timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_party_identity_retention_policy_scope UNIQUE (tenant_id, park_id),
  CONSTRAINT ck_party_identity_retention_days CHECK (
    submission_days BETWEEN 1 AND 36500 AND snapshot_days BETWEEN 1 AND 36500
    AND identity_photo_days BETWEEN 1 AND 36500 AND protected_audit_days BETWEEN 1 AND 36500),
  CONSTRAINT ck_party_identity_retention_actions CHECK (
    submission_action IN ('restrict_processing','anonymize','delete')
    AND snapshot_action IN ('restrict_processing','anonymize','delete')
    AND identity_photo_action IN ('restrict_processing','anonymize','delete')
    AND protected_audit_action IN ('retain_restricted','anonymize')),
  CONSTRAINT ck_party_identity_retention_legal_review CHECK (legal_review_status IN ('pending_legal_review','approved'))
);

CREATE TABLE IF NOT EXISTS public.biz_party_identity_retention_assignment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  party_id uuid NOT NULL,
  category varchar(32) NOT NULL,
  object_id uuid NOT NULL,
  retention_until timestamptz,
  expiry_action varchar(32) NOT NULL,
  state varchar(32) NOT NULL,
  source varchar(32) NOT NULL,
  last_receipt_id uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_time timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_party_identity_retention_object UNIQUE (tenant_id, park_id, category, object_id),
  CONSTRAINT fk_party_identity_retention_party FOREIGN KEY (tenant_id, park_id, party_id)
    REFERENCES public.biz_party(tenant_id, park_id, id) ON DELETE RESTRICT,
  CONSTRAINT ck_party_identity_retention_category CHECK (category IN ('submission','snapshot','identity_photo','protected_audit')),
  CONSTRAINT ck_party_identity_retention_action CHECK (expiry_action IN ('restrict_processing','retain_restricted','anonymize','delete')),
  CONSTRAINT ck_party_identity_retention_state CHECK (state IN ('pending_classification','active','due','held','processing_restricted','completed','failed')),
  CONSTRAINT ck_party_identity_retention_source CHECK (source IN ('policy','legacy_unknown')),
  CONSTRAINT ck_party_identity_retention_legacy CHECK (
    source<>'legacy_unknown'
    OR (state='pending_classification' AND retention_until IS NULL)
    OR (state IN ('active','due','held','processing_restricted','completed','failed')
        AND retention_until IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_party_identity_retention_due
  ON public.biz_party_identity_retention_assignment(tenant_id, park_id, retention_until)
  WHERE state IN ('active','due');

CREATE TABLE IF NOT EXISTS public.biz_party_data_governance_action_receipt (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
  request_key varchar(128) NOT NULL, action varchar(64) NOT NULL,
  target_id uuid NOT NULL, request_hash varchar(64) NOT NULL, result_json jsonb NOT NULL,
  actor_id uuid NOT NULL, create_time timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_party_data_governance_action_request UNIQUE (tenant_id,park_id,request_key)
);

INSERT INTO public.biz_party_identity_retention_assignment(
  tenant_id,park_id,party_id,category,object_id,expiry_action,state,source
)
SELECT submission.tenant_id,submission.park_id,submission.party_id,'submission',submission.id,
       'restrict_processing','pending_classification','legacy_unknown'
FROM public.biz_party_identity_submission submission
ON CONFLICT(tenant_id,park_id,category,object_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.fn_party_identity_assign_retention()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE category_name varchar(32); days_value integer; action_value varchar(32); party_value uuid;
BEGIN
  category_name := TG_ARGV[0];
  IF category_name='submission' THEN party_value:=NEW.party_id;
  ELSIF category_name='snapshot' THEN party_value:=NEW.party_id;
  ELSE RETURN NEW;
  END IF;
  INSERT INTO public.biz_party_identity_retention_policy(tenant_id,park_id)
    VALUES(NEW.tenant_id,NEW.park_id) ON CONFLICT(tenant_id,park_id) DO NOTHING;
  SELECT CASE category_name WHEN 'submission' THEN submission_days ELSE snapshot_days END,
         CASE category_name WHEN 'submission' THEN submission_action ELSE snapshot_action END
    INTO days_value,action_value FROM public.biz_party_identity_retention_policy
   WHERE tenant_id=NEW.tenant_id AND park_id=NEW.park_id;
  INSERT INTO public.biz_party_identity_retention_assignment(
    tenant_id,park_id,party_id,category,object_id,retention_until,expiry_action,state,source)
  VALUES(NEW.tenant_id,NEW.park_id,party_value,category_name,NEW.id,
    COALESCE(NEW.create_time,now()) + make_interval(days=>days_value),action_value,'active','policy')
  ON CONFLICT(tenant_id,park_id,category,object_id) DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_party_identity_submission_retention ON public.biz_party_identity_submission;
CREATE TRIGGER trg_party_identity_submission_retention AFTER INSERT ON public.biz_party_identity_submission
FOR EACH ROW EXECUTE FUNCTION public.fn_party_identity_assign_retention('submission');
DROP TRIGGER IF EXISTS trg_party_identity_snapshot_retention ON public.biz_party_identity_snapshot;
CREATE TRIGGER trg_party_identity_snapshot_retention AFTER INSERT ON public.biz_party_identity_snapshot
FOR EACH ROW EXECUTE FUNCTION public.fn_party_identity_assign_retention('snapshot');

CREATE OR REPLACE FUNCTION public.fn_party_identity_photo_assign_retention()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE party_value uuid; days_value integer; action_value varchar(32); object_time timestamptz;
BEGIN
  IF TG_TABLE_NAME='rel_party_identity_draft_file' THEN
    SELECT party_id INTO party_value FROM public.biz_party_identity_submission
      WHERE tenant_id=NEW.tenant_id AND park_id=NEW.park_id AND id=NEW.submission_id;
  ELSE
    SELECT party_id INTO party_value FROM public.biz_party_identity_snapshot
      WHERE tenant_id=NEW.tenant_id AND park_id=NEW.park_id AND id=NEW.snapshot_id;
  END IF;
  SELECT create_time INTO object_time FROM public.sys_file
    WHERE tenant_id=NEW.tenant_id AND park_id=NEW.park_id AND id=NEW.file_id;
  INSERT INTO public.biz_party_identity_retention_policy(tenant_id,park_id)
    VALUES(NEW.tenant_id,NEW.park_id) ON CONFLICT(tenant_id,park_id) DO NOTHING;
  SELECT identity_photo_days,identity_photo_action INTO days_value,action_value
    FROM public.biz_party_identity_retention_policy
    WHERE tenant_id=NEW.tenant_id AND park_id=NEW.park_id;
  INSERT INTO public.biz_party_identity_retention_assignment(
    tenant_id,park_id,party_id,category,object_id,retention_until,expiry_action,state,source)
  VALUES(NEW.tenant_id,NEW.park_id,party_value,'identity_photo',NEW.file_id,
    COALESCE(object_time,now())+make_interval(days=>days_value),action_value,'active','policy')
  ON CONFLICT(tenant_id,park_id,category,object_id) DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_party_identity_draft_file_retention ON public.rel_party_identity_draft_file;
CREATE TRIGGER trg_party_identity_draft_file_retention AFTER INSERT ON public.rel_party_identity_draft_file
FOR EACH ROW EXECUTE FUNCTION public.fn_party_identity_photo_assign_retention();
DROP TRIGGER IF EXISTS trg_party_identity_snapshot_file_retention ON public.rel_party_identity_snapshot_file;
CREATE TRIGGER trg_party_identity_snapshot_file_retention AFTER INSERT ON public.rel_party_identity_snapshot_file
FOR EACH ROW EXECUTE FUNCTION public.fn_party_identity_photo_assign_retention();

INSERT INTO public.biz_party_identity_retention_assignment(
  tenant_id,park_id,party_id,category,object_id,expiry_action,state,source
)
SELECT snapshot.tenant_id,snapshot.park_id,snapshot.party_id,'snapshot',snapshot.id,
       'restrict_processing','pending_classification','legacy_unknown'
FROM public.biz_party_identity_snapshot snapshot
ON CONFLICT(tenant_id,park_id,category,object_id) DO NOTHING;

INSERT INTO public.biz_party_identity_retention_assignment(
  tenant_id,park_id,party_id,category,object_id,expiry_action,state,source
)
SELECT audit.tenant_id,audit.park_id,audit.party_id,'protected_audit',audit.object_id,
       'retain_restricted','pending_classification','legacy_unknown'
FROM (
  SELECT assignment.tenant_id,assignment.park_id,assignment.party_id,assignment.id AS object_id
  FROM public.biz_party_identity_assignment_audit assignment
  UNION ALL
  SELECT decision.tenant_id,decision.park_id,decision.party_id,decision.id
  FROM public.biz_party_identity_decision decision
  UNION ALL
  SELECT op.tenant_id::text,op.park_id::text,submission.party_id,op.id
  FROM public.sys_op_log op
  JOIN public.biz_party_identity_submission submission
    ON submission.tenant_id=op.tenant_id::text AND submission.park_id=op.park_id::text
   AND op.biz_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   AND submission.id=op.biz_id::uuid
  WHERE op.biz_type='party_identity_submission'
) audit
ON CONFLICT(tenant_id,park_id,category,object_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.fn_party_identity_protected_audit_assign_retention()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE party_value uuid; object_time timestamptz; days_value integer; action_value varchar(32);
BEGIN
  IF TG_TABLE_NAME='biz_party_identity_assignment_audit' THEN
    party_value:=NEW.party_id; object_time:=NEW.occurred_at;
  ELSIF TG_TABLE_NAME='biz_party_identity_decision' THEN
    party_value:=NEW.party_id; object_time:=NEW.create_time;
  ELSIF NEW.biz_type='party_identity_submission'
        AND NEW.biz_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    SELECT party_id INTO party_value FROM public.biz_party_identity_submission
      WHERE tenant_id=NEW.tenant_id::text AND park_id=NEW.park_id::text AND id=NEW.biz_id::uuid;
    object_time:=NEW.create_time;
  ELSE
    RETURN NEW;
  END IF;
  IF party_value IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.biz_party_identity_retention_policy(tenant_id,park_id)
    VALUES(NEW.tenant_id::text,NEW.park_id::text) ON CONFLICT(tenant_id,park_id) DO NOTHING;
  SELECT protected_audit_days,protected_audit_action INTO days_value,action_value
  FROM public.biz_party_identity_retention_policy
  WHERE tenant_id=NEW.tenant_id::text AND park_id=NEW.park_id::text;
  INSERT INTO public.biz_party_identity_retention_assignment(
    tenant_id,park_id,party_id,category,object_id,retention_until,expiry_action,state,source)
  VALUES(NEW.tenant_id::text,NEW.park_id::text,party_value,'protected_audit',NEW.id,
    COALESCE(object_time,now())+make_interval(days=>days_value),action_value,'active','policy')
  ON CONFLICT(tenant_id,park_id,category,object_id) DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_party_identity_assignment_audit_retention ON public.biz_party_identity_assignment_audit;
CREATE TRIGGER trg_party_identity_assignment_audit_retention AFTER INSERT ON public.biz_party_identity_assignment_audit
FOR EACH ROW EXECUTE FUNCTION public.fn_party_identity_protected_audit_assign_retention();
DROP TRIGGER IF EXISTS trg_party_identity_decision_retention ON public.biz_party_identity_decision;
CREATE TRIGGER trg_party_identity_decision_retention AFTER INSERT ON public.biz_party_identity_decision
FOR EACH ROW EXECUTE FUNCTION public.fn_party_identity_protected_audit_assign_retention();
DROP TRIGGER IF EXISTS trg_party_identity_op_log_retention ON public.sys_op_log;
CREATE TRIGGER trg_party_identity_op_log_retention AFTER INSERT ON public.sys_op_log
FOR EACH ROW EXECUTE FUNCTION public.fn_party_identity_protected_audit_assign_retention();

INSERT INTO public.biz_party_identity_retention_assignment(
  tenant_id,park_id,party_id,category,object_id,expiry_action,state,source
)
SELECT DISTINCT file_scope.tenant_id,file_scope.park_id,file_scope.party_id,
       'identity_photo',file_scope.file_id,'restrict_processing','pending_classification','legacy_unknown'
FROM (
  SELECT relation.tenant_id,relation.park_id,submission.party_id,relation.file_id
  FROM public.rel_party_identity_draft_file relation
  JOIN public.biz_party_identity_submission submission
    ON submission.tenant_id=relation.tenant_id AND submission.park_id=relation.park_id
   AND submission.id=relation.submission_id
  UNION
  SELECT relation.tenant_id,relation.park_id,snapshot.party_id,relation.file_id
  FROM public.rel_party_identity_snapshot_file relation
  JOIN public.biz_party_identity_snapshot snapshot
    ON snapshot.tenant_id=relation.tenant_id AND snapshot.park_id=relation.park_id
   AND snapshot.id=relation.snapshot_id
) file_scope
ON CONFLICT(tenant_id,park_id,category,object_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.biz_party_identity_legal_hold (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
  party_id uuid NOT NULL, category varchar(32), object_id uuid,
  reason_code varchar(64) NOT NULL, status varchar(16) NOT NULL DEFAULT 'active',
  started_at timestamptz NOT NULL DEFAULT now(), started_by uuid NOT NULL,
  released_at timestamptz, released_by uuid, release_reason_code varchar(64), request_key varchar(128) NOT NULL,
  CONSTRAINT uq_party_identity_legal_hold_request UNIQUE (tenant_id, park_id, request_key),
  CONSTRAINT fk_party_identity_legal_hold_party FOREIGN KEY (tenant_id, park_id, party_id)
    REFERENCES public.biz_party(tenant_id, park_id, id) ON DELETE RESTRICT,
  CONSTRAINT ck_party_identity_legal_hold_status CHECK (status IN ('active','released')),
  CONSTRAINT ck_party_identity_legal_hold_release CHECK (
    (status='active' AND released_at IS NULL AND released_by IS NULL AND release_reason_code IS NULL)
    OR (status='released' AND released_at IS NOT NULL AND released_by IS NOT NULL AND release_reason_code IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_party_identity_legal_hold_active
  ON public.biz_party_identity_legal_hold(tenant_id, park_id, party_id)
  WHERE status='active';

ALTER TABLE public.biz_party_identity_legal_hold
  ADD COLUMN IF NOT EXISTS release_request_key varchar(128);
CREATE UNIQUE INDEX IF NOT EXISTS uq_party_identity_legal_hold_release_request
  ON public.biz_party_identity_legal_hold(tenant_id,park_id,release_request_key)
  WHERE release_request_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.biz_party_data_subject_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
  party_id uuid NOT NULL, request_type varchar(32) NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'submitted', outcome varchar(32),
  reason_code varchar(64) NOT NULL, channel varchar(32) NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(), requested_by uuid NOT NULL,
  decided_at timestamptz, decided_by uuid, completed_at timestamptz, completed_by uuid,
  decision_code varchar(64), request_key varchar(128) NOT NULL, request_hash varchar(64) NOT NULL,
  decision_request_key varchar(128),
  create_time timestamptz NOT NULL DEFAULT now(), update_time timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_party_data_subject_request_key UNIQUE (tenant_id, park_id, request_key),
  CONSTRAINT uq_party_data_subject_request_scope_id UNIQUE (tenant_id, park_id, id),
  CONSTRAINT fk_party_data_subject_request_party FOREIGN KEY (tenant_id, park_id, party_id)
    REFERENCES public.biz_party(tenant_id, park_id, id) ON DELETE RESTRICT,
  CONSTRAINT ck_party_data_subject_request_type CHECK (request_type IN ('erasure','restrict_processing')),
  CONSTRAINT ck_party_data_subject_request_status CHECK (status IN ('submitted','approved','rejected','completed')),
  CONSTRAINT ck_party_data_subject_request_outcome CHECK (outcome IS NULL OR outcome IN ('deleted','processing_restricted','rejected')),
  CONSTRAINT ck_party_data_subject_request_channel CHECK (channel IN ('in_person','web','mobile','paper'))
);
CREATE INDEX IF NOT EXISTS idx_party_data_subject_request_party
  ON public.biz_party_data_subject_request(tenant_id, park_id, party_id, requested_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_party_data_subject_decision_request
  ON public.biz_party_data_subject_request(tenant_id,park_id,decision_request_key)
  WHERE decision_request_key IS NOT NULL;

ALTER TABLE public.biz_party
  ADD CONSTRAINT fk_biz_party_processing_restriction_request
  FOREIGN KEY (tenant_id, park_id, processing_restriction_request_id)
  REFERENCES public.biz_party_data_subject_request(tenant_id, park_id, id) ON DELETE RESTRICT;

INSERT INTO public.sys_permission(
  id,tenant_id,park_id,code,name,parent_id,resource,action,permission_path,perm_path,
  permission_level,level,sort_no,permission_type,perm_type,api_method,api_path,frontend_route,
  component_key,icon,field_key,data_dimension,is_system,is_builtin,is_tenant_custom,visible,
  keep_alive,always_show,is_enabled,status,create_time,update_time,is_deleted,version,remark)
SELECT gen_random_uuid(),base.tenant_id,base.park_id,definition.code,definition.name,NULL,
  definition.resource,'manage',definition.code,definition.code,3,3,definition.sort_no,
  'api',40,NULL,NULL,'/assets/identity-submissions',NULL,NULL,NULL,NULL,true,true,false,true,
  false,false,true,'enabled',now(),now(),false,1,'IDY-F02/F03 independent governance permission'
FROM public.sys_permission base
CROSS JOIN (VALUES
 ('party:consent_manage','同意事实管理','biz.party_consent',8150),
 ('party:subject_rights_manage','数据主体权利管理','biz.party_subject_rights',8151),
 ('party:retention_manage','身份数据留存管理','biz.party_retention',8152),
 ('party:legal_hold_manage','身份数据法律保全管理','biz.party_legal_hold',8153)
) definition(code,name,resource,sort_no)
WHERE base.code='party:identity_update' AND base.is_deleted=false
ON CONFLICT(tenant_id,code) WHERE is_deleted=false DO NOTHING;

COMMIT;
