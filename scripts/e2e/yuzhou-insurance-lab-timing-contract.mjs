import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setImmediate } from "node:timers";
import { URL } from "node:url";
import { installInsuranceLabTiming, sanitizeInsuranceLabTimings } from "../hr-cutover/yuzhou-insurance-lab-timing.mjs";
import { sanitizeYuzhouRealHttpLabFailureSummary } from "../hr-cutover/yuzhou-real-http-lab-runtime.mjs";

function fixture() {
  const row = { privateValue: "MUST_NOT_APPEAR" };
  const qb = () => ({ async getCount() { return 1; }, async getRawMany() { return [row]; }, clone() { return qb(); } });
  return {
    insurancePeriods: { createQueryBuilder: qb }, insuranceItems: { async find() { return [row]; } },
    auditService: { async recordOperationRequired() {} },
    async projectInsurancePeriod(x) { return x; },
    async listInsurancePeriods() {
      const query = this.insurancePeriods.createQueryBuilder();
      await query.getCount(); await query.clone().getRawMany();
      const items = await this.insuranceItems.find();
      await this.projectInsurancePeriod(items); await this.auditService.recordOperationRequired();
      return items;
    },
  };
}

test("fixed stages preserve output, this, originals and exclude unrelated calls", async () => {
  const service = fixture(), original = service.listInsurancePeriods;
  let time = 0;
  const timing = installInsuranceLabTiming(service, () => time++);
  await service.insuranceItems.find(); await service.auditService.recordOperationRequired();
  assert.deepEqual(timing.snapshot(), []);
  const result = await service.listInsurancePeriods();
  assert.equal(result[0].privateValue, "MUST_NOT_APPEAR");
  assert.deepEqual(timing.snapshot().map(x => x.stage), ["list", "count", "page", "items", "projection", "audit"]);
  assert.ok(timing.snapshot().every(x => x.status === "success"));
  assert.ok(!JSON.stringify(timing.snapshot()).includes("MUST_NOT_APPEAR"));
  timing.restore(); timing.restore(); assert.equal(service.listInsurancePeriods, original);
});

test("timeout snapshot keeps pending stage even when work later finishes", async () => {
  const service = fixture(); let release;
  service.insuranceItems.find = () => new Promise(resolve => { release = resolve; });
  const timing = installInsuranceLabTiming(service);
  const running = service.listInsurancePeriods();
  await new Promise(resolve => setImmediate(resolve));
  const captured = timing.snapshot();
  await service.auditService.recordOperationRequired();
  assert.equal(timing.snapshot().some(x => x.stage === "audit"), false);
  assert.equal(captured.find(x => x.stage === "items").status, "pending");
  release([]); await running;
  assert.equal(captured.find(x => x.stage === "items").status, "pending");
  assert.equal(timing.snapshot().find(x => x.stage === "items").status, "success");
  timing.restore();
});

test("errors retain identity, not contents, and evidence survives repeated sanitization", async () => {
  const service = fixture(), error = new Error("SECRET_SQL_PERSON");
  service.insuranceItems.find = async () => { throw error; };
  const timing = installInsuranceLabTiming(service);
  await assert.rejects(service.listInsurancePeriods(), e => e === error);
  const failure = { step: "verify", code: "HR_HTTP_PROBE_TIMEOUT", requestStep: "insurancePeriods_page1", insuranceTimings: timing.snapshot() };
  const receipt = sanitizeYuzhouRealHttpLabFailureSummary(sanitizeYuzhouRealHttpLabFailureSummary(failure));
  assert.equal(receipt.insuranceTimings.find(x => x.stage === "items").status, "failed");
  assert.ok(!JSON.stringify(receipt).includes("SECRET_SQL_PERSON")); timing.restore();
});

test("bounded output strips unexpected keys and rejects invalid labels and durations", async () => {
  const service = fixture(), timing = installInsuranceLabTiming(service);
  for (let i = 0; i < 30; i++) await service.listInsurancePeriods();
  assert.equal(timing.snapshot().length, 128); timing.restore();
  assert.deepEqual(sanitizeInsuranceLabTimings([
    { stage: "items", status: "success", elapsedMs: 1, sql: "SECRET" },
    { stage: "SECRET", status: "success", elapsedMs: 1 },
    { stage: "items", status: "success", elapsedMs: Infinity },
  ]), [{ stage: "items", status: "success", elapsedMs: 1 }]);
});

test("partial installation failure restores already wrapped members", () => {
  const service = fixture(), original = service.listInsurancePeriods;
  delete service.projectInsurancePeriod;
  assert.throws(() => installInsuranceLabTiming(service), /HR_HTTP_LAB_TIMING_INVALID/u);
  assert.equal(service.listInsurancePeriods, original);
});

test("diagnostic accessors cannot substitute private labels or throw into receipts", () => {
  let calls = 0;
  const entry = { get stage() { return calls++ ? "PRIVATE" : "items"; }, status: "pending", elapsedMs: 1 };
  assert.deepEqual(sanitizeInsuranceLabTimings([entry, { get stage() { throw new Error("PRIVATE"); } }]),
    [{ stage: "items", status: "pending", elapsedMs: 1 }]);
});

test("runtime captures before cleanup and runner fingerprints diagnostic helper", () => {
  const runtime = readFileSync(new URL("../hr-cutover/yuzhou-real-http-lab-runtime.mjs", import.meta.url), "utf8");
  const runner = readFileSync(new URL("../hr-cutover/run-yuzhou-real-bundle-lab.mjs", import.meta.url), "utf8");
  assert.ok(runtime.indexOf("failure.insuranceTimings = insuranceTiming.snapshot()") < runtime.indexOf("const cleanup = await cleanupYuzhouRealHttpLab"));
  assert.match(runner, /"yuzhou-insurance-lab-timing"/u);
});
