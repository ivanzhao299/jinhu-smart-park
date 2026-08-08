import {
  assertEquivalentCreateIndexV11,
  formalApprovalActiveIndexContractV11,
} from "./track-b2c-000197-index-contract-v11.mjs";

export const FAILURE_INDEX_CONTRACT_V11 = formalApprovalActiveIndexContractV11();
const createBuild = FAILURE_INDEX_CONTRACT_V11.createSql;
assertEquivalentCreateIndexV11(FAILURE_INDEX_CONTRACT_V11, createBuild);
const OLD_INDEX = FAILURE_INDEX_CONTRACT_V11.oldIndexdefSha;
const OLD_PREDICATE = FAILURE_INDEX_CONTRACT_V11.oldPredicateSha;
const NEW_INDEX = FAILURE_INDEX_CONTRACT_V11.newIndexdefSha;
const NEW_PREDICATE = FAILURE_INDEX_CONTRACT_V11.newPredicateSha;

function inlineCatalogAssertion({ oldPresent, buildPresent }) {
  const oldCheck = oldPresent ? `
    IF to_regclass('public.uq_biz_property_approval_request_active_source') IS NULL THEN
      RAISE EXCEPTION 'old index missing';
    END IF;
    SELECT encode(public.digest(convert_to(pg_get_indexdef(i.indexrelid),'UTF8'),'sha256'),'hex'),
      encode(public.digest(convert_to(pg_get_expr(i.indpred,i.indrelid,false),'UTF8'),'sha256'),'hex')
      INTO actual_index,actual_predicate FROM pg_index i
      WHERE i.indexrelid='public.uq_biz_property_approval_request_active_source'::regclass;
    IF actual_index<>'${OLD_INDEX}' OR actual_predicate<>'${OLD_PREDICATE}' THEN
      RAISE EXCEPTION 'old catalog drift';
    END IF;` : `
    IF to_regclass('public.uq_biz_property_approval_request_active_source') IS NOT NULL THEN
      RAISE EXCEPTION 'old index still present';
    END IF;`;
  const buildCheck = buildPresent ? `
    IF to_regclass('public.uq_biz_property_approval_request_active_source_v2_build') IS NULL THEN
      RAISE EXCEPTION 'build index missing';
    END IF;
    SELECT encode(public.digest(convert_to(pg_get_indexdef(i.indexrelid),'UTF8'),'sha256'),'hex'),
      encode(public.digest(convert_to(pg_get_expr(i.indpred,i.indrelid,false),'UTF8'),'sha256'),'hex')
      INTO actual_index,actual_predicate FROM pg_index i
      WHERE i.indexrelid='public.uq_biz_property_approval_request_active_source_v2_build'::regclass;
    IF actual_index<>'${NEW_INDEX}' OR actual_predicate<>'${NEW_PREDICATE}' THEN
      RAISE EXCEPTION 'build catalog drift';
    END IF;` : `
    IF to_regclass('public.uq_biz_property_approval_request_active_source_v2_build') IS NOT NULL THEN
      RAISE EXCEPTION 'unexpected build index';
    END IF;`;
  return `DO $assert$ DECLARE actual_index text; actual_predicate text; BEGIN${oldCheck}${buildCheck}
  END $assert$;`;
}

export const FAILURE_INJECTION_CASES_V11 = Object.freeze([
  { name: "before-create", boundary: "before-create", prefix: "",
    assertion: inlineCatalogAssertion({ oldPresent: true, buildPresent: false }), marker: "v11-injected-before-create" },
  { name: "after-create", boundary: "after-create", prefix: createBuild,
    assertion: inlineCatalogAssertion({ oldPresent: true, buildPresent: true }), marker: "v11-injected-after-create" },
  { name: "after-drop", boundary: "after-drop", prefix: `${createBuild}
    DROP INDEX public.uq_biz_property_approval_request_active_source;`,
    assertion: inlineCatalogAssertion({ oldPresent: false, buildPresent: true }), marker: "v11-injected-after-drop" },
  { name: "before-rename", boundary: "before-rename", prefix: `${createBuild}
    DROP INDEX public.uq_biz_property_approval_request_active_source;`,
    assertion: inlineCatalogAssertion({ oldPresent: false, buildPresent: true }), marker: "v11-injected-before-rename" },
]);

export function failureInjectionCasesV11() {
  return FAILURE_INJECTION_CASES_V11.map((entry) => ({ ...entry }));
}

export function renderFailureBoundarySqlV11({ prefix, assertion, marker }) {
  if (!/^v11-injected-[a-z-]+$/u.test(marker)) throw new Error("b2c-000197-v11-fault-marker");
  return `BEGIN; LOCK TABLE public.biz_property_approval_request
    IN SHARE MODE; ${prefix} ${assertion} DO $fault$ BEGIN RAISE EXCEPTION '${marker}' USING ERRCODE='P0001'; END $fault$;`;
}
