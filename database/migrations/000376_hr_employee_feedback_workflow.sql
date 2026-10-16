BEGIN;
CREATE TABLE hr_employee_feedback (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,employee_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN('suggestion','complaint')),title varchar(120) NOT NULL CHECK(length(btrim(title,E' \t\n\r\f\v'||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279)))>0),content varchar(4000) NOT NULL CHECK(length(btrim(content,E' \t\n\r\f\v'||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279)))>0),reply varchar(4000),status text NOT NULL CHECK(status IN('draft','submitted','answered','withdrawn','cancelled')),version integer NOT NULL CHECK(version>0),
 current_action_id uuid NOT NULL,created_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),updated_by uuid NOT NULL,updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 UNIQUE(id,tenant_id,park_id),FOREIGN KEY(employee_id,tenant_id,park_id) REFERENCES hr_employee(id,tenant_id,park_id),
 FOREIGN KEY(created_by) REFERENCES sys_user(id),FOREIGN KEY(updated_by) REFERENCES sys_user(id),
 CHECK((status='answered' AND reply IS NOT NULL AND length(btrim(reply,E' \t\n\r\f\v'||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279)))>0) OR(status<>'answered' AND reply IS NULL))
);
CREATE TABLE hr_employee_feedback_action (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(64) NOT NULL,park_id varchar(64) NOT NULL,feedback_id uuid NOT NULL,version_no integer NOT NULL,previous_action_id uuid,
 action text NOT NULL CHECK(action IN('create','edit','submit','cancel','withdraw','reply')),from_status text,to_status text NOT NULL,reason varchar(1000) NOT NULL CHECK(length(btrim(reason,E' \t\n\r\f\v'||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279))) BETWEEN 2 AND 1000),snapshot jsonb NOT NULL,actor_user_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 UNIQUE(id,tenant_id,park_id,feedback_id),UNIQUE(tenant_id,park_id,feedback_id,version_no),UNIQUE(previous_action_id),
 FOREIGN KEY(feedback_id,tenant_id,park_id) REFERENCES hr_employee_feedback(id,tenant_id,park_id),
 FOREIGN KEY(previous_action_id,tenant_id,park_id,feedback_id) REFERENCES hr_employee_feedback_action(id,tenant_id,park_id,feedback_id),
 FOREIGN KEY(actor_user_id) REFERENCES sys_user(id)
);
ALTER TABLE hr_employee_feedback ADD FOREIGN KEY(current_action_id,tenant_id,park_id,id) REFERENCES hr_employee_feedback_action(id,tenant_id,park_id,feedback_id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ix_hr_employee_feedback_self ON hr_employee_feedback(tenant_id,park_id,employee_id,created_at DESC,id);
CREATE INDEX ix_hr_employee_feedback_queue ON hr_employee_feedback(tenant_id,park_id,status,created_at DESC,id);
-- Reuse the existing selected-park RBAC evaluator; it accepts an arbitrary permission code.
CREATE FUNCTION hr_employee_feedback_authorized(t varchar,p varchar,u uuid,cap text) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT public.hr_performance_channel_actor_has(t,p,u,'hr:approvals') AND public.hr_performance_channel_actor_has(t,p,u,cap)
$$;
CREATE FUNCTION hr_employee_feedback_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE own boolean;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'EMPLOYEE_FEEDBACK_IMMUTABLE';END IF;
 SELECT EXISTS(SELECT 1 FROM public.hr_employee WHERE(id,tenant_id,park_id,user_id)=(NEW.employee_id,NEW.tenant_id,NEW.park_id,NEW.updated_by) AND NOT is_deleted) INTO own;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'draft' OR NEW.version<>1 OR NEW.reply IS NOT NULL OR NEW.created_by IS DISTINCT FROM NEW.updated_by OR NOT own OR NOT public.hr_employee_feedback_authorized(NEW.tenant_id,NEW.park_id,NEW.updated_by,'hr:approval:self_manage') OR NEW.created_at IS DISTINCT FROM transaction_timestamp() THEN RAISE EXCEPTION 'EMPLOYEE_FEEDBACK_CREATE_INVALID';END IF;
 ELSE
  IF(NEW.id,NEW.tenant_id,NEW.park_id,NEW.employee_id,NEW.created_by,NEW.created_at) IS DISTINCT FROM(OLD.id,OLD.tenant_id,OLD.park_id,OLD.employee_id,OLD.created_by,OLD.created_at) OR NEW.version<>OLD.version+1 OR NEW.current_action_id=OLD.current_action_id OR OLD.status IN('answered','withdrawn','cancelled') THEN RAISE EXCEPTION 'EMPLOYEE_FEEDBACK_VERSION_OR_TERMINAL';END IF;
  IF OLD.status='draft' AND NEW.status='draft' AND(NEW.kind,NEW.title,NEW.content) IS NOT DISTINCT FROM(OLD.kind,OLD.title,OLD.content) THEN RAISE EXCEPTION 'EMPLOYEE_FEEDBACK_UNCHANGED';END IF;
  IF NOT((OLD.status='draft' AND NEW.status IN('draft','submitted','cancelled')) OR(OLD.status='submitted' AND NEW.status IN('withdrawn','answered'))) THEN RAISE EXCEPTION 'EMPLOYEE_FEEDBACK_TRANSITION_INVALID';END IF;
  IF NEW.status='answered' THEN
   IF own OR NEW.updated_by=NEW.created_by OR NOT public.hr_employee_feedback_authorized(NEW.tenant_id,NEW.park_id,NEW.updated_by,'hr:approval:park_review') THEN RAISE EXCEPTION 'EMPLOYEE_FEEDBACK_REPLY_AUTHORITY';END IF;
  ELSIF NOT own OR NOT public.hr_employee_feedback_authorized(NEW.tenant_id,NEW.park_id,NEW.updated_by,'hr:approval:self_manage') THEN RAISE EXCEPTION 'EMPLOYEE_FEEDBACK_OWNER_REQUIRED';END IF;
  IF(NEW.kind,NEW.title,NEW.content) IS DISTINCT FROM(OLD.kind,OLD.title,OLD.content) AND NOT(OLD.status='draft' AND NEW.status='draft') THEN RAISE EXCEPTION 'EMPLOYEE_FEEDBACK_CONTENT_FROZEN';END IF;
 END IF;
 IF NEW.updated_at IS DISTINCT FROM transaction_timestamp() THEN RAISE EXCEPTION 'EMPLOYEE_FEEDBACK_TIME_INVALID';END IF;RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_employee_feedback BEFORE INSERT OR UPDATE OR DELETE ON hr_employee_feedback FOR EACH ROW EXECUTE FUNCTION hr_employee_feedback_guard();
CREATE FUNCTION hr_employee_feedback_action_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE r public.hr_employee_feedback%ROWTYPE;prior public.hr_employee_feedback_action%ROWTYPE;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'EMPLOYEE_FEEDBACK_HISTORY_IMMUTABLE';END IF;
 SELECT * INTO r FROM public.hr_employee_feedback WHERE(id,tenant_id,park_id)=(NEW.feedback_id,NEW.tenant_id,NEW.park_id) FOR UPDATE;
 SELECT * INTO prior FROM public.hr_employee_feedback_action WHERE(id,tenant_id,park_id,feedback_id)=(NEW.previous_action_id,NEW.tenant_id,NEW.park_id,NEW.feedback_id);
 IF r.id IS NULL OR r.current_action_id IS DISTINCT FROM NEW.id OR r.version IS DISTINCT FROM NEW.version_no OR r.updated_by IS DISTINCT FROM NEW.actor_user_id OR r.updated_at IS DISTINCT FROM NEW.created_at OR NEW.created_at IS DISTINCT FROM transaction_timestamp() OR NEW.snapshot IS DISTINCT FROM jsonb_build_object('kind',r.kind,'title',r.title,'content',r.content,'reply',r.reply,'status',r.status) OR NEW.to_status IS DISTINCT FROM r.status THEN RAISE EXCEPTION 'EMPLOYEE_FEEDBACK_HISTORY_INVALID';END IF;
 IF NEW.version_no=1 THEN
  IF NEW.action<>'create' OR NEW.previous_action_id IS NOT NULL OR NEW.from_status IS NOT NULL OR NEW.to_status<>'draft' THEN RAISE EXCEPTION 'EMPLOYEE_FEEDBACK_HISTORY_START_INVALID';END IF;
 ELSE
  IF prior.id IS NULL OR prior.version_no<>NEW.version_no-1 OR NEW.from_status IS DISTINCT FROM prior.to_status OR NEW.action IS DISTINCT FROM (CASE WHEN NEW.to_status='draft' THEN 'edit' WHEN NEW.to_status='submitted' THEN 'submit' WHEN NEW.to_status='cancelled' THEN 'cancel' WHEN NEW.to_status='withdrawn' THEN 'withdraw' WHEN NEW.to_status='answered' THEN 'reply' END) THEN RAISE EXCEPTION 'EMPLOYEE_FEEDBACK_HISTORY_CHAIN_INVALID';END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER trg_hr_employee_feedback_action BEFORE INSERT OR UPDATE OR DELETE ON hr_employee_feedback_action FOR EACH ROW EXECUTE FUNCTION hr_employee_feedback_action_guard();
CREATE FUNCTION hr_employee_feedback_head_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.hr_employee_feedback r JOIN public.hr_employee_feedback_action a ON(a.id,a.tenant_id,a.park_id,a.feedback_id)=(r.current_action_id,r.tenant_id,r.park_id,r.id) WHERE(r.id,r.tenant_id,r.park_id)=(NEW.id,NEW.tenant_id,NEW.park_id) AND a.version_no=r.version AND a.version_no=(SELECT max(version_no) FROM public.hr_employee_feedback_action WHERE(feedback_id,tenant_id,park_id)=(r.id,r.tenant_id,r.park_id))) THEN RAISE EXCEPTION 'EMPLOYEE_FEEDBACK_HEAD_INVALID';END IF;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER trg_hr_employee_feedback_head AFTER INSERT OR UPDATE ON hr_employee_feedback DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hr_employee_feedback_head_guard();
COMMIT;
