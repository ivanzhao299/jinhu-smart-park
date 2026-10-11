import assert from "node:assert/strict";
import test from "node:test";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { transferCandidateProfile } from "./hr-candidate-profile-transfer";

const scope = { tenantId: "t", parkId: "p" };
const actor = { ...scope, sub: "u", username: "u", roles: [], permissions: [HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_MANAGE] };
const sensitive = {
  decrypt: (value: string) => value.startsWith("enc:") ? value.slice(4) : null,
  hash: (value: string) => `hash:${value}`, mask: (value: string) => `mask:${value}`
};
function fixture(values: Record<string, string> = {}, target?: Record<string, unknown>) {
  const source: Record<string, unknown> = { version: 7 };
  for (const kind of ["mobile", "email", "identity"]) {
    const value = values[kind];
    source[`${kind}_encrypted`] = value ? `enc:${value}` : null;
    source[`${kind}_masked`] = value ? `mask:${value}` : null;
    source[`${kind}_fingerprint`] = value ? `hash:${value}` : null;
  }
  const writes: Array<{ sql: string; parameters: unknown[] }> = [];
  const audits: unknown[] = [];
  let writeError: Error | undefined, auditError: Error | undefined;
  const manager = { query: async (sql: string, parameters: unknown[]) => {
    if (sql.includes("FROM hr_candidate ")) return [source];
    if (sql.includes("FROM hr_employee_profile")) return target ? [target] : [];
    if (writeError) throw writeError;
    writes.push({ sql, parameters });
    return [{ id: "profile" }];
  } };
  const audit = { recordOperationRequired: async (input: unknown, transaction: unknown) => {
    assert.equal(transaction, manager); if (auditError) throw auditError; audits.push(input);
  } };
  return { source, writes, audits, failWrite: (error: Error) => { writeError = error; },
    failAudit: () => { auditError = new Error("required audit unavailable"); },
    run: (principal = actor) => transferCandidateProfile(manager as never, scope, principal, "candidate", "employee", sensitive as never, audit as never) };
}
test("conversion fills formal profile once and emits metadata only", async () => {
  const f = fixture({ mobile: "13800138000", email: "person@example.com", identity: "AB12" });
  const receipt = await f.run();
  assert.equal(receipt.afterVersion, 1); assert.equal(receipt.candidateVersion, 7);
  assert.equal(f.writes.length, 1); assert.match(f.writes[0]!.sql, /INSERT INTO hr_employee_profile/);
  assert.ok(f.writes[0]!.parameters.includes("enc:AB12"));
  assert.ok(f.writes[0]!.parameters.includes("person@example.com"));
  for (const value of ["13800138000", "person@example.com", "AB12", "hash:", "enc:"]) {
    assert.ok(!JSON.stringify([receipt, ...f.audits]).includes(value));
  }
  assert.ok(!f.writes[0]!.sql.includes("id_type"));
});
test("conversion without source facts creates no empty profile or additional privilege requirement", async () => {
  const f = fixture(); assert.deepEqual(await f.run({ ...actor, permissions: [] }), { candidateVersion: 7, fields: [] });
  assert.equal(f.writes.length, 0);
});
test("transfer requires profile management before any write", async () => {
  const f = fixture({ mobile: "13800138000" });
  await assert.rejects(f.run({ ...actor, permissions: [] }), /员工档案管理权限/); assert.equal(f.writes.length, 0);
});
test("matching profile is preserved, with no version change or full replacement", async () => {
  const f = fixture({ email: "person@example.com", identity: "AB12" }, { id: "p", version: 9, is_deleted: false,
    personal_email: "PERSON@EXAMPLE.COM", id_number_encrypted: "enc:AB12", id_number_masked: "mask:AB12", id_number_fingerprint: "hash:AB12" });
  assert.equal((await f.run()).afterVersion, 9); assert.equal(f.writes.length, 0);
});
test("only missing fields are updated; other profile columns cannot be cleared", async () => {
  const f = fixture({ mobile: "13800138000" }, { id: "p", version: 4, is_deleted: false, personal_mobile: null });
  const receipt = await f.run(); assert.equal(receipt.afterVersion, 5);
  assert.match(f.writes[0]!.sql, /personal_mobile=\$5/);
  for (const column of ["address", "personal_email", "id_number", "source_snapshot"]) assert.ok(!f.writes[0]!.sql.includes(column));
});
test("different, deleted and partial identity profiles reject without writes", async () => {
  for (const target of [{ personal_mobile: "13900139000" }, { is_deleted: true }, { id_number_masked: "mask:AB12" }]) {
    const f = fixture({ mobile: "13800138000", identity: "AB12" }, { id: "p", version: 1, ...target });
    await assert.rejects(f.run(), /HR_CANDIDATE_PROFILE_TARGET_CONFLICT/); assert.equal(f.writes.length, 0);
  }
});
test("incomplete, corrupt or mismatched protected source and overlong email never silently drop or truncate", async () => {
  for (const field of ["mobile_encrypted", "mobile_masked", "mobile_fingerprint"]) {
    const f = fixture({ mobile: "13800138000" }); f.source[field] = "broken";
    await assert.rejects(f.run(), /HR_CANDIDATE_PROFILE_SOURCE_CONFLICT/); assert.equal(f.writes.length, 0);
  }
  const f = fixture({ email: `${"a".repeat(129)}@example.com` });
  await assert.rejects(f.run(), /HR_CANDIDATE_PROFILE_LENGTH_CONFLICT/); assert.equal(f.writes.length, 0);
});
test("unique identity and required audit failures propagate to enclosing conversion transaction", async () => {
  const f = fixture({ identity: "AB12" }); f.failWrite(Object.assign(new Error("duplicate"), { code: "23505" }));
  await assert.rejects(f.run(), /HR_CANDIDATE_PROFILE_IDENTITY_CONFLICT/);
  const a = fixture({ mobile: "13800138000" }); a.failAudit(); await assert.rejects(a.run(), /required audit unavailable/);
});
