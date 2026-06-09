import assert from "node:assert/strict";
import test from "node:test";
import { type FindOneOptions, type FindManyOptions, type UpdateResult } from "typeorm";
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

  async find(options: FindManyOptions<IdempotencyRequestEntity>): Promise<IdempotencyRequestEntity[]> {
    const now = new Date();
    const take = options.take ?? Number.POSITIVE_INFINITY;
    const records = Array.from(this.records.values())
      .filter((record) => record.expiresAt.getTime() < now.getTime())
      .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime() || a.createdAt.getTime() - b.createdAt.getTime())
      .slice(0, take);
    return records.map((record) => ({ ...record }));
  }

  async update(criteria: { id: string }, partial: Partial<IdempotencyRequestEntity>): Promise<UpdateResult> {
    const record = this.records.get(criteria.id);
    if (!record) {
      return { affected: 0, raw: [], generatedMaps: [], identifiers: [] } as UpdateResult;
    }
    Object.assign(record, partial, { updatedAt: partial.updatedAt ?? new Date() });
    return { affected: 1, raw: [], generatedMaps: [], identifiers: [] } as UpdateResult;
  }

  async delete(criteria?: unknown): Promise<{ affected: number }> {
    let affected = 0;
    const ids = this.extractIds(criteria);
    if (ids.length > 0) {
      for (const id of ids) {
        if (this.records.delete(id)) {
          affected += 1;
        }
      }
      return { affected };
    }
    const now = new Date();
    for (const [id, record] of this.records.entries()) {
      if (record.expiresAt.getTime() < now.getTime()) {
        this.records.delete(id);
        affected += 1;
      }
    }
    return { affected };
  }

  private extractIds(criteria: unknown): string[] {
    if (Array.isArray(criteria)) {
      return criteria.filter((item): item is string => typeof item === "string");
    }
    if (!criteria || typeof criteria !== "object") {
      return [];
    }
    const idValue = (criteria as { id?: unknown }).id;
    if (Array.isArray(idValue)) {
      return idValue.filter((item): item is string => typeof item === "string");
    }
    return typeof idValue === "string" ? [idValue] : [];
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

test("cleanupExpired removes only expired records and respects limit", async () => {
  const { service, repository } = createService();
  const now = new Date();
  const expired1 = repository.create({
    id: "expired-1",
    tenantId: "10000001",
    parkId: "20000001",
    userId: "user-1",
    idempotencyKey: "idem-1",
    requestMethod: "POST",
    requestPath: "/work-orders",
    requestFingerprint: "fp-1",
    status: "succeeded",
    lockedUntil: now,
    expiresAt: new Date(now.getTime() - 10_000)
  });
  const expired2 = repository.create({
    id: "expired-2",
    tenantId: "10000001",
    parkId: "20000001",
    userId: "user-1",
    idempotencyKey: "idem-2",
    requestMethod: "POST",
    requestPath: "/work-orders",
    requestFingerprint: "fp-2",
    status: "succeeded",
    lockedUntil: now,
    expiresAt: new Date(now.getTime() - 5_000)
  });
  const active = repository.create({
    id: "active-1",
    tenantId: "10000001",
    parkId: "20000001",
    userId: "user-1",
    idempotencyKey: "idem-3",
    requestMethod: "POST",
    requestPath: "/work-orders",
    requestFingerprint: "fp-3",
    status: "succeeded",
    lockedUntil: now,
    expiresAt: new Date(now.getTime() + 60_000)
  });
  await repository.save(expired1);
  await repository.save(expired2);
  await repository.save(active);

  const deleted = await service.cleanupExpired(1);
  assert.equal(deleted, 1);

  const remainingExpired = await service.cleanupExpired(10);
  assert.equal(remainingExpired, 1);

  const noDelete = await service.cleanupExpired(10);
  assert.equal(noDelete, 0);
});
