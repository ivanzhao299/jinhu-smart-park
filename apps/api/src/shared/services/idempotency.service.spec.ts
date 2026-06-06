import assert from "node:assert/strict";
import test from "node:test";
import { type FindOneOptions, type UpdateResult } from "typeorm";
import { IdempotencyRequestEntity } from "../entities/idempotency-request.entity";
import { IdempotencyService, type IdempotencyBeginContext } from "./idempotency.service";

class InMemoryIdempotencyRepository {
  private readonly records = new Map<string, IdempotencyRequestEntity>();

  create(partial: Partial<IdempotencyRequestEntity>): IdempotencyRequestEntity {
    return {
      id: partial.id ?? `id-${this.records.size + 1}`,
      tenantId: partial.tenantId ?? "",
      parkId: partial.parkId ?? "",
      userId: partial.userId ?? "",
      idempotencyKey: partial.idempotencyKey ?? "",
      requestMethod: partial.requestMethod ?? "POST",
      requestPath: partial.requestPath ?? "",
      requestFingerprint: partial.requestFingerprint ?? "",
      status: partial.status ?? "processing",
      responseStatus: partial.responseStatus ?? null,
      responseBody: partial.responseBody ?? null,
      errorCode: partial.errorCode ?? null,
      lockedUntil: partial.lockedUntil ?? new Date(),
      expiresAt: partial.expiresAt ?? new Date(),
      createdAt: partial.createdAt ?? new Date(),
      updatedAt: partial.updatedAt ?? new Date()
    };
  }

  async save(entity: IdempotencyRequestEntity): Promise<IdempotencyRequestEntity> {
    this.records.set(entity.id, entity);
    return entity;
  }

  async findOne(options: FindOneOptions<IdempotencyRequestEntity>): Promise<IdempotencyRequestEntity | null> {
    const where = options.where ?? {};
    const record = Array.from(this.records.values()).find((candidate) =>
      Object.entries(where).every(([key, value]) => ((candidate as unknown) as Record<string, unknown>)[key] === value)
    );
    return record ?? null;
  }

  async update(criteria: { id: string }, partial: Partial<IdempotencyRequestEntity>): Promise<UpdateResult> {
    const record = this.records.get(criteria.id);
    if (!record) {
      return { affected: 0, raw: [], generatedMaps: [], identifiers: [] } as UpdateResult;
    }
    Object.assign(record, partial, { updatedAt: partial.updatedAt ?? new Date() });
    return { affected: 1, raw: [], generatedMaps: [], identifiers: [] } as UpdateResult;
  }

  async delete(): Promise<{ affected: number }> {
    const now = new Date();
    let affected = 0;
    for (const [id, record] of this.records.entries()) {
      if (record.expiresAt.getTime() < now.getTime()) {
        this.records.delete(id);
        affected += 1;
      }
    }
    return { affected };
  }
}

class FakeDataSource {
  constructor(private readonly repository: InMemoryIdempotencyRepository) {}

  async transaction<T>(callback: (manager: { getRepository: () => InMemoryIdempotencyRepository }) => Promise<T>): Promise<T> {
    return callback({
      getRepository: () => this.repository
    });
  }
}

function createService() {
  const repository = new InMemoryIdempotencyRepository();
  const dataSource = new FakeDataSource(repository);
  return {
    service: new IdempotencyService(repository as never, dataSource as never),
    repository
  };
}

function makeContext(overrides: Partial<IdempotencyBeginContext> & { query?: unknown; body?: unknown } = {}): IdempotencyBeginContext {
  return {
    tenantId: "10000001",
    parkId: "20000001",
    userId: "user-1",
    idempotencyKey: "idem-key-1",
    requestMethod: "POST",
    requestPath: "/work-orders",
    requestFingerprint: "fingerprint-1",
    ...overrides
  };
}

test("buildFingerprint is stable for normalized object order", () => {
  const { service } = createService();
  const first = service.buildFingerprint({
    tenantId: "10000001",
    parkId: "20000001",
    userId: "user-1",
    idempotencyKey: "idem-key-1",
    requestMethod: "POST",
    requestPath: "/work-orders",
    query: { b: 2, a: 1 },
    body: { z: { k: 2, j: 1 }, a: [3, { y: 2, x: 1 }] }
  });
  const second = service.buildFingerprint({
    tenantId: "10000001",
    parkId: "20000001",
    userId: "user-1",
    idempotencyKey: "idem-key-1",
    requestMethod: "post",
    requestPath: "/work-orders",
    query: { a: 1, b: 2 },
    body: { a: [3, { x: 1, y: 2 }], z: { j: 1, k: 2 } }
  });

  assert.equal(first, second);
});

test("tryBegin returns cached response after success", async () => {
  const { service } = createService();
  const input = makeContext({
    requestFingerprint: "fp-success"
  });

  const begin = await service.tryBegin(input);
  assert.equal(begin.outcome, "began");
  await service.markSucceeded(begin.request.id, 201, { ok: true, token: "secret" });

  const cached = await service.tryBegin(input);
  assert.equal(cached.outcome, "cached");
  assert.equal(cached.cachedResponse?.responseStatus, 201);
  assert.deepEqual(cached.cachedResponse?.responseBody, { ok: true, token: "***" });
});

test("tryBegin rejects different fingerprint and allows retry after failure", async () => {
  const { service } = createService();
  const input = makeContext({ requestFingerprint: "fp-1" });
  const other = makeContext({ requestFingerprint: "fp-2" });

  const first = await service.tryBegin(input);
  assert.equal(first.outcome, "began");

  const conflict = await service.tryBegin(other);
  assert.equal(conflict.outcome, "conflict");
  assert.equal(conflict.reason, "fingerprint_mismatch");

  await service.markFailed(first.request.id, "HTTP_500");

  const retry = await service.tryBegin(input);
  assert.equal(retry.outcome, "began");
});

test("tryBegin returns processing while lock is still active", async () => {
  const { service } = createService();
  const input = makeContext({ requestFingerprint: "fp-processing" });

  const first = await service.tryBegin(input);
  assert.equal(first.outcome, "began");

  const processing = await service.tryBegin(input);
  assert.equal(processing.outcome, "processing");
  assert.equal(processing.reason, "processing");
});
