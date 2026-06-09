import assert from "node:assert/strict";
import test from "node:test";
import { ConfigService } from "@nestjs/config";
import { IdempotencyCleanupService } from "./idempotency-cleanup.service";
import { IdempotencyService } from "./idempotency.service";

class FakeConfigService {
  constructor(private readonly values: Record<string, unknown>) {}

  get<T = unknown>(key: string): T {
    return this.values[key] as T;
  }
}

function createService(values: Record<string, unknown> = {}, idempotencyService?: Partial<IdempotencyService>) {
  return new IdempotencyCleanupService(
    new FakeConfigService(values) as unknown as ConfigService,
    (idempotencyService ?? { cleanupExpired: async () => 0 }) as IdempotencyService
  );
}

test("disabled cleanup does not register interval", () => {
  const originalSetInterval = global.setInterval;
  const originalClearInterval = global.clearInterval;
  let setIntervalCalls = 0;
  let clearIntervalCalls = 0;
  try {
    global.setInterval = ((() => {
      setIntervalCalls += 1;
      return { unref() {} } as never;
    }) as typeof global.setInterval);
    global.clearInterval = ((() => {
      clearIntervalCalls += 1;
    }) as typeof global.clearInterval);

    const service = createService({ IDEMPOTENCY_CLEANUP_ENABLED: false });
    service.onModuleInit();
    service.onModuleDestroy();

    assert.equal(setIntervalCalls, 0);
    assert.equal(clearIntervalCalls, 0);
  } finally {
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;
  }
});

test("enabled cleanup registers interval and runs cleanup", async () => {
  const originalSetInterval = global.setInterval;
  const originalClearInterval = global.clearInterval;
  const timer = { unref() {} };
  const cleanupCalls: number[] = [];
  try {
    global.setInterval = ((() => timer) as unknown as typeof global.setInterval);
    global.clearInterval = ((received) => {
      assert.equal(received, timer);
    }) as typeof global.clearInterval;

    const service = createService(
      {
        IDEMPOTENCY_CLEANUP_ENABLED: true,
        IDEMPOTENCY_CLEANUP_INTERVAL_MS: 120_000,
        IDEMPOTENCY_CLEANUP_BATCH_SIZE: 7
      },
      {
        cleanupExpired: async (limit: number) => {
          cleanupCalls.push(limit);
          return 3;
        }
      }
    );
    const logger = service as unknown as { logger: { log: (...args: unknown[]) => void; warn: (...args: unknown[]) => void } };
    const logs: string[] = [];
    logger.logger = {
      log: (...args: unknown[]) => {
        logs.push(args.join(" "));
      },
      warn: (...args: unknown[]) => {
        logs.push(args.join(" "));
      }
    };

    service.onModuleInit();
    await service.runCleanup();
    assert.deepEqual(cleanupCalls, [7]);
    assert.ok(logs.some((line) => line.includes("Idempotency cleanup scheduled")));
    assert.ok(logs.some((line) => line.includes("deleted=3")));

    service.onModuleDestroy();
  } finally {
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;
  }
});

test("cleanup errors are logged and do not throw", async () => {
  const originalSetInterval = global.setInterval;
  const originalClearInterval = global.clearInterval;
  try {
    global.setInterval = ((() => ({ unref() {} })) as unknown as typeof global.setInterval);
    global.clearInterval = ((() => undefined) as typeof global.clearInterval);

    const service = createService(
      {
        IDEMPOTENCY_CLEANUP_ENABLED: true,
        IDEMPOTENCY_CLEANUP_INTERVAL_MS: 60_000,
        IDEMPOTENCY_CLEANUP_BATCH_SIZE: 1
      },
      {
        cleanupExpired: async () => {
          throw new Error("boom");
        }
      }
    );
    const logger = service as unknown as { logger: { warn: (...args: unknown[]) => void; log: (...args: unknown[]) => void } };
    const warnings: string[] = [];
    logger.logger = {
      warn: (...args: unknown[]) => {
        warnings.push(args.join(" "));
      },
      log: () => undefined
    };

    service.onModuleInit();
    await service.runCleanup();
    assert.ok(warnings.some((line) => line.includes("Idempotency cleanup failed")));
  } finally {
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;
  }
});
