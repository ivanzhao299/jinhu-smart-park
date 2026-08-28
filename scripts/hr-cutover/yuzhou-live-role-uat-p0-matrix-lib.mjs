import { createHash } from "node:crypto";

export class YuzhouLiveRoleUatP0MatrixError extends Error {
  constructor(code, detail) { super(`${code}: ${detail}`); this.code = code; }
}
const fail=(code,detail)=>{throw new YuzhouLiveRoleUatP0MatrixError(code,detail);};
const actors=new Set(["hr_reviewer","manager","employee"]), methods=new Set(["GET","POST"]), outcomes=new Set(["success","forbidden","not_found_or_forbidden","server_failure"]), kinds=new Set(["json","binary"]);
const routePattern=/^\/(?:hr|files)(?:\/(?:[a-z0-9-]+|\{[a-zA-Z][a-zA-Z0-9]*\}))+$/u;
const assertionPattern=/^[a-z][a-z0-9_]{2,63}$/u;
const expectedIds=Object.freeze([
  "approval_park_pending","approval_team_pending","approval_self_review_denied","approval_cross_tree_review_hidden",
  "profile_full_projection","profile_team_projection","profile_self_projection","profile_cross_tree_hidden",
  "contract_salary_full","contract_salary_team_masked","contract_reminder_park_run","contract_reminder_team_read","contract_reminder_self_read","contract_reminder_ack","contract_reminder_resolve","contract_reminder_cancel","contract_reminder_cross_tree_hidden",
  "insurance_amount_park","insurance_amount_team_masked","payroll_detail_atom","payroll_detail_manager_denied",
  "contract_document_download","contract_document_cross_tree_hidden","contract_document_audit_failure","contract_document_storage_failure"
]);
const expectedMatrixSha256="94a0c7c5e63308bd3efe4e44c96bfa1c4d7b72166597bdb7538276a7b9f02576";
const stable=value=>`${JSON.stringify(value,null,2)}\n`;
export const p0MatrixHash=matrix=>createHash("sha256").update(stable(matrix)).digest("hex");

export function validateYuzhouLiveRoleUatP0Matrix(matrix){
  if(matrix?.formatVersion!==1||matrix?.contractKind!=="yuzhou_hr_live_role_uat_p0_matrix")fail("YUZHOU_UAT_P0_MATRIX_INVALID","identity");
  if(matrix.executionBoundary!=="isolated_lab_only"||matrix.productionImport!=="HOLD")fail("YUZHOU_UAT_P0_MATRIX_UNSAFE","boundary");
  if(JSON.stringify(matrix.viewports)!==JSON.stringify([{id:"desktop",width:1440,height:1000},{id:"phone_390",width:390,height:844}]))fail("YUZHOU_UAT_P0_MATRIX_VIEWPORT_DRIFT","exact viewports");
  if(!Array.isArray(matrix.checks)||JSON.stringify(matrix.checks.map(x=>x.id))!==JSON.stringify(expectedIds))fail("YUZHOU_UAT_P0_MATRIX_COVERAGE_DRIFT","exact stable check order required");
  for(const check of matrix.checks){
    const keys=["actor","assertions","id","method","outcome","responseKind","route",...(check.supportRoutes?["supportRoutes"]:[])].sort();
    if(JSON.stringify(Object.keys(check).sort())!==JSON.stringify(keys))fail("YUZHOU_UAT_P0_MATRIX_SHAPE_INVALID",check.id);
    if(!actors.has(check.actor)||!methods.has(check.method)||!outcomes.has(check.outcome)||!kinds.has(check.responseKind)||!routePattern.test(check.route)||check.route.includes(".."))fail("YUZHOU_UAT_P0_MATRIX_CHECK_INVALID",check.id);
    if(check.responseKind==="binary"&&!/^\/files\/\{[a-zA-Z][a-zA-Z0-9]*\}\/download$/u.test(check.route))fail("YUZHOU_UAT_P0_MATRIX_BINARY_ROUTE_INVALID",check.id);
    if(!Array.isArray(check.assertions)||check.assertions.length<2||new Set(check.assertions).size!==check.assertions.length||check.assertions.some(x=>!assertionPattern.test(x)))fail("YUZHOU_UAT_P0_MATRIX_ASSERTION_INVALID",check.id);
    if(check.supportRoutes&&(!Array.isArray(check.supportRoutes)||check.supportRoutes.length>3||check.supportRoutes.some(route=>route.method!=="GET"||!routePattern.test(route.route)||!outcomes.has(route.outcome)||route.responseKind!=="json")))fail("YUZHOU_UAT_P0_MATRIX_SUPPORT_INVALID",check.id);
    if(check.outcome!=="success"&&!check.assertions.some(x=>/^(?:no_|zero_)/u.test(x)))fail("YUZHOU_UAT_P0_MATRIX_NEGATIVE_PROOF_MISSING",check.id);
  }
  const sha256=p0MatrixHash(matrix);
  if(sha256!==expectedMatrixSha256)fail("YUZHOU_UAT_P0_MATRIX_HASH_DRIFT",sha256);
  return {status:"PASS",checkCount:matrix.checks.length,sha256,productionImport:"HOLD"};
}

export const YUZHOU_LIVE_ROLE_UAT_P0_EXPECTED_IDS=expectedIds;
