BEGIN;

-- Existing version/child/cycle/response/result guards remain unchanged.
-- Permit only a scoped existing version pointer and its update metadata.
CREATE OR REPLACE FUNCTION hr_feedback360_model_root_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.status<>'draft' THEN RAISE EXCEPTION 'published competency root is immutable'; END IF;
  RETURN OLD;
 END IF;
 IF (to_jsonb(NEW)-ARRAY['status','current_version_no','update_by','update_time']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['status','current_version_no','update_by','update_time']) THEN
  RAISE EXCEPTION 'competency model identity is immutable';
 END IF;
 IF OLD.status='retired' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'retired competency model is immutable'; END IF;
 IF (OLD.status='published' AND NEW.status<>'published') OR
    (OLD.status='draft' AND NEW.status NOT IN('draft','published')) THEN RAISE EXCEPTION 'invalid competency root transition'; END IF;
 IF NEW.current_version_no<OLD.current_version_no OR NEW.current_version_no<1 THEN RAISE EXCEPTION 'competency version pointer cannot regress'; END IF;
 IF NOT EXISTS(SELECT 1 FROM hr_competency_model_version v WHERE
    (v.model_id,v.tenant_id,v.park_id,v.version_no)=(NEW.id,NEW.tenant_id,NEW.park_id,NEW.current_version_no)) THEN
  RAISE EXCEPTION 'competency version pointer must reference its scoped version';
 END IF;
 IF OLD.status='draft' AND NEW.status='published' AND NOT EXISTS(SELECT 1 FROM hr_competency_model_version v WHERE
    (v.model_id,v.tenant_id,v.park_id,v.version_no)=(NEW.id,NEW.tenant_id,NEW.park_id,NEW.current_version_no) AND v.status='published') THEN
  RAISE EXCEPTION 'published competency version required';
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION hr_feedback360_questionnaire_root_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.status<>'draft' THEN RAISE EXCEPTION 'published questionnaire root is immutable'; END IF;
  RETURN OLD;
 END IF;
 IF (to_jsonb(NEW)-ARRAY['status','current_version_no','update_by','update_time']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['status','current_version_no','update_by','update_time']) THEN
  RAISE EXCEPTION 'questionnaire identity is immutable';
 END IF;
 IF OLD.status='retired' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'retired questionnaire is immutable'; END IF;
 IF (OLD.status='published' AND NEW.status<>'published') OR
    (OLD.status='draft' AND NEW.status NOT IN('draft','published')) THEN RAISE EXCEPTION 'invalid questionnaire root transition'; END IF;
 IF NEW.current_version_no<OLD.current_version_no OR NEW.current_version_no<1 THEN RAISE EXCEPTION 'questionnaire version pointer cannot regress'; END IF;
 IF NOT EXISTS(SELECT 1 FROM hr_feedback_questionnaire_version v WHERE
    (v.questionnaire_id,v.tenant_id,v.park_id,v.version_no)=(NEW.id,NEW.tenant_id,NEW.park_id,NEW.current_version_no)) THEN
  RAISE EXCEPTION 'questionnaire version pointer must reference its scoped version';
 END IF;
 IF OLD.status='draft' AND NEW.status='published' AND NOT EXISTS(SELECT 1 FROM hr_feedback_questionnaire_version v WHERE
    (v.questionnaire_id,v.tenant_id,v.park_id,v.version_no)=(NEW.id,NEW.tenant_id,NEW.park_id,NEW.current_version_no) AND v.status='published') THEN
  RAISE EXCEPTION 'published questionnaire version required';
 END IF;
 RETURN NEW;
END $$;

COMMIT;
