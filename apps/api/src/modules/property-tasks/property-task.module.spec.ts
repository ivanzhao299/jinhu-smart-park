import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MODULE_METADATA } from "@nestjs/common/constants";
import type { PropertyTaskSourceResolver } from "@jinhu/shared";
import {
  PROPERTY_TASK_SOURCE_RESOLVERS,
  PropertyTaskSourceRegistryProvider
} from "./property-task.registry";
import { PropertyTaskModule } from "./property-task.module";

const SOURCE_RESOLVER = Symbol("SOURCE_RESOLVER");

describe("PropertyTaskModule B-2c source composition", () => {
  it("keeps one registry provider and supplies one frozen registration snapshot", () => {
    const dynamicModule = PropertyTaskModule.composeSources({
      imports: [],
      resolverTokens: [SOURCE_RESOLVER]
    });
    const baseProviders = (Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      PropertyTaskModule
    ) as unknown[] | undefined) ?? [];
    const dynamicProviders = dynamicModule.providers ?? [];
    const registrationsProvider = dynamicProviders.find(
      (provider) => typeof provider === "object"
        && provider !== null
        && "provide" in provider
        && provider.provide === PROPERTY_TASK_SOURCE_RESOLVERS
    );

    assert.equal(baseProviders.filter(
      (provider) => provider === PropertyTaskSourceRegistryProvider
    ).length, 1);
    assert.equal(dynamicProviders.filter(
      (provider) => provider === PropertyTaskSourceRegistryProvider
    ).length, 0);
    assert.ok(registrationsProvider && "useFactory" in registrationsProvider);
    assert.deepEqual(registrationsProvider.inject, [SOURCE_RESOLVER]);

    const resolver = {} as PropertyTaskSourceResolver;
    const registrations = registrationsProvider.useFactory(resolver) as
      readonly PropertyTaskSourceResolver[];
    assert.deepEqual(registrations, [resolver]);
    assert.equal(Object.isFrozen(registrations), true);
  });

  it("fails closed for empty or duplicate explicit composition", () => {
    assert.throws(() => PropertyTaskModule.composeSources({ resolverTokens: [] }));
    assert.throws(() => PropertyTaskModule.composeSources({
      resolverTokens: [SOURCE_RESOLVER, SOURCE_RESOLVER]
    }));
  });
});
