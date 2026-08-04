import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { ConflictException } from "@nestjs/common";
import { DataSource } from "typeorm";
import { propertyApprovalCanonicalHash } from "../property-approvals/property-approval.service";
import { HousingPurchaseItemEntity } from "./entities/housing.entities";
import { HousingService } from "./housing.service";
import { HousingHandoverApprovalExecutorService } from "./housing-handover-approval-executor.service";
import { HousingTransactionSupportService } from "./housing-transaction-support.service";

const databaseUrl = process.env.DATABASE_URL;
const hash = (value: unknown) => propertyApprovalCanonicalHash(value as never);

test("DEC-04/05/06 housing approval executors are atomic on PostgreSQL", {
  skip: databaseUrl ? false : "DATABASE_URL is required for PostgreSQL executor coverage"
}, async () => {
  const dataSource = new DataSource({
    type: "postgres", url: databaseUrl, entities: [HousingPurchaseItemEntity]
  });
  await dataSource.initialize();
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  const schema = `housing_effect_${randomUUID().replaceAll("-", "")}`;
  const tenantId = randomUUID();
  const parkId = randomUUID();
  const actorId = randomUUID();
  const support = new HousingTransactionSupportService();
  const service = new HousingService(
    {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
    {} as never, {} as never,
    undefined, undefined, undefined, support, undefined, undefined, undefined, undefined,
    new HousingHandoverApprovalExecutorService(support)
  );
  const query = (sql: string, parameters?: unknown[]) => runner.query(sql, parameters);

  try {
    await query(`CREATE SCHEMA "${schema}"`);
    await runner.startTransaction();
    await query(`SET LOCAL search_path TO "${schema}"`);
    await query(`
      CREATE TABLE biz_housing_lease (
        id uuid PRIMARY KEY, tenant_id uuid NOT NULL, park_id uuid NOT NULL,
        status text NOT NULL, version integer NOT NULL DEFAULT 1, currency text NOT NULL,
        update_by uuid, update_time timestamptz NOT NULL DEFAULT clock_timestamp(), is_deleted boolean NOT NULL DEFAULT false
      );
      CREATE TABLE biz_housing_handover (
        id uuid PRIMARY KEY, tenant_id uuid NOT NULL, park_id uuid NOT NULL, lease_id uuid NOT NULL,
        handover_type text NOT NULL, status text NOT NULL, version integer NOT NULL DEFAULT 1,
        currency text NOT NULL, damage_amount numeric(18,2) NOT NULL, unsettled_amount numeric(18,2) NOT NULL,
        deposit_deduction_amount numeric(18,2) NOT NULL, item_snapshot jsonb NOT NULL DEFAULT '[]',
        meter_readings jsonb NOT NULL DEFAULT '[]', credentials jsonb NOT NULL DEFAULT '[]',
        photo_file_ids jsonb NOT NULL DEFAULT '[]', signature_file_id uuid, handover_at timestamptz,
        update_by uuid, update_time timestamptz NOT NULL DEFAULT clock_timestamp(), is_deleted boolean NOT NULL DEFAULT false,
        approval_execution_key text, approval_effect_kind text, approval_effect_line_key text, approval_effect_hash text
      );
      CREATE TABLE biz_housing_receivable (
        id uuid PRIMARY KEY, tenant_id uuid NOT NULL, park_id uuid NOT NULL, lease_id uuid NOT NULL,
        charge_plan_id uuid, source_type text NOT NULL, source_id uuid, charge_type text NOT NULL,
        period_start date NOT NULL, period_end date NOT NULL, due_date date NOT NULL,
        amount numeric(18,2) NOT NULL, paid_amount numeric(18,2) NOT NULL DEFAULT 0,
        waived_amount numeric(18,2) NOT NULL DEFAULT 0,
        status text NOT NULL, currency text NOT NULL, version integer NOT NULL DEFAULT 1,
        create_by uuid, update_by uuid, update_time timestamptz NOT NULL DEFAULT clock_timestamp(),
        remark text, is_deleted boolean NOT NULL DEFAULT false
      );
      CREATE TABLE biz_housing_ledger_entry (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, park_id uuid NOT NULL,
        lease_id uuid NOT NULL, receivable_id uuid, entry_type text NOT NULL, charge_type text NOT NULL,
        amount numeric(18,2) NOT NULL, currency text NOT NULL, source_type text NOT NULL, source_id uuid,
        status text NOT NULL, reason text, occurred_at timestamptz, version integer NOT NULL DEFAULT 1,
        create_by uuid, update_by uuid, approval_execution_key text, approval_effect_kind text,
        approval_effect_line_key text, approval_effect_hash text, is_deleted boolean NOT NULL DEFAULT false
      );
      CREATE TABLE biz_property_execution_effect_manifest (
        tenant_id uuid NOT NULL, park_id uuid NOT NULL, request_id uuid NOT NULL,
        effect_kind text NOT NULL, effect_ordinal integer NOT NULL, effect_line_key text NOT NULL,
        invariant_hash text NOT NULL, line_amount numeric(18,2), currency text
      );
      CREATE TABLE biz_property_approval_decision (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, park_id uuid NOT NULL,
        request_id uuid NOT NULL, actor_id uuid NOT NULL, decision text NOT NULL, decided_at timestamptz NOT NULL
      );
      CREATE TABLE biz_housing_lease_effect_audit (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, park_id uuid, approval_request_id uuid,
        action_id text, effect_kind text, approval_execution_key text, effect_line_key text, actor_id uuid,
        occurred_at timestamptz, effect_hash text, lease_id uuid, handover_id uuid, occupancy_id uuid,
        from_status text, to_status text, reason text, source_expected_version integer,
        resulting_version integer, checkout_at timestamptz, occupancy_source_expected_version integer,
        occupancy_resulting_version integer
      );
      CREATE TABLE biz_housing_purchase (
        id uuid PRIMARY KEY, tenant_id uuid NOT NULL, park_id uuid NOT NULL, approval_status text NOT NULL,
        payment_status text NOT NULL, version integer NOT NULL DEFAULT 1, currency text NOT NULL,
        remark text, update_by uuid, update_time timestamptz NOT NULL DEFAULT clock_timestamp(),
        is_deleted boolean NOT NULL DEFAULT false
      );
      CREATE TABLE biz_housing_purchase_item (
        id uuid PRIMARY KEY, tenant_id uuid NOT NULL, park_id uuid NOT NULL, purchase_id uuid NOT NULL,
        amount numeric(18,2) NOT NULL, version integer NOT NULL DEFAULT 1, transferred_receivable_id uuid,
        update_by uuid, update_time timestamptz NOT NULL DEFAULT clock_timestamp(),
        is_deleted boolean NOT NULL DEFAULT false
      );
      CREATE TABLE biz_housing_purchase_transfer_effect_audit (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, park_id uuid, approval_request_id uuid,
        action_id text, effect_kind text, approval_execution_key text, effect_line_key text, actor_id uuid,
        occurred_at timestamptz, effect_hash text, purchase_id uuid, purchase_item_id uuid,
        from_purchase_id uuid, to_lease_id uuid, to_receivable_id uuid, currency text,
        purchase_source_expected_version integer, purchase_resulting_version integer,
        item_source_expected_version integer, item_resulting_version integer,
        item_amount numeric(18,2), reason text
      );
      CREATE TABLE biz_housing_purchase_effect_audit (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, park_id uuid, approval_request_id uuid,
        action_id text, effect_kind text, approval_execution_key text, effect_line_key text, actor_id uuid,
        occurred_at timestamptz, effect_hash text, purchase_id uuid, transition text,
        before_approval_status text, after_approval_status text, before_payment_status text,
        after_payment_status text, reason text, source_expected_version integer, resulting_version integer
      )
    `);

    const leaseId = randomUUID();
    const handoverId = randomUUID();
    const checkoutReceivableId = randomUUID();
    const handoverRequestId = randomUUID();
    await query(`INSERT INTO biz_housing_lease(id,tenant_id,park_id,status,version,currency)
      VALUES($1,$2,$3,'active',6,'CNY')`, [leaseId, tenantId, parkId]);
    await query(`INSERT INTO biz_housing_handover(
      id,tenant_id,park_id,lease_id,handover_type,status,version,currency,damage_amount,
      unsettled_amount,deposit_deduction_amount) VALUES($1,$2,$3,$4,'move_out','draft',1,'CNY',80,20,30)`,
    [handoverId, tenantId, parkId, leaseId]);
    const depositId = randomUUID();
    await query(`INSERT INTO biz_housing_ledger_entry(
      id,tenant_id,park_id,lease_id,entry_type,charge_type,amount,currency,source_type,status)
      VALUES($1,$2,$3,$4,'deposit_receipt','deposit',100,'CNY','manual','confirmed')`,
    [depositId, tenantId, parkId, leaseId]);
    const contributors = [{ id: depositId, version: 1, entryType: "deposit_receipt", amount: "100.00",
      currency: "CNY", status: "confirmed", receivableId: null, sourceType: "manual", sourceId: null }];
    const handoverPayload = {
      handoverId, leaseId, leaseExpectedVersion: 6, fromLeaseStatus: "active", reason: "checkout",
      itemSnapshotHash: hash([]), meterReadingsHash: hash([]), credentialsHash: hash([]),
      photoFileIdsHash: hash([]), signatureFileId: null, checkoutReceivableMode: "new",
      checkoutReceivableId, checkoutReceivableExpectedVersion: null,
      checkoutReceivableOriginalAmount: "0.00", checkoutReceivableOriginalPaidAmount: "0.00",
      checkoutReceivableOriginalWaivedAmount: "0.00", checkoutReceivableOriginalStatus: "absent",
      checkoutReceivableAmount: "100.00", checkoutReceivablePaidAmount: "30.00",
      checkoutReceivableWaivedAmount: "0.00", checkoutReceivablePeriodStart: "2026-08-03",
      checkoutReceivablePeriodEnd: "2026-08-04", checkoutReceivableDueDate: "2026-08-03",
      depositBalance: "100.00", depositContributors: contributors,
      depositContributorsHash: hash(contributors), currency: "CNY",
      deductions: [{ itemId: handoverId, amount: "30.00", currency: "CNY" }]
    };
    for (const [ordinal, kind, lineKey, amount] of [
      [0, "housing.handover.complete.financial", `handover:${handoverId}`, null],
      [1, "housing.receivable.checkout", `receivable:${checkoutReceivableId}`, "100.00"],
      [2, "housing.ledger.deduction", `deduction:${handoverId}`, "30.00"]
    ] as const) await query(`INSERT INTO biz_property_execution_effect_manifest
      (tenant_id,park_id,request_id,effect_kind,effect_ordinal,effect_line_key,invariant_hash,line_amount,currency)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,CASE WHEN $8::numeric IS NULL THEN NULL ELSE 'CNY' END)`,
    [tenantId, parkId, handoverRequestId, kind, ordinal, lineKey, "a".repeat(64), amount]);
    const executeHandover = (manager: { query: typeof query }, expectedVersion = 1) =>
      service.executeApprovedMoveOutHandover({ manager: manager as never, requestId: handoverRequestId,
        executionIdempotencyKey: `handover-${handoverId}`, canonicalPayload: handoverPayload,
        sourceExpectedVersion: expectedVersion,
        request: { tenantId, parkId, sourceId: handoverId, requesterId: actorId } });

    await query("SAVEPOINT handover_success");
    await executeHandover({ query });
    assert.deepEqual((await query(`SELECT status,version FROM biz_housing_handover WHERE id=$1`, [handoverId]))[0],
      { status: "completed", version: 2 });
    assert.deepEqual((await query(`SELECT amount::text,paid_amount::text FROM biz_housing_receivable WHERE id=$1`,
      [checkoutReceivableId]))[0], { amount: "100.00", paid_amount: "30.00" });
    assert.equal(Number((await query(`SELECT count(*) FROM biz_housing_lease_effect_audit`))[0].count), 1);
    await assert.rejects(executeHandover({ query }), ConflictException);
    assert.equal(Number((await query(`SELECT count(*) FROM biz_housing_lease_effect_audit`))[0].count), 1);
    await query("ROLLBACK TO SAVEPOINT handover_success");

    await query("SAVEPOINT handover_failure");
    const failAfterLedger = async (sql: string, parameters?: unknown[]) => {
      const rows = await query(sql, parameters);
      if (sql.includes("INSERT INTO biz_housing_ledger_entry")) throw new Error("injected-handover-failure");
      return rows;
    };
    await assert.rejects(executeHandover({ query: failAfterLedger }), /injected-handover-failure/);
    assert.equal(Number((await query(`SELECT count(*) FROM biz_housing_receivable`))[0].count), 1);
    assert.equal(Number((await query(`SELECT count(*) FROM biz_housing_ledger_entry`))[0].count), 2);
    await query("ROLLBACK TO SAVEPOINT handover_failure");
    assert.equal(Number((await query(`SELECT count(*) FROM biz_housing_receivable`))[0].count), 0);
    assert.equal(Number((await query(`SELECT count(*) FROM biz_housing_ledger_entry`))[0].count), 1);
    assert.equal(Number((await query(`SELECT count(*) FROM biz_housing_lease_effect_audit`))[0].count), 0);
    await assert.rejects(executeHandover({ query }, 2), ConflictException);
    assert.equal(Number((await query(`SELECT count(*) FROM biz_housing_receivable`))[0].count), 0);

    const purchaseId = randomUUID();
    const itemIds = [randomUUID(), randomUUID()].sort();
    const transferReceivableId = randomUUID();
    const transferRequestId = randomUUID();
    await query(`INSERT INTO biz_housing_purchase(id,tenant_id,park_id,approval_status,payment_status,version,currency)
      VALUES($1,$2,$3,'approved','paid',9,'CNY')`, [purchaseId, tenantId, parkId]);
    await query(`INSERT INTO biz_housing_purchase_item(id,tenant_id,park_id,purchase_id,amount,version)
      VALUES($1,$3,$4,$5,10,2),($2,$3,$4,$5,20,4)`, [itemIds[0], itemIds[1], tenantId, parkId, purchaseId]);
    for (const [ordinal, kind, lineKey, amount] of [
      [0, "housing.purchase.transfer", `item:${itemIds[0]}`, null],
      [1, "housing.purchase.transfer", `item:${itemIds[1]}`, null],
      [2, "housing.receivable.purchase.transfer", `receivable:purchase-transfer:${transferReceivableId}`, "30.00"]
    ] as const) await query(`INSERT INTO biz_property_execution_effect_manifest
      (tenant_id,park_id,request_id,effect_kind,effect_ordinal,effect_line_key,invariant_hash,line_amount,currency)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,CASE WHEN $8::numeric IS NULL THEN NULL ELSE 'CNY' END)`,
    [tenantId, parkId, transferRequestId, kind, ordinal, lineKey, "b".repeat(64), amount]);
    const transferPayload = {
      purchaseId, leaseId, leaseExpectedVersion: 6, targetReceivableId: transferReceivableId,
      targetReceivableMode: "new", targetReceivableExpectedVersion: null,
      targetReceivableOriginalAmount: "0.00", targetReceivableOriginalPaidAmount: "0.00",
      targetReceivableOriginalWaivedAmount: "0.00", targetReceivableOriginalStatus: "absent",
      targetReceivablePeriodStart: "2026-08-01", targetReceivablePeriodEnd: "2026-08-02",
      targetReceivableDueDate: "2026-08-31", targetReceivableSourceType: "purchase_transfer",
      targetReceivableSourceId: purchaseId, targetReceivableChargeType: "purchase_recharge",
      aggregateDeltaAmount: "30.00", currency: "CNY", reason: "transfer",
      items: [
        { purchaseItemId: itemIds[0], expectedVersion: 2, amount: "10.00", currency: "CNY", transferredReceivableId: null },
        { purchaseItemId: itemIds[1], expectedVersion: 4, amount: "20.00", currency: "CNY", transferredReceivableId: null }
      ]
    };
    const executeTransfer = (
      manager: { query: typeof query },
      payload: Readonly<Record<string, unknown>> = transferPayload
    ) =>
      service.executeApprovedPurchaseTransfer({ manager: manager as never, requestId: transferRequestId,
        executionIdempotencyKey: `transfer-${purchaseId}`, canonicalPayload: payload,
        sourceExpectedVersion: 9,
        request: { tenantId, parkId, sourceId: purchaseId, requesterId: actorId } });

    await query("SAVEPOINT transfer_success");
    await executeTransfer({ query });
    assert.deepEqual(await query(`SELECT version,transferred_receivable_id::text AS rid
      FROM biz_housing_purchase_item ORDER BY id`), [
      { version: 3, rid: transferReceivableId }, { version: 5, rid: transferReceivableId }
    ]);
    assert.equal(Number((await query(`SELECT count(*) FROM biz_housing_purchase_transfer_effect_audit`))[0].count), 2);
    assert.equal((await query(`SELECT amount::text FROM biz_housing_receivable WHERE id=$1`, [transferReceivableId]))[0].amount, "30.00");
    await assert.rejects(executeTransfer({ query }), ConflictException);
    assert.equal(Number((await query(`SELECT count(*) FROM biz_housing_purchase_transfer_effect_audit`))[0].count), 2);
    await query("ROLLBACK TO SAVEPOINT transfer_success");

    await query("SAVEPOINT transfer_failure");
    let audits = 0;
    const failAfterFirstAudit = async (sql: string, parameters?: unknown[]) => {
      const rows = await query(sql, parameters);
      if (sql.includes("INSERT INTO biz_housing_purchase_transfer_effect_audit") && ++audits === 1) {
        throw new Error("injected-transfer-failure");
      }
      return rows;
    };
    await assert.rejects(executeTransfer({ query: failAfterFirstAudit }), /injected-transfer-failure/);
    assert.equal(Number((await query(`SELECT count(*) FROM biz_housing_purchase_transfer_effect_audit`))[0].count), 1);
    await query("ROLLBACK TO SAVEPOINT transfer_failure");
    assert.equal(Number((await query(`SELECT count(*) FROM biz_housing_purchase_transfer_effect_audit`))[0].count), 0);
    assert.equal(Number((await query(`SELECT count(*) FROM biz_housing_receivable`))[0].count), 0);
    assert.deepEqual(await query(`SELECT version,transferred_receivable_id FROM biz_housing_purchase_item ORDER BY id`), [
      { version: 2, transferred_receivable_id: null }, { version: 4, transferred_receivable_id: null }
    ]);

    const existingId = randomUUID();
    await query(`INSERT INTO biz_housing_receivable(id,tenant_id,park_id,lease_id,source_type,source_id,
      charge_type,period_start,period_end,due_date,amount,paid_amount,waived_amount,status,currency)
      VALUES($1,$2,$3,$4,'purchase_transfer',$5,'purchase_recharge','2026-08-01','2026-08-02',
      '2026-08-31',40,5,0,'partial','CNY')`, [existingId, tenantId, parkId, leaseId, purchaseId]);
    await query(`UPDATE biz_property_execution_effect_manifest SET effect_line_key=$2
      WHERE request_id=$1 AND effect_kind='housing.receivable.purchase.transfer'`, [transferRequestId,
      `receivable:purchase-transfer:${existingId}`]);
    const existingPayload = { ...transferPayload, targetReceivableId: existingId,
      targetReceivableMode: "existing", targetReceivableExpectedVersion: 1,
      targetReceivableOriginalAmount: "40.00", targetReceivableOriginalPaidAmount: "5.00",
      targetReceivableOriginalWaivedAmount: "0.00", targetReceivableOriginalStatus: "partial" };
    await query("SAVEPOINT transfer_existing");
    await executeTransfer({ query }, existingPayload);
    assert.deepEqual((await query(`SELECT amount::text,version FROM biz_housing_receivable WHERE id=$1`, [existingId]))[0],
      { amount: "70.00", version: 2 });
    await query("ROLLBACK TO SAVEPOINT transfer_existing");

    const lifecyclePurchaseId = randomUUID();
    const lifecycleRequestId = randomUUID();
    await query(`INSERT INTO biz_housing_purchase(id,tenant_id,park_id,approval_status,payment_status,version,currency)
      VALUES($1,$2,$3,'approved','paid',4,'CNY')`, [lifecyclePurchaseId, tenantId, parkId]);
    await query(`INSERT INTO biz_property_execution_effect_manifest
      (tenant_id,park_id,request_id,effect_kind,effect_ordinal,effect_line_key,invariant_hash)
      VALUES($1,$2,$3,'housing.purchase.lifecycle',0,$4,$5)`,
    [tenantId, parkId, lifecycleRequestId, `purchase:${lifecyclePurchaseId}`, "c".repeat(64)]);
    await query(`INSERT INTO biz_property_approval_decision(tenant_id,park_id,request_id,actor_id,decision,decided_at)
      VALUES($1,$2,$3,$4,'approve',clock_timestamp())`, [tenantId, parkId, lifecycleRequestId, actorId]);
    const lifecycle = (payload: Record<string, unknown>, version = 4) =>
      service.executeApprovedPurchaseLifecycle({ manager: runner.manager, requestId: lifecycleRequestId,
        executionIdempotencyKey: `lifecycle-${lifecyclePurchaseId}`, canonicalPayload: payload,
        sourceExpectedVersion: version,
        request: { tenantId, parkId, sourceId: lifecyclePurchaseId, requesterId: randomUUID() } });
    const refundPayload = { purchaseId: lifecyclePurchaseId, transition: "refund",
      beforeApprovalStatus: "approved", afterApprovalStatus: "approved",
      beforePaymentStatus: "paid", afterPaymentStatus: "refunded", reason: "refund" };
    const paidVoidPayload = { purchaseId: lifecyclePurchaseId, transition: "void-approved",
      beforeApprovalStatus: "approved", afterApprovalStatus: "void",
      beforePaymentStatus: "paid", afterPaymentStatus: "paid", reason: "invalid paid void" };
    await assert.rejects(lifecycle(paidVoidPayload), /purchase transition changed/);
    assert.deepEqual((await query(`SELECT approval_status,payment_status,version FROM biz_housing_purchase WHERE id=$1`,
      [lifecyclePurchaseId]))[0], { approval_status: "approved", payment_status: "paid", version: 4 });
    assert.equal(Number((await query(`SELECT count(*) FROM biz_housing_purchase_effect_audit`))[0].count), 0);
    await lifecycle(refundPayload);
    assert.deepEqual((await query(`SELECT approval_status,payment_status,version FROM biz_housing_purchase WHERE id=$1`,
      [lifecyclePurchaseId]))[0], { approval_status: "approved", payment_status: "refunded", version: 5 });
    assert.equal((await query(`SELECT actor_id::text AS actor FROM biz_housing_purchase_effect_audit`))[0].actor, actorId);
    await assert.rejects(lifecycle(refundPayload), ConflictException);
    assert.equal(Number((await query(`SELECT count(*) FROM biz_housing_purchase_effect_audit`))[0].count), 1);
    const refundedVoidPayload = { purchaseId: lifecyclePurchaseId, transition: "void-approved",
      beforeApprovalStatus: "approved", afterApprovalStatus: "void",
      beforePaymentStatus: "refunded", afterPaymentStatus: "refunded", reason: "invalid refunded void" };
    await assert.rejects(lifecycle(refundedVoidPayload, 5), /purchase transition changed/);
    await query(`UPDATE biz_housing_purchase SET approval_status='void',payment_status='unpaid',version=6
      WHERE id=$1`, [lifecyclePurchaseId]);
    const repeatedVoidPayload = { purchaseId: lifecyclePurchaseId, transition: "void-void",
      beforeApprovalStatus: "void", afterApprovalStatus: "void",
      beforePaymentStatus: "unpaid", afterPaymentStatus: "unpaid", reason: "repeated void" };
    await assert.rejects(lifecycle(repeatedVoidPayload, 6), /purchase transition changed/);
    assert.equal(Number((await query(`SELECT count(*) FROM biz_housing_purchase_effect_audit`))[0].count), 1);

    await runner.rollbackTransaction();
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await dataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await runner.release();
    await dataSource.destroy();
  }
});
