import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { type ExecutionContext } from "@nestjs/common";
import { firstValueFrom, of } from "rxjs";
import { getIdempotencyService, setIdempotencyService } from "../../shared/services/idempotency.service";
import { HrCandidateProfileIdempotencyInterceptor } from "./hr-candidate-profile-idempotency.interceptor";
import type { DataSource } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HrCandidateProfileListDto, SaveHrCandidateProfileDto } from "./dto/hr-candidate-profile.dto";
import { HrCandidateProfileService } from "./hr-candidate-profile.service";
const scope = { tenantId: "tenant", parkId: "park" }, actor = { ...scope, sub: "actor", username: "editor", roles: [], permissions: ["*"] } as JwtPrincipal;
const edit = { expectedVersion: 4, changeReason: " 更正资料 ", fullName: " 更正姓名 " };
const errors = (value: unknown) => validate(plainToInstance(SaveHrCandidateProfileDto, value), { whitelist: true, forbidNonWhitelisted: true });
const base = { id: "candidate", version: 4, candidateNo: "C-1", fullName: "姓名", requisitionId: "10000000-0000-4000-8000-000000000001", requisitionTitle: "历史岗位", stage: "screening", source: null, expectedOnboardDate: new Date("2026-10-12T00:00:00Z"), latestEvaluation: null, convertedEmployeeId: null as string | null, updatedAt: new Date("2026-10-11T02:00:00Z"), mobileEncrypted: "enc:v1:existing", mobileMasked: "13****00", mobileFingerprint: "hash:13800000000", emailEncrypted: null, emailMasked: null, emailFingerprint: null, identityEncrypted: null, identityMasked: null, identityFingerprint: null };
function harness(row = { ...base }) {
 const calls: Array<{ sql: string; values: unknown[] }> = [], audits: unknown[] = []; let decryptions = 0, profiles = 0, failAudit = false, unique = false;
 const manager = { query: async (sql: string, values: unknown[] = []) => {
  calls.push({ sql, values }); if (sql.startsWith("SELECT c.id")) return [{ ...row }];
  if (sql.startsWith("UPDATE hr_candidate")) { if (unique) throw { code: "23505", constraint: "uq_hr_candidate_no" }; row = { ...row, version: row.version + 1, fullName: "更正姓名" }; return [[{ id: row.id, version: row.version }], 1]; }
  if (sql.startsWith("INSERT INTO")) return []; if (sql.startsWith("SELECT count")) return [{ total: 1 }];
  if (sql.startsWith("SELECT after_snapshot")) return [{ after_snapshot: { ...base, expectedOnboardDate: "2026-10-12", updatedAt: base.updatedAt.toISOString() } }];
  if (sql.startsWith("SELECT h.id")) return [{ id: "history", before: { ...base, expectedOnboardDate: "2026-10-12", updatedAt: base.updatedAt.toISOString() }, after: { ...row, expectedOnboardDate: "2026-10-12", updatedAt: base.updatedAt.toISOString() }, changeReason: "更正", occurredAt: base.updatedAt, actorDisplayName: "操作人" }];
  if (sql.startsWith("SELECT id FROM hr_recruitment")) return []; throw new Error(`unexpected SQL: ${sql}`);
 } };
 const db = { transaction: async (...args: unknown[]) => (args.at(-1) as (m: typeof manager) => Promise<unknown>)(manager) } as unknown as DataSource;
 const sensitive = { hash: (v: string) => `hash:${v}`, decrypt: () => { decryptions++; return "13800000000"; }, identityProfile: (v: string) => { profiles++; return { encrypted: `enc:v1:${v}`, masked: "mask", hash: `hash:${v}` }; } };
 const audit = { recordOperationRequired: async (event: unknown, actualManager: unknown) => { assert.equal(actualManager, manager); audits.push(event); if (failAudit) throw new Error("required audit unavailable"); } };
 return { service: new HrCandidateProfileService(db, sensitive as never, audit as never), calls, audits, decryptions: () => decryptions, profiles: () => profiles, failAudit: () => { failAudit = true; }, unique: () => { unique = true; } };
}
test("partial DTO preserves omissions, nullable clears, strict dates and required boundaries", async () => {
 assert.deepEqual(await errors(edit), []); assert.deepEqual(await errors({ ...edit, mobile: null, email: null, identityNumber: " ", source: " ", expectedOnboardDate: null }), []);
 const dto = plainToInstance(SaveHrCandidateProfileDto, { ...edit, source: " ", identityNumber: " " }); assert.equal(dto.source, null); assert.equal(dto.identityNumber, null); assert.equal(dto.fullName, "更正姓名");
 for (const value of [{ expectedVersion: 0 }, { expectedVersion: 1.5 }, { candidateNo: null }, { fullName: " " }, { requisitionId: null }, { expectedOnboardDate: "2026-02-30" }, { expectedOnboardDate: "0000-01-01" }, { expectedOnboardDate: "2026-10-11T00:00:00Z" }, { mobile: "123" }, { email: "no" }, { identityNumber: "x".repeat(65) }, { source: "x".repeat(65) }, { changeReason: " " }, { secret: "extra" }]) assert.ok((await errors({ ...edit, ...value })).length, JSON.stringify(value));
 assert.deepEqual(await errors({ ...edit, expectedOnboardDate: "2024-02-29" }), []);
 for (const value of [{ page: 0 }, { page: "1.1" }, { page_size: 101 }, { keyword: null }]) assert.ok((await validate(plainToInstance(HrCandidateProfileListDto, value))).length);
});
test("all endpoints and protected field presence reject before SQL", async () => {
 let count = 0; const service = new HrCandidateProfileService({ transaction: async () => { count++; throw new Error("SQL forbidden"); } } as unknown as DataSource, {} as never, {} as never);
 const denied = { ...actor, permissions: [] }, manager = { ...actor, permissions: ["hr:candidate:manage"] }, masked = { ...actor, permissions: ["hr:candidate:read", "hr:candidate:manage"] };
 await assert.rejects(service.current(scope, denied, "candidate"), /permission/); await assert.rejects(service.history(scope, denied, "candidate", { page: 1, page_size: 20 }), /permission/);
 await assert.rejects(service.requisitionOptions(scope, manager, "candidate", { page: 1, page_size: 20 }), /permission/); await assert.rejects(service.update(scope, manager, "candidate", edit), /permission/);
 await assert.rejects(service.update(scope, masked, "candidate", { ...edit, mobile: null }), /sensitive/); assert.equal(count, 0);
});
test("current/history dynamic masking never decrypts or leaks raw representations; required read audit", async () => {
 const h = harness(), masked = { ...actor, permissions: ["hr:candidate:read"] };
 const current = await h.service.current(scope, masked, "candidate"); assert.equal(current.sensitiveAvailable, false); assert.equal(current.expectedOnboardDate, "2026-10-12"); assert.ok(!("mobile" in current));
 const history = await h.service.history(scope, masked, "candidate", { page: 2, page_size: 1 }); assert.ok(!("mobile" in history.items[0]!.before)); assert.equal(h.decryptions(), 0);
 assert.ok(!/Encrypted|Fingerprint|actorUserId|enc:v1/.test(JSON.stringify({ current, history })));
 assert.equal((await h.service.current(scope, actor, "candidate")).mobile, "13800000000"); assert.equal(h.decryptions(), 3); assert.equal(h.audits.length, 3);
 h.failAudit(); await assert.rejects(h.service.current(scope, masked, "candidate"), /required audit/); await assert.rejects(h.service.history(scope, masked, "candidate", { page: 1, page_size: 20 }), /required audit/);
});
test("write locks actual global version, preserves protected omission and stores complete encrypted snapshots", async () => {
 const h = harness(), masked = { ...actor, permissions: ["hr:candidate:read", "hr:candidate:manage"] }; assert.equal((await h.service.update(scope, masked, "candidate", plainToInstance(SaveHrCandidateProfileDto, edit))).version, 5);
 assert.ok(h.calls[0]!.sql.includes("FOR UPDATE OF c")); const write = h.calls.find(call => call.sql.startsWith("UPDATE"))!; assert.ok(write.sql.includes("version=$4")); assert.ok(!write.sql.includes("mobile_encrypted=")); assert.equal(h.profiles(), 0);
 const history = h.calls.find(call => call.sql.startsWith("INSERT INTO hr_candidate_profile_history"))!; assert.equal(JSON.parse(history.values[5] as string).version, 4); assert.equal(JSON.parse(history.values[6] as string).version, 5); assert.ok(!Object.hasOwn(JSON.parse(history.values[6] as string), "mobile"));
 assert.ok(!JSON.stringify(h.audits).includes("更正姓名")); assert.ok(!JSON.stringify(h.audits).includes("enc:v1"));
});
test("canonical no-op rejected; null clears encryption/mask/hash; named duplicate maps safely", async () => {
 const h = harness(); await assert.rejects(h.service.update(scope, actor, "candidate", { expectedVersion: 4, changeReason: "相同", mobile: "138 0000 0000" }), /no effective/); assert.equal(h.profiles(), 0); assert.ok(!h.calls.some(call => call.sql.startsWith("UPDATE")));
 await h.service.update(scope, actor, "candidate", { ...edit, mobile: null }); const update = h.calls.find(call => call.sql.startsWith("UPDATE"))!; assert.ok(update.sql.includes("mobile_encrypted=")); assert.deepEqual(update.values.slice(-3), [null, null, null]);
 const unique = harness(); unique.unique(); await assert.rejects(unique.service.update(scope, actor, "candidate", { ...edit, candidateNo: "duplicate" }), /Candidate number already exists/); assert.ok(!unique.calls.some(call => call.sql.startsWith("INSERT INTO")));
});
test("stale versions, unavailable refs and hired/converted reassignment reject; unchanged historical ref survives", async () => {
 const stale = harness(); await assert.rejects(stale.service.update(scope, actor, "candidate", { ...edit, expectedVersion: 3 }), /changed/); assert.ok(!stale.calls.some(call => call.sql.startsWith("UPDATE")));
 const unavailable = harness(); await assert.rejects(unavailable.service.update(scope, actor, "candidate", { ...edit, requisitionId: "10000000-0000-4000-8000-000000000002" }), /requisition not found/);
 for (const row of [{ ...base, stage: "hired" }, { ...base, convertedEmployeeId: "employee" }]) { const h = harness(row); await assert.rejects(h.service.requisitionOptions(scope, actor, "candidate", { page: 1, page_size: 20 }), /cannot change/); await assert.rejects(h.service.update(scope, actor, "candidate", { ...edit, requisitionId: "10000000-0000-4000-8000-000000000002" }), /cannot change/); await h.service.update(scope, actor, "candidate", { ...edit, requisitionId: base.requisitionId }); assert.ok(!h.calls.some(call => call.sql.startsWith("SELECT id FROM hr_recruitment"))); }
});

