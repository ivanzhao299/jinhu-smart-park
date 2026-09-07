import assert from "node:assert/strict";
import test from "node:test";
import { validate } from "class-validator";
import { HomestayTransactionSupportService, type HomestayLedgerSnapshotRow } from "../homestay/homestay-transaction-support.service";
import { CreateLeasingInvoiceDto, LEASING_INVOICE_RECEIVABLE_MAX_SIZE } from "../leasing-invoices/dto/create-leasing-invoice.dto";
import { ApplyLeasingPaymentDto, LEASING_PAYMENT_APPLICATION_MAX_SIZE } from "../leasing-payments/dto/apply-leasing-payment.dto";
import { GenerateReceivablesBatchDto, LEASING_RECEIVABLE_BATCH_MAX_SIZE } from "./dto/generate-receivables.dto";
import { loadLeasingReceivables } from "./leasing-financial-locks";

const uuid = (suffix: number) => `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;

test("leasing batch DTOs reject requests above the fixed statement budget", async () => {
  const generate = Object.assign(new GenerateReceivablesBatchDto(), {
    contract_ids: Array.from({ length: LEASING_RECEIVABLE_BATCH_MAX_SIZE + 1 }, (_, index) => uuid(index + 1)),
    billing_month: "2026-09"
  });
  const payment = Object.assign(new ApplyLeasingPaymentDto(), {
    applications: Array.from({ length: LEASING_PAYMENT_APPLICATION_MAX_SIZE + 1 }, (_, index) => ({
      receivable_id: uuid(index + 1), applied_amount: 1
    }))
  });
  const invoice = Object.assign(new CreateLeasingInvoiceDto(), {
    park_tenant_id: uuid(999), invoice_type: "10", buyer_name: "batch", amount: 51,
    invoice_date: "2026-09-01",
    receivables: Array.from({ length: LEASING_INVOICE_RECEIVABLE_MAX_SIZE + 1 }, (_, index) => ({
      receivable_id: uuid(index + 1), invoice_amount: 1
    }))
  });

  for (const dto of [generate, payment, invoice]) {
    const errors = await validate(dto);
    assert.ok(errors.some((error) => Object.hasOwn(error.constraints ?? {}, "arrayMaxSize")));
  }
});

test("receivable batch loading uses one sorted query for the maximum request size", async () => {
  let statements = 0;
  let ids: string[] = [];
  let order: [string, string] | undefined;
  let locked = false;
  const builder = {
    where: () => builder,
    andWhere: (_sql: string, params?: { receivableIds?: string[] }) => {
      if (params?.receivableIds) ids = params.receivableIds;
      return builder;
    },
    orderBy: (column: string, direction: string) => {
      order = [column, direction];
      return builder;
    },
    setLock: () => {
      locked = true;
      return builder;
    },
    getMany: async () => {
      statements += 1;
      return [];
    }
  };
  const input = Array.from({ length: LEASING_PAYMENT_APPLICATION_MAX_SIZE }, (_, index) => uuid(index + 1)).reverse();
  await loadLeasingReceivables({
    getRepository: () => ({ createQueryBuilder: () => builder })
  } as never, { tenantId: "tenant", parkId: "park" }, input, true);

  assert.equal(statements, 1);
  assert.equal(locked, true);
  assert.deepEqual(order, ["receivable.id", "ASC"]);
  assert.deepEqual(ids, [...input].sort());
});

test("homestay finance snapshots load legacy mappings once for every candidate source", async () => {
  const service = new HomestayTransactionSupportService();
  let statements = 0;
  let parameters: unknown[] = [];
  const sources: HomestayLedgerSnapshotRow[] = [1, 2].map((value) => ({
    id: uuid(value), version: 1, entryType: "payment", chargeType: "room",
    amount: "100.00", currency: "CNY", status: "confirmed",
    sourceLedgerEntryId: null, recordedBy: uuid(90 + value), occurredAt: "2026-09-01T00:00:00Z"
  }));
  const result = await service.homestayFinanceAllocationSnapshots({
    query: async (_sql: string, params: unknown[]) => {
      statements += 1;
      parameters = params;
      return [];
    }
  } as never, { tenantId: "tenant", parkId: "park" }, sources, sources, "refund");

  assert.equal(statements, 1);
  assert.deepEqual(parameters[2], sources.map((source) => source.id));
  assert.equal(result.size, 2);
  assert.equal(result.get(sources[0]!.id)?.allocatedCents, 0n);
});
