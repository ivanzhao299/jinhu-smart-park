import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import test from "node:test";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { PropertyOccupancyAdapter } from "./property-occupancy.adapter";
import {
  PROPERTY_OCCUPANCY_PORT
} from "./property-occupancy.port";
import { PropertyOccupanciesService } from "./property-occupancies.service";
import { PropertyOperationsModule } from "./property-operations.module";

type Provider = { provide?: unknown; useExisting?: unknown } | unknown;

function productionSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return productionSources(path);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".spec.ts")
      ? [path]
      : [];
  });
}

test("PropertyOperationsModule exposes the canonical occupancy port through one adapter", () => {
  const providers = (
    Reflect.getMetadata(MODULE_METADATA.PROVIDERS, PropertyOperationsModule) ?? []
  ) as Provider[];
  const exports = (
    Reflect.getMetadata(MODULE_METADATA.EXPORTS, PropertyOperationsModule) ?? []
  ) as unknown[];
  const bindings = providers.filter(
    (provider): provider is { provide: unknown; useExisting: unknown } =>
      typeof provider === "object"
      && provider !== null
      && (provider as { provide?: unknown }).provide === PROPERTY_OCCUPANCY_PORT
  );

  assert.deepEqual(bindings, [{
    provide: PROPERTY_OCCUPANCY_PORT,
    useExisting: PropertyOccupancyAdapter
  }]);
  assert.equal(
    providers.filter((provider) => provider === PropertyOccupancyAdapter).length,
    1
  );
  assert.equal(
    providers.filter((provider) => provider === PropertyOccupanciesService).length,
    1
  );
  assert.equal(exports.filter((entry) => entry === PROPERTY_OCCUPANCY_PORT).length, 1);
  assert.equal(exports.includes(PropertyOccupancyAdapter), false);
  assert.equal(exports.includes(PropertyOccupanciesService), false);
});

test("Homestay and Housing inject only the canonical occupancy port", () => {
  const domainSources = [
    ...productionSources(resolve(__dirname, "../homestay")),
    ...productionSources(resolve(__dirname, "../housing"))
  ];
  const oldServiceConsumers = domainSources.filter((path) =>
    readFileSync(path, "utf8").includes("PropertyOccupanciesService")
  );
  assert.deepEqual(oldServiceConsumers, []);

  const portConsumers = domainSources.filter((path) =>
    readFileSync(path, "utf8").includes("PropertyOccupancyPort")
  );
  assert.deepEqual(
    portConsumers.map((path) => basename(path)).sort(),
    [
      "homestay-booking-command.service.ts",
      "homestay-stay-command.service.ts",
      "homestay-turnover.service.ts",
      "homestay.service.ts",
      "housing-lease-command.service.ts",
      "housing.service.ts"
    ]
  );
  for (const path of portConsumers) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /@Inject\(PROPERTY_OCCUPANCY_PORT\)/u, path);
    assert.doesNotMatch(source, /property-occupancies\.service/u, path);
  }
});

test("PropertyOccupancyAdapter forwards the complete transaction closure unchanged", async () => {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const results = {
    create: { id: "created" },
    activate: { id: "activated" },
    release: { id: "released" },
    replace: { id: "replaced" }
  };
  const service = {
    createInTransaction: (...args: unknown[]) => {
      calls.push({ method: "create", args });
      return Promise.resolve(results.create);
    },
    activateInTransaction: (...args: unknown[]) => {
      calls.push({ method: "activate", args });
      return Promise.resolve(results.activate);
    },
    releaseInTransaction: (...args: unknown[]) => {
      calls.push({ method: "release", args });
      return Promise.resolve(results.release);
    },
    replacePeriodInTransaction: (...args: unknown[]) => {
      calls.push({ method: "replace", args });
      return Promise.resolve(results.replace);
    }
  } as unknown as PropertyOccupanciesService;
  const adapter = new PropertyOccupancyAdapter(service);
  const manager = { name: "manager" };
  const scope = { tenantId: "tenant", parkId: "park" };
  const actor = { sub: "actor" };
  const dto = { unit_id: "unit" };
  const exclude = { sourceType: "booking", sourceId: "source" };
  const expected = {
    sourceDomain: "homestay",
    sourceType: "booking",
    sourceId: "source",
    startAt: "2026-08-04T00:00:00.000Z",
    endAt: "2026-08-05T00:00:00.000Z",
    status: "held" as const
  };

  assert.equal(
    await adapter.createInTransaction(
      manager as never,
      scope,
      actor as never,
      dto as never,
      "idempotency-key",
      exclude
    ),
    results.create
  );
  assert.equal(
    await adapter.activateInTransaction(manager as never, scope, actor as never, "occupancy"),
    results.activate
  );
  assert.equal(
    await adapter.releaseInTransaction(
      manager as never,
      scope,
      actor as never,
      "occupancy",
      "checkout",
      "completed"
    ),
    results.release
  );
  assert.equal(
    await adapter.replacePeriodInTransaction(
      manager as never,
      scope,
      actor as never,
      "occupancy",
      expected,
      "2026-08-05T00:00:00.000Z",
      "2026-08-06T00:00:00.000Z",
      "2026-08-04T01:00:00.000Z"
    ),
    results.replace
  );

  assert.deepEqual(calls, [
    {
      method: "create",
      args: [manager, scope, actor, dto, "idempotency-key", exclude]
    },
    { method: "activate", args: [manager, scope, actor, "occupancy"] },
    {
      method: "release",
      args: [manager, scope, actor, "occupancy", "checkout", "completed"]
    },
    {
      method: "replace",
      args: [
        manager,
        scope,
        actor,
        "occupancy",
        expected,
        "2026-08-05T00:00:00.000Z",
        "2026-08-06T00:00:00.000Z",
        "2026-08-04T01:00:00.000Z"
      ]
    }
  ]);
});
