import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { ConflictException } from "@nestjs/common";
import { DataSource, type QueryRunner } from "typeorm";
import { IdempotencyRequestEntity } from "../entities/idempotency-request.entity";
import { IdempotencyService, type IdempotencyBeginContext } from "./idempotency.service";

const databaseUrl = process.env.DATABASE_URL;
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}
function context(service: IdempotencyService, changes: Partial<IdempotencyBeginContext> = {}) {
  const input = { tenantId: "tenant", parkId: "park", userId: "user", requestPath: "/idem-pg",
    requestMethod: "POST", idempotencyKey: randomUUID(), ...changes };
  return { ...input, requestFingerprint: changes.requestFingerprint
    ?? service.buildFingerprint({ ...input, body: {}, query: {} }) };
}

test("product TypeORM idempotency reservations on PostgreSQL", {
  skip: databaseUrl ? false : "DATABASE_URL required", timeout: 60000
}, async (t) => {
  const schema = `idem_service_${randomUUID().replaceAll("-", "")}`;
  const observer = await new DataSource({ type: "postgres", url: databaseUrl }).initialize();
  const sources: DataSource[] = [];
  async function source(isolation = "read committed") {
    const ds = await new DataSource({ type: "postgres", url: databaseUrl,
      schema, entities: [IdempotencyRequestEntity],
      extra: { options: `-c default_transaction_isolation=${isolation.replaceAll(" ", "\\ ")}` }
    }).initialize();
    sources.push(ds);
    return ds;
  }
  function service(ds: DataSource) { return new IdempotencyService(ds.getRepository(IdempotencyRequestEntity), ds); }
  async function waitForLock(pid: number) {
    for (let i = 0; i < 150; i++) {
      const rows = await observer.query("SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1", [pid]);
      if (rows[0]?.wait_event_type === "Lock") return;
      await new Promise((done) => setTimeout(done, 10));
    }
    assert.fail("contender never reached PostgreSQL lock wait");
  }
  // Hooks pause actual TypeORM SQL; neither repository nor service is replaced.
  function hook(ds: DataSource, after: (sql: string, result: unknown, runner: QueryRunner) => Promise<void>) {
    const create = ds.createQueryRunner.bind(ds);
    let pid = 0;
    const errors: unknown[] = [];
    ds.createQueryRunner = (...args) => {
      const runner = create(...args);
      const query = runner.query.bind(runner);
      runner.query = (async (...parameters: Parameters<typeof query>) => {
        try {
          if (!pid) pid = (await query("SELECT pg_backend_pid() AS pid"))[0].pid;
          const result = await query(...parameters);
          await after(parameters[0], result, runner);
          return result;
        } catch (error) { errors.push(error); throw error; }
      }) as typeof runner.query;
      return runner;
    };
    return { pid: () => pid, errors, restore: () => { ds.createQueryRunner = create; } };
  }
  try {
    await observer.query(`CREATE SCHEMA "${schema}"`);
    await observer.query(`CREATE TABLE "${schema}".sys_idempotency_request
      (LIKE public.sys_idempotency_request INCLUDING DEFAULTS)`);
    await observer.query(`ALTER TABLE "${schema}".sys_idempotency_request ADD PRIMARY KEY(id),
      ADD CONSTRAINT uq_sys_idempotency_request_scope UNIQUE(tenant_id,user_id,request_path,idempotency_key)`);
    const a = await source(); const b = await source();
    const sa = service(a); const sb = service(b);
    for (const winner of ["commit", "cached", "rollback", "repeatable read"] as const) {
      await t.test(`first contenders wait for winner ${winner}`, async () => {
        const contender = winner === "repeatable read" ? await source("repeatable read") : b;
        const sc = service(contender);
        const input = context(sa);
        const inserted = deferred(); const release = deferred(); const started = deferred();
        const rollback = new Error("winner intentionally rolled back");
        const ah = hook(a, async (sql, _result, runner) => {
          if (!sql.startsWith("INSERT INTO")) return;
          if (winner === "cached") await runner.manager.getRepository(IdempotencyRequestEntity)
            .update({ idempotencyKey: input.idempotencyKey }, { status: "succeeded", responseStatus: 201, responseBody: { ok: true } });
          inserted.resolve(); await release.promise;
          if (winner === "rollback") throw rollback;
        });
        const bh = hook(contender, async (sql) => { if (sql.startsWith("SELECT") && sql.includes("FOR UPDATE")) started.resolve(); });
        const first = sa.tryBegin(input).then(value => ({ value }), error => ({ error }));
        let second: typeof first | undefined;
        try {
          await inserted.promise;
          second = sc.tryBegin(input).then(value => ({ value }), error => ({ error }));
          await started.promise; await waitForLock(bh.pid()); release.resolve();
          const [left, right] = await Promise.all([first, second]);
          if (winner === "rollback") { assert("error" in left); assert.equal(left.error, rollback); }
          else { assert("value" in left); assert.equal(left.value.outcome, "began"); }
          if (winner === "repeatable read") {
            assert("error" in right); assert(bh.errors.includes(right.error));
            assert.equal((right.error as { driverError: { code: string } }).driverError.code, "40001");
          } else {
            assert("value" in right);
            assert.equal(right.value.outcome, winner === "rollback" ? "began" : winner === "cached" ? "cached" : "processing");
            assert(right.value.request instanceof IdempotencyRequestEntity);
            for (const value of [right.value.request.lockedUntil, right.value.request.expiresAt, right.value.request.createdAt]) assert(value instanceof Date);
            if (winner === "cached") assert.deepEqual(right.value.cachedResponse, { responseStatus: 201, responseBody: { ok: true } });
          }
        } finally { release.resolve(); await Promise.allSettled([first, ...(second ? [second] : [])]); ah.restore(); bh.restore(); }
      });
    }
    await t.test("cache, failure, expiry, four-column scope and fingerprint contracts", async () => {
      const input = context(sa); const first = await sa.tryBegin(input);
      assert.equal((await sb.tryBegin(input)).outcome, "processing");
      await sa.markSucceeded(first.request.id, 201, { at: new Date("2026-01-01Z"), token: "private" });
      const cached = await sb.tryBegin(input);
      assert.deepEqual(cached.cachedResponse?.responseBody, { at: "2026-01-01T00:00:00.000Z", token: "***" });
      const repo = a.getRepository(IdempotencyRequestEntity);
      await repo.update(first.request.id, { expiresAt: new Date(0) });
      assert.equal((await sb.tryBegin(input)).outcome, "cached");
      for (const change of [{ parkId: "other" }, { requestMethod: "PUT" }, { requestFingerprint: "different" }]) {
        assert.equal((await sb.tryBegin(context(sa, { ...input, ...change,
          requestFingerprint: "requestFingerprint" in change ? change.requestFingerprint : undefined }))).reason, "fingerprint_mismatch");
      }
      for (const change of [{ tenantId: "other" }, { userId: "other" }, { requestPath: "/other" }, { idempotencyKey: randomUUID() }]) {
        assert.equal((await sb.tryBegin(context(sa, { ...input, ...change }))).outcome, "began");
      }
      assert.equal(await sa.cleanupExpired(10), 1);
      const renewed = await sb.tryBegin(input); assert.equal(renewed.outcome, "began"); assert.notEqual(renewed.request.id, first.request.id);
      await sa.markFailed(renewed.request.id, "HTTP_500"); assert.equal((await sb.tryBegin(input)).outcome, "began");
      await repo.update(renewed.request.id, { lockedUntil: new Date(0) }); assert.equal((await sb.tryBegin(input)).outcome, "began");
      await repo.update(renewed.request.id, { status: "succeeded", responseStatus: null, responseBody: () => "NULL" });
      assert.equal((await sb.tryBegin(input)).reason, "cached_response_missing");
      await observer.query(`UPDATE "${schema}".sys_idempotency_request SET status='unknown' WHERE id=$1`, [renewed.request.id]);
      assert.equal((await sb.tryBegin(input)).reason, "unexpected_state");
    });
    await t.test("strict TTL equality and cleanup boundary use the product service", async (clock) => {
      const now = new Date("2026-09-14T07:00:00Z");
      clock.mock.timers.enable({ apis: ["Date"], now });
      try {
        const input = context(sa);
        const first = await sa.tryBegin(input);
        const repo = a.getRepository(IdempotencyRequestEntity);
        assert.equal(first.request.lockedUntil.getTime(), now.getTime() + 300000);
        assert.equal(first.request.expiresAt.getTime(), now.getTime() + 604800000);
        await repo.update(first.request.id, { lockedUntil: new Date(now.getTime() + 1) });
        assert.equal((await sb.tryBegin(input)).outcome, "processing");
        await repo.update(first.request.id, { lockedUntil: now });
        assert.equal((await sb.tryBegin(input)).outcome, "began");
        await repo.update(first.request.id, { expiresAt: now });
        await sa.cleanupExpired(100);
        assert.equal(await repo.countBy({ id: first.request.id }), 1);
        await repo.update(first.request.id, { expiresAt: new Date(now.getTime() - 1) });
        assert.equal(await sa.cleanupExpired(100), 1);
        assert.equal(await repo.countBy({ id: first.request.id }), 0);
      } finally { clock.mock.timers.reset(); }
    });
    await t.test("real PostgreSQL deadlock propagates the same TypeORM error", async () => {
      await observer.query(`CREATE TABLE "${schema}".deadlock_barrier (id integer PRIMARY KEY, n integer NOT NULL)`);
      await observer.query(`INSERT INTO "${schema}".deadlock_barrier VALUES (1,0),(2,0)`);
      const leftReady = deferred(); const rightReady = deferred();
      function pause(first: number, second: number, ready: ReturnType<typeof deferred>, other: ReturnType<typeof deferred>) {
        let entered = false;
        return async (sql: string, _result: unknown, runner: QueryRunner) => {
          if (entered || !sql.includes("FOR UPDATE")) return;
          entered = true;
          await runner.query(`UPDATE "${schema}".deadlock_barrier SET n=n+1 WHERE id=$1`, [first]);
          ready.resolve(); await other.promise;
          await runner.query(`UPDATE "${schema}".deadlock_barrier SET n=n+1 WHERE id=$1`, [second]);
        };
      }
      const ah = hook(a, pause(1, 2, leftReady, rightReady));
      const bh = hook(b, pause(2, 1, rightReady, leftReady));
      try {
        const results = await Promise.allSettled([sa.tryBegin(context(sa)), sb.tryBegin(context(sb))]);
        const failed = results.filter(result => result.status === "rejected");
        assert.equal(failed.length, 1);
        assert(failed[0]);
        const error: unknown = failed[0].reason;
        assert([...ah.errors, ...bh.errors].includes(error));
        assert.equal((error as { driverError: { code: string } }).driverError.code, "40P01");
        assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
      } finally { ah.restore(); bh.restore(); }
    });
    await t.test("cleanup gap is 409 without a reservation", async () => {
      const input = context(sa); const inserted = deferred(); const release = deferred();
      // Force the contender's initial empty read before the winner commits.
      const h = hook(b, async (sql) => {
        if (sql.startsWith("SELECT") && sql.includes("FOR UPDATE")) { inserted.resolve(); await release.promise; }
        if (sql.startsWith("INSERT INTO")) await a.getRepository(IdempotencyRequestEntity).delete({ idempotencyKey: input.idempotencyKey });
      });
      const pending = sb.tryBegin(input).then(value => ({ value }), error => ({ error }));
      try {
        await inserted.promise; await sa.tryBegin(input); release.resolve();
        const result = await pending; assert("error" in result); assert(result.error instanceof ConflictException);
        assert.equal(result.error.getStatus(), 409);
        assert.equal(await a.getRepository(IdempotencyRequestEntity).countBy({ idempotencyKey: input.idempotencyKey }), 0);
      } finally { release.resolve(); await pending; h.restore(); }
    });
    await t.test("unrelated unique violations propagate the original TypeORM error", async () => {
      await observer.query(`CREATE UNIQUE INDEX unrelated_fingerprint ON "${schema}".sys_idempotency_request(request_fingerprint) WHERE request_fingerprint='unique-test'`);
      await sa.tryBegin(context(sa, { requestFingerprint: "unique-test" }));
      const h = hook(b, async () => {});
      try { await assert.rejects(sb.tryBegin(context(sa, { requestFingerprint: "unique-test" })), error => {
        assert(h.errors.includes(error));
        assert.equal((error as { driverError: { code: string; constraint: string } }).driverError.code, "23505");
        assert.equal((error as { driverError: { constraint: string } }).driverError.constraint, "unrelated_fingerprint"); return true;
      }); } finally { h.restore(); }
    });
  } finally {
    await Promise.all(sources.map(ds => ds.destroy()));
    await observer.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    assert.equal((await observer.query("SELECT 1 FROM pg_namespace WHERE nspname=$1", [schema])).length, 0);
    await observer.destroy();
  }
});
