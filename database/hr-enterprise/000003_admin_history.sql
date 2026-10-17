BEGIN;
CREATE TABLE sys_hr_enterprise_action(
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),tenant_id varchar(64) NOT NULL,scope_key varchar(64) NOT NULL,
 target_id uuid NOT NULL,target_type text NOT NULL CHECK(target_type IN('enterprise_member','enterprise_role')),
 actor_id uuid NOT NULL,action text NOT NULL,reason varchar(1000) NOT NULL CHECK(length(btrim(reason))>=2),version integer NOT NULL CHECK(version>=1),created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 FOREIGN KEY(tenant_id,scope_key) REFERENCES sys_business_scope(tenant_id,scope_key),FOREIGN KEY(actor_id,tenant_id) REFERENCES sys_user(id,tenant_id)
);
CREATE INDEX ix_hr_enterprise_action_target ON sys_hr_enterprise_action(tenant_id,scope_key,target_id,created_at DESC,id);
CREATE FUNCTION hr_enterprise_action_immutable() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$BEGIN RAISE EXCEPTION 'ENTERPRISE_ACTION_IMMUTABLE';END$$;
CREATE TRIGGER trg_hr_enterprise_action_immutable BEFORE UPDATE OR DELETE ON sys_hr_enterprise_action FOR EACH ROW EXECUTE FUNCTION hr_enterprise_action_immutable();
COMMIT;
