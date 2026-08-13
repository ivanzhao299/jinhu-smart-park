import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { DataSource } from "typeorm";

const databaseUrl = process.env.DATABASE_URL;

test("000198 enforces finance owners and permits deferred aggregate purchase transfer", {
  skip: !databaseUrl
}, async () => {
  const dataSource = new DataSource({ type: "postgres", url: databaseUrl });
  await dataSource.initialize();
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  const id = Object.fromEntries([
    "building", "floor", "unit", "party", "leaseA", "leaseB", "purchaseA", "purchaseB",
    "itemLegal", "itemWrong", "receivableLegal", "receivableWrong", "receivableLeaseA",
    "request", "actor", "audit", "booking", "financeSource", "mappedLegal", "directLegal",
    "directOver", "mappedOver"
  ].map((key) => [key, randomUUID()])) as Record<string, string>;
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const tenantId = `pg-198-${suffix}`;
  const parkId = `pg-198-park-${suffix}`;
  const query = (sql: string, parameters?: unknown[]) => runner.query(sql, parameters);

  try {
    await runner.startTransaction();
    await query(
      `INSERT INTO biz_park(tenant_id,park_id,park_code,park_name)
       VALUES($1,$2,$3,'000198 park')`,
      [tenantId, parkId, `P-${suffix}`]
    );
    await query(
      `INSERT INTO biz_building(id,tenant_id,park_id,building_code,building_name)
       VALUES($1,$2,$3,$4,'000198 building')`,
      [id.building, tenantId, parkId, `B-${suffix}`]
    );
    await query(
      `INSERT INTO biz_floor(id,tenant_id,park_id,building_id,floor_code,floor_no,floor_name)
       VALUES($1,$2,$3,$4,$5,1,'000198 floor')`,
      [id.floor, tenantId, parkId, id.building, `F-${suffix}`]
    );
    await query(
      `INSERT INTO biz_unit(id,tenant_id,park_id,unit_code,building_id,floor_id,unit_name,
          usage_type,unit_area,use_area,rental_status,fitting_status)
       VALUES($1,$2,$3,$4,$5,$6,'000198 unit',1,40,40,1,1)`,
      [id.unit, tenantId, parkId, `U-${suffix}`, id.building, id.floor]
    );
    await query(
      `INSERT INTO biz_party(id,tenant_id,park_id,party_type,display_name,source_domain)
       VALUES($1,$2,$3,'person','000198 tenant','housing_rental')`,
      [id.party, tenantId, parkId]
    );
    for (const leaseId of [id.leaseA!, id.leaseB!]) {
      await query(
        `INSERT INTO biz_housing_lease(id,tenant_id,park_id,lease_code,unit_id,tenant_party_id,
            status,start_date,end_date,monthly_rent,deposit_amount,first_due_date,currency)
         VALUES($1,$2,$3,$4,$5,$6,'active','2026-01-01','2026-12-31',1000,1000,
            '2026-01-01','CNY')`,
        [leaseId, tenantId, parkId, `LEASE-${leaseId.slice(0, 8)}`, id.unit, id.party]
      );
    }
    for (const purchaseId of [id.purchaseA!, id.purchaseB!]) {
      await query(
        `INSERT INTO biz_housing_purchase(id,tenant_id,park_id,purchase_code,unit_id,vendor_name,
            purchase_date,cost_category,total_amount,approval_status,payment_status,currency)
         VALUES($1,$2,$3,$4,$5,'000198 vendor','2026-01-01','supplies',100,
            'approved','unpaid','CNY')`,
        [purchaseId, tenantId, parkId, `PUR-${purchaseId.slice(0, 8)}`, id.unit]
      );
    }
    for (const [itemId, purchaseId] of [
      [id.itemLegal, id.purchaseA], [id.itemWrong, id.purchaseA]
    ]) {
      await query(
        `INSERT INTO biz_housing_purchase_item(id,tenant_id,park_id,purchase_id,item_name,
            quantity,unit,unit_price,amount)
         VALUES($1,$2,$3,$4,'000198 item',1,'piece',50,50)`,
        [itemId, tenantId, parkId, purchaseId]
      );
    }
    await query(
      `INSERT INTO biz_property_approval_request(id,tenant_id,park_id,action_id,source_type,
          source_id,source_expected_version,requester_id,submitter_id,client_idempotency_key,
          business_intent_key,canonical_payload,payload_schema_version,payload_hash,amount,currency,
          policy_id,policy_version,policy_hash,execution_idempotency_key)
       VALUES($1,$2,$3,'housing.purchases.transfer.request','housing-purchase',$4,1,$5,$5,$6,$7,
          '{}'::jsonb,1,$8,50,'CNY',$9,1,$8,$10)`,
      [id.request, tenantId, parkId, id.purchaseA, id.actor, `client-${suffix}`,
        `intent-${suffix}`, "a".repeat(64), randomUUID(), `execution-${suffix}`]
    );

    await query(
      `UPDATE biz_housing_purchase_item SET transferred_receivable_id=$1
        WHERE id=$2`,
      [id.receivableLegal, id.itemLegal]
    );
    await query(
      `INSERT INTO biz_housing_purchase_transfer_effect_audit(
          tenant_id,park_id,approval_request_id,action_id,effect_kind,approval_execution_key,
          effect_line_key,actor_id,occurred_at,effect_hash,purchase_id,purchase_item_id,
          from_purchase_id,to_lease_id,to_receivable_id,currency,purchase_source_expected_version,
          purchase_resulting_version,item_source_expected_version,item_resulting_version,
          item_amount,reason)
       VALUES($1,$2,$3,'housing.purchases.transfer.request','housing.purchase.transfer',$4,$5,$6,
          clock_timestamp(),$7,$8,$9,$8,$10,$11,'CNY',1,2,1,2,50,'legal deferred transfer')`,
      [tenantId, parkId, id.request, `execution-${suffix}`, `item:${id.itemLegal}`,
        id.actor, "b".repeat(64), id.purchaseA, id.itemLegal, id.leaseA, id.receivableLegal]
    );
    await query(
      `INSERT INTO biz_housing_receivable(id,tenant_id,park_id,lease_id,source_type,source_id,
          charge_type,period_start,period_end,due_date,amount,currency)
       VALUES($1,$2,$3,$4,'purchase_transfer',$5,'purchase_recharge','2026-01-01',
          '2026-01-02','2026-01-05',50,'CNY')`,
      [id.receivableLegal, tenantId, parkId, id.leaseA, id.purchaseA]
    );
    await query("SET CONSTRAINTS ALL IMMEDIATE");
    const legal = await query(
      `SELECT item.transferred_receivable_id::text AS target,
              audit.to_receivable_id::text AS audit_target
         FROM biz_housing_purchase_item item
         JOIN biz_housing_purchase_transfer_effect_audit audit
           ON audit.purchase_item_id=item.id
        WHERE item.id=$1`, [id.itemLegal]
    );
    assert.deepEqual(legal, [{ target: id.receivableLegal, audit_target: id.receivableLegal }]);

    await query("SAVEPOINT wrong_purchase_owner");
    await query("SET CONSTRAINTS fk_housing_purchase_item_transferred_receivable_owner DEFERRED");
    await query(
      `INSERT INTO biz_housing_receivable(id,tenant_id,park_id,lease_id,source_type,source_id,
          charge_type,period_start,period_end,due_date,amount,currency)
       VALUES($1,$2,$3,$4,'purchase_transfer',$5,'purchase_recharge','2026-02-01',
          '2026-02-02','2026-02-05',50,'CNY')`,
      [id.receivableWrong, tenantId, parkId, id.leaseA, id.purchaseB]
    );
    await query(
      `UPDATE biz_housing_purchase_item SET transferred_receivable_id=$1 WHERE id=$2`,
      [id.receivableWrong, id.itemWrong]
    );
    await assert.rejects(
      query("SET CONSTRAINTS fk_housing_purchase_item_transferred_receivable_owner IMMEDIATE"),
      /foreign key constraint/
    );
    await query("ROLLBACK TO SAVEPOINT wrong_purchase_owner");

    await query(
      `INSERT INTO biz_housing_receivable(id,tenant_id,park_id,lease_id,source_type,source_id,
          charge_type,period_start,period_end,due_date,amount,currency)
       VALUES($1,$2,$3,$4,'manual',$5,'rent','2026-03-01','2026-03-02','2026-03-05',50,'CNY')`,
      [id.receivableLeaseA, tenantId, parkId, id.leaseA, randomUUID()]
    );
    await query("SAVEPOINT wrong_ledger_owner");
    await assert.rejects(query(
      `INSERT INTO biz_housing_ledger_entry(tenant_id,park_id,lease_id,receivable_id,
          entry_type,charge_type,amount,currency,reason)
       VALUES($1,$2,$3,$4,'payment','rent',50,'CNY','wrong lease')`,
      [tenantId, parkId, id.leaseB, id.receivableLeaseA]
    ), /foreign key constraint/);
    await query("ROLLBACK TO SAVEPOINT wrong_ledger_owner");

    await query(
      `INSERT INTO biz_homestay_booking(id,tenant_id,park_id,booking_code,unit_id,status,
          arrival_date,departure_date,currency,room_amount,total_amount,cancellation_policy_snapshot)
       VALUES($1,$2,$3,$4,$5,'confirmed','2026-04-01','2026-04-02','CNY',100,100,'{}')`,
      [id.booking, tenantId, parkId, `HS-${suffix}`, id.unit]
    );
    await query(
      `INSERT INTO biz_homestay_ledger_entry(id,tenant_id,park_id,booking_id,entry_type,
          charge_type,amount,currency,status,reason,source_ledger_entry_id)
       VALUES
         ($1,$5,$6,$7,'payment','room',100,'CNY','confirmed','source',NULL),
         ($2,$5,$6,$7,'refund','room',30,'CNY','confirmed','mapped legal',NULL),
         ($3,$5,$6,$7,'refund','room',60,'CNY','confirmed','direct legal',$1),
         ($4,$5,$6,$7,'refund','room',20,'CNY','confirmed','mapped over',NULL)`,
      [id.financeSource, id.mappedLegal, id.directLegal, id.mappedOver,
        tenantId, parkId, id.booking]
    );
    await query(
      `INSERT INTO biz_homestay_legacy_finance_source_map(
          tenant_id,park_id,result_ledger_entry_id,source_ledger_entry_id,
          source_expected_version,currency,mapped_by,mapped_at,reason,evidence_hash)
       VALUES($1,$2,$3,$4,1,'CNY',$5,clock_timestamp(),'legal mapping',$6)`,
      [tenantId, parkId, id.mappedLegal, id.financeSource, id.actor, "c".repeat(64)]
    );

    await query("SAVEPOINT direct_overallocation");
    await assert.rejects(query(
      `INSERT INTO biz_homestay_ledger_entry(id,tenant_id,park_id,booking_id,entry_type,
          charge_type,amount,currency,status,reason,source_ledger_entry_id)
       VALUES($1,$2,$3,$4,'refund','room',20,'CNY','confirmed','direct over',$5)`,
      [id.directOver, tenantId, parkId, id.booking, id.financeSource]
    ), /exceeds available balance/);
    await query("ROLLBACK TO SAVEPOINT direct_overallocation");

    await query("SAVEPOINT mapped_overallocation");
    await assert.rejects(query(
      `INSERT INTO biz_homestay_legacy_finance_source_map(
          tenant_id,park_id,result_ledger_entry_id,source_ledger_entry_id,
          source_expected_version,currency,mapped_by,mapped_at,reason,evidence_hash)
       VALUES($1,$2,$3,$4,1,'CNY',$5,clock_timestamp(),'mapped over',$6)`,
      [tenantId, parkId, id.mappedOver, id.financeSource, id.actor, "d".repeat(64)]
    ), /exceeds available balance/);
    await query("ROLLBACK TO SAVEPOINT mapped_overallocation");
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction().catch(() => undefined);
    await runner.release();
    await dataSource.destroy();
  }
});
