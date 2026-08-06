export const FAILURE_INJECTION_CASES_V10 = Object.freeze([
  { name: "before-create", boundary: "before-create", prefix: "",
    assertion: "SELECT public.fn_assert_b2c_000197_before_create();" },
  { name: "after-create", boundary: "after-create", prefix: `
    CREATE UNIQUE INDEX uq_biz_property_approval_request_active_source_v2_build
      ON public.biz_property_approval_request(tenant_id,park_id,source_domain,source_id,action)
      WHERE decision_status IN ('draft','submitted','pending_approval') OR
        (decision_status='approved' AND execution_status IN ('not_started','executing','retry_wait','infra_exhausted'));`,
    assertion: "SELECT public.fn_assert_b2c_000197_after_create();" },
  { name: "after-drop", boundary: "after-drop", prefix: `
    CREATE UNIQUE INDEX uq_biz_property_approval_request_active_source_v2_build
      ON public.biz_property_approval_request(tenant_id,park_id,source_domain,source_id,action)
      WHERE decision_status IN ('draft','submitted','pending_approval') OR
        (decision_status='approved' AND execution_status IN ('not_started','executing','retry_wait','infra_exhausted'));
    DROP INDEX public.uq_biz_property_approval_request_active_source;`,
    assertion: "SELECT public.fn_assert_b2c_000197_after_drop();" },
  { name: "before-rename", boundary: "before-rename", prefix: `
    CREATE UNIQUE INDEX uq_biz_property_approval_request_active_source_v2_build
      ON public.biz_property_approval_request(tenant_id,park_id,source_domain,source_id,action)
      WHERE decision_status IN ('draft','submitted','pending_approval') OR
        (decision_status='approved' AND execution_status IN ('not_started','executing','retry_wait','infra_exhausted'));
    DROP INDEX public.uq_biz_property_approval_request_active_source;`,
    assertion: `DO $assert$ BEGIN
      IF to_regclass('public.uq_biz_property_approval_request_active_source') IS NOT NULL
        OR to_regclass('public.uq_biz_property_approval_request_active_source_v2_build') IS NULL
      THEN RAISE EXCEPTION 'before rename catalog mismatch'; END IF;
    END $assert$;` },
]);

export function failureInjectionCasesV10() {
  return FAILURE_INJECTION_CASES_V10.map((entry) => ({ ...entry }));
}
