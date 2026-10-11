import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import type { DataSource } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HrCandidateInterviewListDto, SaveHrCandidateInterviewDto } from "./dto/hr-candidate-interview.dto";
import { HrCandidateInterviewService } from "./hr-candidate-interview.service";

const scheduled: SaveHrCandidateInterviewDto = { expectedVersion: 0, roundLabel: " 第一轮 ", startsAt: "2026-10-11T09:00:00+08:00", endsAt: "2026-10-11T10:00:00+08:00", location: " A 楼 ", interviewerName: " 面试官 ", status: "scheduled", outcome: "pending", resultNotes: null, cancellationReason: null };
const errors = (value: unknown) => validate(plainToInstance(SaveHrCandidateInterviewDto, value), { whitelist: true, forbidNonWhitelisted: true });
const scope = { tenantId: "tenant", parkId: "park" };
const actor = { ...scope, sub: "actor", username: "interviewer", roles: [], permissions: ["*"] } as JwtPrincipal;

test("candidate interview DTO requires strict second-offset snapshots and trims business text", async () => {
  const dto = plainToInstance(SaveHrCandidateInterviewDto, scheduled);
  assert.deepEqual(await validate(dto, { whitelist: true, forbidNonWhitelisted: true }), []);
  assert.equal(dto.roundLabel, "第一轮"); assert.equal(dto.location, "A 楼"); assert.equal(dto.interviewerName, "面试官");
  for (const [field, value] of [["startsAt", "2026-10-11T09:00:00"], ["startsAt", "2026-10-11T09:00:00.001+08:00"], ["startsAt", "2026-02-30T09:00:00+08:00"], ["roundLabel", " "], ["location", "字".repeat(241)], ["interviewerName", "字".repeat(101)], ["expectedVersion", 0.5]] as const) assert.ok((await errors({ ...scheduled, [field]: value })).length, `${field} must reject ${String(value)}`);
});

test("candidate interview DTO requires every nullable field and only permits state-compatible snapshots", async () => {
  const omitted = { ...scheduled } as Partial<typeof scheduled>; delete omitted.resultNotes;
  assert.ok((await errors(omitted)).length); assert.ok((await errors({ ...scheduled, unexpected: true })).length);
  assert.ok((await errors({ ...scheduled, status: "reopened" })).length); assert.ok((await errors({ ...scheduled, outcome: "maybe" })).length);
  assert.deepEqual(await errors({ ...scheduled, status: "completed", outcome: "pass", resultNotes: "通过", cancellationReason: null }), []);
  assert.deepEqual(await errors({ ...scheduled, status: "cancelled", outcome: "pending", resultNotes: null, cancellationReason: "候选人请假" }), []);
});

test("candidate interview services reject unauthorized calls before any SQL", async () => {
  let transactions = 0;
  const db = { transaction: async () => { transactions++; throw new Error("must not query"); } } as unknown as DataSource;
  const service = new HrCandidateInterviewService(db, {} as never);
  const denied = { ...actor, permissions: [] };
  await assert.rejects(service.list(scope, denied, "candidate", { page: 1, page_size: 20 }));
  await assert.rejects(service.detail(scope, denied, "candidate", "interview"));
  await assert.rejects(service.history(scope, denied, "candidate", "interview", { page: 1, page_size: 20 }));
  await assert.rejects(service.create(scope, denied, "candidate", scheduled));
  await assert.rejects(service.update(scope, denied, "candidate", "interview", { ...scheduled, expectedVersion: 1 }));
  assert.equal(transactions, 0);
});

test("candidate interview service validates state before SQL and protects terminal states", async () => {
  let queries: string[] = [];
  const row = { id: "interview", candidateId: "candidate", version: 2, roundLabel: "第一轮", startsAt: scheduled.startsAt, endsAt: scheduled.endsAt, location: "A", interviewerName: "B", status: "completed", outcome: "pass", resultNotes: "通过", cancellationReason: null };
  const manager = { query: async (sql: string) => { queries.push(sql); if (sql.includes("FROM hr_candidate WHERE")) return [{ id: "candidate" }]; if (sql.includes("FROM hr_candidate_interview i")) return [row]; throw new Error(`unexpected SQL: ${sql}`); } };
  const db = { transaction: async (...args: unknown[]) => (args.at(-1) as (m: typeof manager) => Promise<unknown>)(manager) } as unknown as DataSource;
  const service = new HrCandidateInterviewService(db, { recordOperationRequired: async () => undefined } as never);
  await assert.rejects(service.create(scope, actor, "candidate", { ...scheduled, startsAt: "2026-10-11T10:00:00+08:00", endsAt: "2026-10-11T09:00:00+08:00" }), /after start/);
  await assert.rejects(service.create(scope, actor, "candidate", { ...scheduled, outcome: "pass" }), /Scheduled interview/);
  assert.equal(queries.length, 0);
  await assert.rejects(service.update(scope, actor, "candidate", "interview", { ...scheduled, expectedVersion: 2 }), /cannot change status/);
  assert.ok(queries.some(sql => sql.includes("FOR UPDATE"))); assert.ok(!queries.some(sql => sql.startsWith("UPDATE hr_candidate_interview")));
});

test("candidate interview detail uses its scoped projection and required read audit", async () => {
  const row = { id: "interview", candidateId: "candidate", version: 3, roundLabel: "第一轮", startsAt: scheduled.startsAt, endsAt: scheduled.endsAt, location: "A", interviewerName: "B", status: "scheduled", outcome: "pending", resultNotes: null, cancellationReason: null, updatedAt: "2026-10-11T01:00:00.000Z" };
  const calls: string[] = []; let auditCalls = 0;
  const manager = { query: async (sql: string) => { calls.push(sql); if (sql.includes("FROM hr_candidate WHERE")) return [{ id: "candidate" }]; if (sql.includes("FROM hr_candidate_interview i")) return [row]; throw new Error(`unexpected SQL: ${sql}`); } };
  const db = { transaction: async (...args: unknown[]) => (args.at(-1) as (m: typeof manager) => Promise<unknown>)(manager) } as unknown as DataSource;
  const service = new HrCandidateInterviewService(db, { recordOperationRequired: async () => { auditCalls++; } } as never);
  assert.deepEqual(await service.detail(scope, actor, "candidate", "interview"), row); assert.equal(auditCalls, 1);
  assert.ok(calls.some(sql => sql.includes("i.id=$1") && sql.includes("i.candidate_id=$4")));
  const failing = new HrCandidateInterviewService(db, { recordOperationRequired: async () => { throw new Error("required audit unavailable"); } } as never);
  await assert.rejects(failing.detail(scope, actor, "candidate", "interview"), /required audit unavailable/);
});

test("candidate interview list DTO keeps bounded integral pagination", async () => {
  assert.deepEqual(await validate(plainToInstance(HrCandidateInterviewListDto, { page: "2", page_size: "100" })), []);
  for (const value of [{ page: "1.1" }, { page: 0 }, { page_size: 101 }, { page_size: "no" }]) assert.ok((await validate(plainToInstance(HrCandidateInterviewListDto, value))).length);
});
