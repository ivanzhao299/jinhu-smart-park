import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { DataSource } from "typeorm";
import { HomestayFinanceService } from "./homestay-finance.service";
import { HomestayTransactionSupportService } from "./homestay-transaction-support.service";

const databaseUrl = process.env.DATABASE_URL;
test("synthetic PG: refund and waiver reject currency drift without domain effects", {
  skip: databaseUrl ? false : "DATABASE_URL required"
}, async () => {
  const ds = new DataSource({ type: "postgres", url: databaseUrl });
  await ds.initialize();
  const runner = ds.createQueryRunner(); await runner.connect();
  const schema = `homestay_currency_${randomUUID().replaceAll("-", "")}`;
  const query = (sql: string, parameters?: unknown[]) => runner.query(sql, parameters);
  const service = new HomestayFinanceService({} as never, {} as never, new HomestayTransactionSupportService());
  try {
    await query(`CREATE SCHEMA "${schema}"`);
    await runner.startTransaction();
    await query(`SET LOCAL search_path TO "${schema}"`);
    // Explicit synthetic tables; all command SQL and source-lock policies execute on PostgreSQL.
    await query(`CREATE TABLE biz_homestay_booking (
      id uuid PRIMARY KEY, tenant_id text, park_id text, version integer, currency text, status text,
      is_deleted boolean DEFAULT false, update_by uuid, update_time timestamptz);
      CREATE TABLE biz_homestay_ledger_entry (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text, park_id text, booking_id uuid,
      version integer DEFAULT 1, entry_type text, charge_type text, amount numeric(18,2), currency text,
      status text, source_ledger_entry_id uuid, create_by uuid, update_by uuid, occurred_at timestamptz,
      reason text, is_deleted boolean DEFAULT false, approval_execution_key text,
      approval_effect_kind text, approval_effect_line_key text, approval_effect_hash text);
      CREATE TABLE biz_homestay_legacy_finance_source_map (
      tenant_id text, park_id text, result_ledger_entry_id uuid, source_ledger_entry_id uuid,
      source_expected_version integer, currency text);
      CREATE TABLE biz_property_execution_effect_manifest (
      tenant_id text, park_id text, request_id uuid, effect_kind text, effect_line_key text,
      invariant_hash text, line_amount numeric(18,2), currency text);`);
    for (const entryType of ["refund", "waiver"] as const) {
      const bookingId = randomUUID(), sourceId = randomUUID(), requestId = randomUUID();
      const tenantId = randomUUID(), parkId = randomUUID(), actorId = randomUUID();
      const sourceEntryType = entryType === "refund" ? "payment" : "charge";
      await query("INSERT INTO biz_homestay_booking(id,tenant_id,park_id,version,currency,status) VALUES($1,$2,$3,1,'CNY','confirmed')", [bookingId, tenantId, parkId]);
      await query(`INSERT INTO biz_homestay_ledger_entry(id,tenant_id,park_id,booking_id,entry_type,charge_type,amount,currency,status)
        VALUES($1,$2,$3,$4,$5,'room',100,'CNY','confirmed')`, [sourceId, tenantId, parkId, bookingId, sourceEntryType]);
      await query(`INSERT INTO biz_property_execution_effect_manifest VALUES($1,$2,$3,$4,'line',$5,1,'CNY')`,
        [tenantId, parkId, requestId, `homestay.ledger.${entryType}`, "a".repeat(64)]);
      const input = {
        manager: runner.manager, requestId, executionIdempotencyKey: requestId, sourceExpectedVersion: 1,
        request: { tenantId, parkId, sourceId: bookingId, requesterId: actorId },
        canonicalPayload: { bookingId, reason: "synthetic currency boundary", lines: [{
          entryType, sourceLedgerEntryId: sourceId, sourceExpectedVersion: 1, sourceEntryType,
          sourceAmount: "100.00", chargeType: "room", amount: "1.00", currency: "CNY",
          allocatedAmount: "0.00", remainingAvailableBalance: "100.00", allocationContributors: []
        }] }
      };
      const snapshot = async () => ({
        bookings: await query("SELECT * FROM biz_homestay_booking ORDER BY id"),
        ledger: await query("SELECT * FROM biz_homestay_ledger_entry ORDER BY id")
      });
      await query("SAVEPOINT currency_drift");
      await query("UPDATE biz_homestay_ledger_entry SET currency='USD' WHERE id=$1", [sourceId]);
      const baseline = await snapshot();
      await assert.rejects(service.executeApprovedFinance(input), /Approval source changed/);
      assert.deepEqual(await snapshot(), baseline, `${entryType}: zero domain effect`);
      await query("ROLLBACK TO SAVEPOINT currency_drift");
      // Matched control proves that the fixture is otherwise executable, including ledger insert/CAS.
      await service.executeApprovedFinance(input);
      assert.deepEqual(await query("SELECT version FROM biz_homestay_booking WHERE id=$1", [bookingId]), [{ version: 2 }]);
      assert.deepEqual(await query("SELECT entry_type,amount::text FROM biz_homestay_ledger_entry WHERE approval_execution_key=$1", [requestId]), [{ entry_type: entryType, amount: "1.00" }]);
    }
    await runner.rollbackTransaction();
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await ds.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await runner.release(); await ds.destroy();
  }
});