test("calendar DATE projection uses text SQL and retains local-midnight Date fallback", async () => {
 const h = harness({ ...base, expectedOnboardDate: new Date(2026, 9, 12) });
 assert.equal((await h.service.current(scope, actor, "candidate")).expectedOnboardDate, "2026-10-12");
 assert.ok(h.calls[0]!.sql.includes('expected_onboard_date::text "expectedOnboardDate"'));
});
test("encrypted receipt replays the immutable original version with current projection and required audit", async () => {
 const h = harness(); const masked = { ...actor, permissions: ["hr:candidate:read", "hr:candidate:manage"] };
 // Receipt identity is opaque at rest; the projected response is never cached.
 const sensitive = { encrypt: (v: string) => `enc:v1:${Buffer.from(v).toString("base64")}`, decrypt: (v: string | null) => v?.startsWith("enc:v1:") ? Buffer.from(v.slice(7), "base64").toString() : null };
 const seal = new HrCandidateProfileService({} as DataSource, sensitive as never, {} as never).sealReceipt({ id: "candidate", version: 4, mobile: "private-contact" });
 assert.ok(!JSON.stringify(seal).includes("private-contact"));
 const opened = JSON.parse(sensitive.decrypt(seal.encryptedReceipt)!); assert.deepEqual(opened, { id: "candidate", version: 4 });
 const cache = { format: "hr_candidate_profile_v1", encryptedReceipt: "receipt" };
 const replaySensitive = { decrypt: (v: string | null) => v === "receipt" ? JSON.stringify({ id: "candidate", version: 4 }) : "private-contact" };
 const manager = { query: async (sql: string) => { if (sql.startsWith("SELECT c.id")) return [{ ...base, version: 20 }]; if (sql.startsWith("SELECT after_snapshot")) return [{ after_snapshot: { ...base, expectedOnboardDate: "2026-10-12", updatedAt: base.updatedAt.toISOString() } }]; throw new Error(sql); } };
 let audits = 0, fail = false;
 const db = { transaction: async (...args: unknown[]) => (args.at(-1) as (m: typeof manager) => Promise<unknown>)(manager) } as unknown as DataSource;
 const service = new HrCandidateProfileService(db, replaySensitive as never, { recordOperationRequired: async (_: unknown, actual: unknown) => { assert.equal(actual, manager); audits++; if (fail) throw new Error("required audit unavailable"); } } as never);
 const input = { ...edit, expectedVersion: 3 };
 const replay = await service.replayReceipt(scope, masked, "candidate", input, cache); assert.equal(replay.version, 4); assert.equal(replay.sensitiveAvailable, false); assert.ok(!("mobile" in replay));
 assert.equal((await service.replayReceipt(scope, actor, "candidate", input, cache)).mobile, "private-contact"); assert.equal(audits, 2);
 await assert.rejects(service.replayReceipt(scope, masked, "candidate", { ...input, mobile: null }, cache), /sensitive/);
 await assert.rejects(service.replayReceipt(scope, masked, "candidate", { ...input, expectedVersion: 4 }, cache), /receipt is unavailable/);
 await assert.rejects(service.replayReceipt(scope, { ...actor, permissions: [] }, "candidate", input, cache), /permission/);
 fail = true; await assert.rejects(service.replayReceipt(scope, masked, "candidate", input, cache), /required audit/); assert.equal(h.decryptions(), 0);
});
test("route-local interceptor caches only sealed identity and invokes permission-aware audited replay", async () => {
 let previous; try { previous = getIdempotencyService(); } catch { previous = null; }
 let cached: unknown = null, begun = 0, downstream = 0, permission = true, replayed = 0;
 const profiles = { authorizeWrite: () => { if (!permission) throw new Error("permission denied"); }, sealReceipt: () => ({ format: "hr_candidate_profile_v1", encryptedReceipt: "enc:v1:opaque" }), replayReceipt: async () => { replayed++; return { id: "candidate", version: 5, sensitiveAvailable: false, mobileMasked: "mask" }; } };
 const idempotency = { buildFingerprint: () => "hash", tryBegin: async () => { begun++; return cached ? { outcome: "cached", cachedResponse: { responseStatus: 200, responseBody: cached }, request: { id: "request" } } : { outcome: "began", request: { id: "request" } }; }, markSucceeded: async (_: string, __: number, body: unknown) => { cached = body; }, markFailed: async () => undefined };
 setIdempotencyService(idempotency as never);
 try {
  const request = { user: actor, body: edit, params: { id: "candidate" }, headers: { "x-idempotency-key": "key" }, method: "PUT", path: "/profile", query: {} };
  const response = { statusCode: 200, status: () => response }, context = { switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }) } as unknown as ExecutionContext;
  const interceptor = new HrCandidateProfileIdempotencyInterceptor(profiles as never), next = { handle: () => { downstream++; return of({ id: "candidate", version: 5, mobile: "private-contact" }); } };
  assert.equal((await firstValueFrom(interceptor.intercept(context, next)) as Record<string, unknown>).mobile, "private-contact"); assert.ok(!JSON.stringify(cached).includes("private-contact"));
  const replay = await firstValueFrom(interceptor.intercept(context, next)) as Record<string, unknown>; assert.equal(replay.sensitiveAvailable, false); assert.ok(!("mobile" in replay)); assert.equal(downstream, 1); assert.equal(replayed, 1);
  permission = false; await assert.rejects(firstValueFrom(interceptor.intercept(context, next)), /permission denied/); assert.equal(begun, 2);
 } finally { setIdempotencyService(previous); }
});
