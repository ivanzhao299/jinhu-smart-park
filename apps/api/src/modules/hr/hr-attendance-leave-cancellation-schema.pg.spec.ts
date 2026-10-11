import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import test from "node:test";

const enabled = process.env.HR_LEAVE_CANCELLATION_PG === "1";
const database = process.env.POSTGRES_DB ?? "";
const sql = (input: string) => {
  assert.equal(process.env.HR_LEAVE_CANCELLATION_ISOLATED, "yes");
  assert.match(database, /^jinhu_hr_migration_lab_review_lcancel_[A-Za-z0-9_]{6,32}$/u);
  return execFileSync("docker", ["exec", "-i", "jinhu-smart-park-postgres", "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "jinhu", "-d", database], { input, encoding: "utf8", timeout: 10000, stdio: ["pipe", "pipe", "pipe"] }).trim();
};
const rejected = (input: string, expected: RegExp) => {
  try { sql(input); assert.fail("Expected PostgreSQL rejection"); }
  catch (error) { assert.match(String((error as { stderr?: string }).stderr ?? error), expected); }
};
function fixture() {
  const owner = randomUUID(), reviewer = randomUUID(), employee = randomUUID(), originalApproval = randomUUID(), original = randomUUID(), approval = randomUUID(), cancellation = randomUUID();
  sql(`INSERT INTO sys_user(id,tenant_id,park_id,username,display_name,password_hash,status) VALUES
    ('${owner}','10000001','20000001','lc-${owner}','Synthetic','not-a-login-hash','enabled'),
    ('${reviewer}','10000001','20000001','lc-${reviewer}','Synthetic','not-a-login-hash','enabled');
    INSERT INTO hr_employee(id,tenant_id,park_id,employee_code,full_name,user_id,employment_status) VALUES('${employee}','10000001','20000001','LC-${employee}','Synthetic','${owner}','active');
    INSERT INTO hr_approval_request(id,tenant_id,park_id,request_no,request_type,applicant_employee_id,subject_employee_id,title,status)
    VALUES('${originalApproval}','10000001','20000001','ORIG-${original}','attendance_request','${employee}','${employee}','Original','approved'),
    ('${approval}','10000001','20000001','CANCEL-${cancellation}','attendance_request','${employee}','${employee}','Cancellation','draft');
    UPDATE hr_approval_request SET payload=jsonb_build_object('kind','leave_cancellation','sourceRequestId','${original}') WHERE id='${approval}';
    INSERT INTO hr_attendance_request(id,tenant_id,park_id,request_no,employee_id,request_type,start_at,end_at,duration_minutes,reason,status,approval_request_id,reviewed_by,reviewed_at)
    VALUES('${original}','10000001','20000001','ORIG-${original}','${employee}','leave','2026-10-12T09:00:00+08:00','2026-10-12T17:00:00+08:00',480,'Original','approved','${originalApproval}','${reviewer}',now());
    INSERT INTO hr_attendance_leave_cancellation(id,tenant_id,park_id,cancellation_no,employee_id,source_request_id,source_request_version,approval_request_id,start_at,end_at,reason,created_by,updated_by)
    VALUES('${cancellation}','10000001','20000001','LC-${cancellation}','${employee}','${original}',1,'${approval}','2026-10-12T09:00:00+08:00','2026-10-12T11:00:00+08:00','Cancellation','${owner}','${owner}');`);
  return { owner, reviewer, employee, original, approval, cancellation };
}
const history = (id: string, action: string) => `INSERT INTO hr_attendance_leave_cancellation_history(tenant_id,park_id,cancellation_id,employee_id,source_request_id,version,status,start_at,end_at,reason,action,actor_user_id)
 SELECT tenant_id,park_id,id,employee_id,source_request_id,version,status,start_at,end_at,reason,'${action}',updated_by FROM hr_attendance_leave_cancellation WHERE id='${id}';`;

test("schema retains source and immutable history while dedicated transitions keep both projections consistent", { skip: !enabled }, () => {
  const f = fixture(); sql(history(f.cancellation, "create"));
  sql(`BEGIN; UPDATE hr_approval_request SET status='submitted' WHERE id='${f.approval}'; UPDATE hr_attendance_leave_cancellation SET status='submitted',version=2 WHERE id='${f.cancellation}'; ${history(f.cancellation, "submit")} COMMIT;`);
  sql(`BEGIN; UPDATE hr_approval_request SET status='approved' WHERE id='${f.approval}'; UPDATE hr_attendance_leave_cancellation SET status='approved',version=3,updated_by='${f.reviewer}' WHERE id='${f.cancellation}'; ${history(f.cancellation, "approve")} COMMIT;`);
  assert.equal(sql(`SELECT status||':'||version FROM hr_attendance_request WHERE id='${f.original}'`), "approved:1");
  assert.equal(sql(`SELECT string_agg(status,',' ORDER BY version) FROM hr_attendance_leave_cancellation_history WHERE cancellation_id='${f.cancellation}'`), "draft,submitted,approved");
  rejected(`UPDATE hr_attendance_leave_cancellation_history SET reason='overwrite' WHERE cancellation_id='${f.cancellation}'`, /HISTORY_IMMUTABLE/u);
  rejected(`DELETE FROM hr_attendance_leave_cancellation_history WHERE cancellation_id='${f.cancellation}'`, /HISTORY_IMMUTABLE/u);
  rejected(`DELETE FROM hr_attendance_leave_cancellation WHERE id='${f.cancellation}'`, /CANCELLATION_RETAINED/u);
  rejected(`UPDATE hr_attendance_leave_cancellation SET version=4 WHERE id='${f.cancellation}'`, /TRANSITION_INVALID/u);
});

test("generic approval updates and source rewriting cannot commit independently", { skip: !enabled }, () => {
  const f = fixture();
  rejected(`UPDATE hr_approval_request SET status='submitted' WHERE id='${f.approval}'`, /APPROVAL_PROJECTION_DRIFT/u);
  assert.equal(sql(`SELECT status FROM hr_approval_request WHERE id='${f.approval}'`), "draft");
  rejected(`UPDATE hr_attendance_request SET reason='rewrite',version=version+1 WHERE id='${f.original}'`, /SOURCE_RETAINED/u);
  rejected(`UPDATE hr_attendance_leave_cancellation SET source_request_version=2,version=2 WHERE id='${f.cancellation}'`, /SOURCE_INVALID/u);
  rejected(`UPDATE hr_attendance_leave_cancellation SET start_at='2026-10-12T08:00:00+08:00',version=2 WHERE id='${f.cancellation}'`, /SOURCE_INVALID/u);
  rejected(`UPDATE hr_attendance_leave_cancellation SET park_id='foreign',version=2 WHERE id='${f.cancellation}'`, /SOURCE_INVALID/u);
});

test("self-approval and stale versions roll back without changing the submitted request", { skip: !enabled }, () => {
  const f = fixture();
  sql(`BEGIN; UPDATE hr_approval_request SET status='submitted' WHERE id='${f.approval}'; UPDATE hr_attendance_leave_cancellation SET status='submitted',version=2 WHERE id='${f.cancellation}'; COMMIT;`);
  rejected(`BEGIN; UPDATE hr_approval_request SET status='approved' WHERE id='${f.approval}'; UPDATE hr_attendance_leave_cancellation SET status='approved',version=3,updated_by='${f.owner}' WHERE id='${f.cancellation}'; COMMIT;`, /SELF_APPROVAL_FORBIDDEN/u);
  assert.equal(sql(`SELECT status||':'||version FROM hr_attendance_leave_cancellation WHERE id='${f.cancellation}'`), "submitted:2");
  assert.equal(sql(`SELECT status FROM hr_approval_request WHERE id='${f.approval}'`), "submitted");
  rejected(`UPDATE hr_attendance_leave_cancellation SET version=2 WHERE id='${f.cancellation}'`, /IDENTITY_OR_VERSION_CHANGED/u);
});

test("submitted overlap is rejected by the database while touching intervals remain legal", { skip: !enabled }, () => {
  const f = fixture(), approval = randomUUID(), second = randomUUID();
  sql(`INSERT INTO hr_approval_request(id,tenant_id,park_id,request_no,request_type,applicant_employee_id,subject_employee_id,title,payload,status)
    VALUES('${approval}','10000001','20000001','LC-${second}','attendance_request','${f.employee}','${f.employee}','Cancellation',jsonb_build_object('kind','leave_cancellation','sourceRequestId','${f.original}'),'draft');
    INSERT INTO hr_attendance_leave_cancellation(id,tenant_id,park_id,cancellation_no,employee_id,source_request_id,source_request_version,approval_request_id,start_at,end_at,reason,created_by,updated_by)
    VALUES('${second}','10000001','20000001','LC-${second}','${f.employee}','${f.original}',1,'${approval}','2026-10-12T10:00:00+08:00','2026-10-12T12:00:00+08:00','Second','${f.owner}','${f.owner}');
    BEGIN; UPDATE hr_approval_request SET status='submitted' WHERE id='${f.approval}'; UPDATE hr_attendance_leave_cancellation SET status='submitted',version=2 WHERE id='${f.cancellation}'; COMMIT;`);
  rejected(`BEGIN; UPDATE hr_approval_request SET status='submitted' WHERE id='${approval}'; UPDATE hr_attendance_leave_cancellation SET status='submitted',version=2 WHERE id='${second}'; COMMIT;`, /exclusion constraint/u);
  assert.equal(sql(`SELECT status FROM hr_approval_request WHERE id='${approval}'`), "draft");
  sql(`UPDATE hr_attendance_leave_cancellation SET start_at='2026-10-12T11:00:00+08:00',version=2 WHERE id='${second}';
    BEGIN; UPDATE hr_approval_request SET status='submitted' WHERE id='${approval}'; UPDATE hr_attendance_leave_cancellation SET status='submitted',version=3 WHERE id='${second}'; COMMIT;`);
  assert.equal(sql(`SELECT count(*) FROM hr_attendance_leave_cancellation WHERE source_request_id='${f.original}' AND status='submitted'`), "2");
});
