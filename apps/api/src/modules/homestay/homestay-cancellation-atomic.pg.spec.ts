import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { DataSource } from "typeorm";
import { HomestayService } from "./homestay.service";

const databaseUrl = process.env.DATABASE_URL;

test("DEC-01 cancellation is atomic and DEC-02 counts direct plus mapped legacy allocations", {
  skip: !databaseUrl
}, async () => {
  const dataSource = new DataSource({ type: "postgres", url: databaseUrl });
  await dataSource.initialize();
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  const ids = {
    building: randomUUID(), floor: randomUUID(), unit: randomUUID(), occupancy: randomUUID(),
    booking: randomUUID(), credential: randomUUID(), request: randomUUID(), actor: randomUUID(),
    policy: randomUUID(), sourceLedger: randomUUID(), financeRequest: randomUUID(),
    paymentSource: randomUUID(), otherPayment: randomUUID(), directRefund: randomUUID(),
    mappedRefund: randomUUID()
  };
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const tenantId = `pg-atomic-${suffix}`;
  const parkId = `pg-park-${suffix}`;
  const executionKey = `pg-cancel-${suffix}`;
  const payload = {
    bookingId: ids.booking,
    unitId: ids.unit,
    fromStatus: "confirmed",
    reason: "atomic cancellation",
    actorName: "PG verifier",
    cancellationEvaluationAt: "",
    occupancy: { id: ids.occupancy, expectedVersion: 1,
      beforeStatus: "active", afterStatus: "cancelled" },
    credentials: [{ id: ids.credential, expectedVersion: 1,
      beforeStatus: "issued", afterStatus: "void" }],
    ledgerContributors: [{ id: ids.sourceLedger, expectedVersion: 1, status: "confirmed",
      entryType: "charge", chargeType: "room", amount: "100.00", currency: "CNY",
      sourceLedgerEntryId: null }],
    roomWaiverAmount: "100.00",
    cancellationFeeAmount: "15.00",
    currency: "CNY"
  };
  const query = async (sql: string, parameters?: unknown[]) =>
    runner.query(sql, parameters);
  const service = new HomestayService(
    {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
    {} as never, {} as never, {} as never
  );

  try {
    await runner.startTransaction();
    const evaluation = await query(
      `SELECT transaction_timestamp()::text AS "cancellationEvaluationAt"`
    ) as Array<{ cancellationEvaluationAt: string }>;
    payload.cancellationEvaluationAt = evaluation[0]!.cancellationEvaluationAt;
    await query(
      `INSERT INTO biz_building(id,tenant_id,park_id,building_code,building_name)
       VALUES($1,$2,$3,$4,$5)`,
      [ids.building, tenantId, parkId, `B-${suffix}`, "Atomic building"]
    );
    await query(
      `INSERT INTO biz_floor(id,tenant_id,park_id,building_id,floor_code,floor_no,floor_name)
       VALUES($1,$2,$3,$4,$5,1,$6)`,
      [ids.floor, tenantId, parkId, ids.building, `F-${suffix}`, "Atomic floor"]
    );
    await query(
      `INSERT INTO biz_unit(id,tenant_id,park_id,unit_code,building_id,floor_id,unit_name,
          usage_type,unit_area,use_area,rental_status,fitting_status)
       VALUES($1,$2,$3,$4,$5,$6,$7,1,40,40,1,1)`,
      [ids.unit, tenantId, parkId, `U-${suffix}`, ids.building, ids.floor, "Atomic unit"]
    );
    await query(
      `INSERT INTO biz_property_occupancy(id,tenant_id,park_id,unit_id,source_domain,source_type,
          source_id,start_at,end_at,status)
       VALUES($1,$2,$3,$4,'homestay','homestay_booking',$5,'2026-08-01','2026-08-03','active')`,
      [ids.occupancy, tenantId, parkId, ids.unit, ids.booking]
    );
    await query(
      `INSERT INTO biz_homestay_booking(id,tenant_id,park_id,booking_code,unit_id,occupancy_id,
          status,arrival_date,departure_date,currency,room_amount,total_amount,cancellation_policy_snapshot)
       VALUES($1,$2,$3,$4,$5,$6,'confirmed','2026-08-01','2026-08-03','CNY',100,100,
          '{"free_cancel_before_hours":24,"late_cancel_fee_type":"fixed","late_cancel_fee_value":"15.00"}')`,
      [ids.booking, tenantId, parkId, `HS-${suffix}`, ids.unit, ids.occupancy]
    );
    await query(
      `INSERT INTO biz_homestay_stay_credential(id,tenant_id,park_id,booking_id,
          credential_type,credential_label,status)
       VALUES($1,$2,$3,$4,'key','Atomic key','issued')`,
      [ids.credential, tenantId, parkId, ids.booking]
    );
    await query(
      `INSERT INTO biz_homestay_ledger_entry(id,tenant_id,park_id,booking_id,entry_type,
          charge_type,amount,currency,status,reason)
       VALUES($1,$2,$3,$4,'charge','room',100,'CNY','confirmed','room charge')`,
      [ids.sourceLedger, tenantId, parkId, ids.booking]
    );
    await query(
      `INSERT INTO biz_property_approval_request(id,tenant_id,park_id,action_id,source_type,
          source_id,source_expected_version,requester_id,submitter_id,client_idempotency_key,
          business_intent_key,canonical_payload,payload_schema_version,payload_hash,amount,currency,
          policy_id,policy_version,policy_hash,execution_idempotency_key)
       VALUES($1,$2,$3,'homestay.bookings.cancel.request','homestay-booking',$4,1,$5,$5,$6,$7,
          $8::jsonb,1,$9,115,'CNY',$10,1,$9,$11)`,
      [ids.request, tenantId, parkId, ids.booking, ids.actor, `client-${suffix}`,
        `intent-${suffix}`, JSON.stringify(payload), "a".repeat(64), ids.policy, executionKey]
    );
    for (const [ordinal, kind, lineKey, amount, currency, owningTable] of [
      [0, "homestay.booking.cancel", "booking", null, null, "biz_homestay_booking_action_log"],
      [1, "homestay.ledger.waiver", "waiver", "100.00", "CNY", "biz_homestay_ledger_entry"],
      [2, "homestay.ledger.charge", "fee", "15.00", "CNY", "biz_homestay_ledger_entry"]
    ] as const) {
      await query(
        `INSERT INTO biz_property_execution_effect_manifest(tenant_id,park_id,request_id,
            effect_kind,effect_ordinal,effect_line_key,owning_table,owning_unique_name,
            expected_cardinality,line_amount,currency,invariant_hash)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,1,$9,$10,$11)`,
        [tenantId, parkId, ids.request, kind, ordinal, lineKey, owningTable,
          `uq_atomic_${ordinal}`, amount, currency, "b".repeat(64)]
      );
    }

    const baseline = await query(
      `SELECT version,status,tenant_id AS "tenantId",park_id AS "parkId"
         FROM biz_property_occupancy WHERE id=$1`, [ids.occupancy]
    );
    assert.deepEqual(baseline, [{ version: 1, status: "active", tenantId, parkId }]);

    await runner.query("SAVEPOINT returning_shape");
    const rawReturning = await runner.query(
      `UPDATE biz_property_occupancy SET update_time=update_time
        WHERE id=$1 RETURNING id::text AS id`,
      [ids.occupancy]
    ) as [Array<{ id: string }>, number];
    assert.deepEqual(rawReturning, [[{ id: ids.occupancy }], 1],
      "TypeORM Postgres UPDATE RETURNING must expose [rows,rowCount]");
    await runner.query("ROLLBACK TO SAVEPOINT returning_shape");

    const execute = (manager: { query: typeof query }) => service.executeApprovedCancellation({
      manager: manager as never,
      requestId: ids.request,
      executionIdempotencyKey: executionKey,
      canonicalPayload: payload,
      sourceExpectedVersion: 1,
      request: { tenantId, parkId, sourceId: ids.booking, requesterId: ids.actor }
    });

    await runner.query("SAVEPOINT before_success");
    await execute({ query });
    const success = await runner.query(
      `SELECT booking.status AS booking_status, occupancy.status AS occupancy_status,
              credential.status AS credential_status,
              (SELECT count(*)::int FROM biz_homestay_ledger_entry ledger
                WHERE ledger.booking_id=booking.id) AS ledger_count,
              (SELECT count(*)::int FROM biz_homestay_booking_action_log action
                WHERE action.booking_id=booking.id) AS action_count
         FROM biz_homestay_booking booking
         JOIN biz_property_occupancy occupancy ON occupancy.id=booking.occupancy_id
         JOIN biz_homestay_stay_credential credential ON credential.booking_id=booking.id
        WHERE booking.id=$1`, [ids.booking]
    );
    assert.deepEqual(success[0], {
      booking_status: "cancelled",
      occupancy_status: "cancelled",
      credential_status: "void",
      ledger_count: 3,
      action_count: 1
    });
    await runner.query("ROLLBACK TO SAVEPOINT before_success");

    await runner.query("SAVEPOINT before_failure");
    const failingQuery = async (sql: string, parameters?: unknown[]) => {
      const rows = await query(sql, parameters);
      if (sql.includes("UPDATE biz_homestay_booking")) throw new Error("injected-mid-effect-failure");
      return rows;
    };
    await assert.rejects(execute({ query: failingQuery }), /injected-mid-effect-failure/);
    const partial = await runner.query(
      `SELECT booking.status AS booking_status, occupancy.status AS occupancy_status,
              credential.status AS credential_status,
              (SELECT count(*)::int FROM biz_homestay_ledger_entry ledger
                WHERE ledger.booking_id=booking.id) AS ledger_count
         FROM biz_homestay_booking booking
         JOIN biz_property_occupancy occupancy ON occupancy.id=booking.occupancy_id
         JOIN biz_homestay_stay_credential credential ON credential.booking_id=booking.id
        WHERE booking.id=$1`, [ids.booking]
    );
    assert.deepEqual(partial[0], {
      booking_status: "cancelled",
      occupancy_status: "cancelled",
      credential_status: "void",
      ledger_count: 1
    }, "fault injection must occur after state changes and before financial effects");
    await runner.query("ROLLBACK TO SAVEPOINT before_failure");
    const rolledBack = await runner.query(
      `SELECT booking.status AS booking_status, occupancy.status AS occupancy_status,
              credential.status AS credential_status,
              (SELECT count(*)::int FROM biz_homestay_ledger_entry ledger
                WHERE ledger.booking_id=booking.id) AS ledger_count,
              (SELECT count(*)::int FROM biz_homestay_booking_action_log action
                WHERE action.booking_id=booking.id) AS action_count
         FROM biz_homestay_booking booking
         JOIN biz_property_occupancy occupancy ON occupancy.id=booking.occupancy_id
         JOIN biz_homestay_stay_credential credential ON credential.booking_id=booking.id
        WHERE booking.id=$1`, [ids.booking]
    );
    assert.deepEqual(rolledBack[0], {
      booking_status: "confirmed",
      occupancy_status: "active",
      credential_status: "issued",
      ledger_count: 1,
      action_count: 0
    });

    await query(
      `INSERT INTO biz_homestay_ledger_entry(id,tenant_id,park_id,booking_id,entry_type,
          charge_type,amount,currency,status,reason,source_ledger_entry_id)
       VALUES
         ($1,$4,$5,$6,'payment','room',100,'CNY','confirmed','payment',NULL),
         ($2,$4,$5,$6,'refund','room',20,'CNY','confirmed','direct refund',$1),
         ($3,$4,$5,$6,'refund','room',30,'CNY','confirmed','legacy refund',NULL),
         ($7,$4,$5,$6,'payment','room',100,'CNY','confirmed','unrelated payment',NULL)`,
      [ids.paymentSource, ids.directRefund, ids.mappedRefund, tenantId, parkId, ids.booking,
        ids.otherPayment]
    );
    await query(
      `INSERT INTO biz_homestay_legacy_finance_source_map(
          tenant_id,park_id,result_ledger_entry_id,source_ledger_entry_id,
          source_expected_version,currency,mapped_by,mapped_at,reason,evidence_hash)
       VALUES($1,$2,$3,$4,1,'CNY',$5,clock_timestamp(),'verified legacy allocation',$6)`,
      [tenantId, parkId, ids.mappedRefund, ids.paymentSource, ids.actor, "c".repeat(64)]
    );
    const allocationContributors = [
      { id: ids.directRefund, expectedVersion: 1, status: "confirmed", entryType: "refund",
        amount: "20.00", currency: "CNY", allocationKind: "direct" },
      { id: ids.mappedRefund, expectedVersion: 1, status: "confirmed", entryType: "refund",
        amount: "30.00", currency: "CNY", allocationKind: "legacy-mapped" }
    ].sort((left, right) => left.id.localeCompare(right.id));
    const financePayload = {
      bookingId: ids.booking,
      bookingExpectedVersion: 1,
      reason: "must reject overallocation",
      actorName: "PG verifier",
      lines: [{ entryType: "refund", sourceLedgerEntryId: ids.paymentSource,
        sourceExpectedVersion: 1, sourceEntryType: "payment", sourceAmount: "100.00",
        chargeType: "room", amount: "60.00", currency: "CNY",
        paymentRecorderId: null, allocatedAmount: "50.00",
        remainingAvailableBalance: "50.00", allocationContributors }]
    };
    const financeExecutionKey = `pg-finance-${suffix}`;
    await query(
      `INSERT INTO biz_property_approval_request(id,tenant_id,park_id,action_id,source_type,
          source_id,source_expected_version,requester_id,submitter_id,client_idempotency_key,
          business_intent_key,canonical_payload,payload_schema_version,payload_hash,amount,currency,
          policy_id,policy_version,policy_hash,execution_idempotency_key)
       VALUES($1,$2,$3,'homestay.finance.refund-or-waive.request','homestay-booking',$4,1,$5,$5,$6,$7,
          $8::jsonb,1,$9,60,'CNY',$10,1,$9,$11)`,
      [ids.financeRequest, tenantId, parkId, ids.booking, ids.actor, `finance-client-${suffix}`,
        `finance-intent-${suffix}`, JSON.stringify(financePayload), "d".repeat(64),
        randomUUID(), financeExecutionKey]
    );
    await query(
      `INSERT INTO biz_property_execution_effect_manifest(tenant_id,park_id,request_id,
          effect_kind,effect_ordinal,effect_line_key,owning_table,owning_unique_name,
          expected_cardinality,line_amount,currency,invariant_hash)
       VALUES($1,$2,$3,'homestay.ledger.refund',0,$4,'biz_homestay_ledger_entry',
          'uq_homestay_ledger_approval_line',1,60,'CNY',$5)`,
      [tenantId, parkId, ids.financeRequest, `ledger:refund:${ids.paymentSource}`, "e".repeat(64)]
    );
    await assert.rejects(service.executeApprovedFinance({
      manager: { query } as never,
      requestId: ids.financeRequest,
      executionIdempotencyKey: financeExecutionKey,
      canonicalPayload: financePayload,
      sourceExpectedVersion: 1,
      request: { tenantId, parkId, sourceId: ids.booking, requesterId: ids.actor }
    }), /exceeds its source entry/);
    const financeRows = await query(
      `SELECT count(*)::int AS count FROM biz_homestay_ledger_entry
        WHERE tenant_id=$1 AND park_id=$2 AND booking_id=$3 AND entry_type='refund'`,
      [tenantId, parkId, ids.booking]
    );
    assert.deepEqual(financeRows, [{ count: 2 }],
      "direct and mapped legacy allocations must jointly block over-allocation");
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction().catch(() => undefined);
    await runner.release();
    await dataSource.destroy();
  }
});
