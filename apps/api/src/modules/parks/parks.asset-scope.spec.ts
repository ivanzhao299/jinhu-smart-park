import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { ANY_MODULES_KEY, MODULES_KEY } from "../../shared/decorators/modules.decorator";
import { ParksController } from "./parks.controller";
import { ParksService } from "./parks.service";

test("canonical park mutations share the asset scope lock and preserve protected sources", () => {
  const source = readFileSync(resolve(__dirname, "parks.service.ts"), "utf8");
  assert.equal((source.match(/this\.dataSource\.transaction\(async \(manager\) =>/g) ?? []).length, 3);
  assert.match(source, /assetScopeLockKey\(item\)/);
  assert.match(source, /\.sort\(\(\[left\], \[right\]\) => left\.localeCompare\(right\)\)/);
  assert.match(source, /lock: \{ mode: "pessimistic_write" \}/);
  assert.match(source, /hasProtectedAssetScope\(manager, scope\)/);
  assert.match(source, /Asset scope requires one active canonical park/);
  assert.match(source, /assertCanonicalSourceSurvives/);
  assert.match(source, /park\.id <> :removedParkId/);
  assert.match(source, /provisionAdditionalPark\(manager, scope, actor, dto\)/);
  assert.match(source, /syncCanonicalAssetProjection\(manager, targetScope, actor\.sub\)/);
  assert.equal((source.match(/await this\.lockMutationScopes\(manager, (?:scope|targetScope), true\)/g) ?? []).length, 3);
  const createBlock = source.slice(source.indexOf("async create("), source.indexOf("async update("));
  assert.match(createBlock, /assertDefaultFallbackMutationAllowed\(scope, actor, parkCode === "JH"\)/);
  assert.ok(createBlock.indexOf("assertTenantParkManager") < createBlock.indexOf("assertTenantParkLimit"));
  assert.doesNotMatch(createBlock, /nextActiveSources/);
  assert.match(source, /Only super administrator can change the default JH fallback/);
  const updateBlock = source.slice(source.indexOf("async update("), source.indexOf("async softDelete("));
  assert.ok(updateBlock.indexOf("lockMutationScopes") < updateBlock.indexOf('lock: { mode: "pessimistic_write" }'));
  const deleteBlock = source.slice(source.indexOf("async softDelete("), source.indexOf("private scopedBuilder"));
  assert.ok(deleteBlock.indexOf("lockMutationScopes") < deleteBlock.indexOf('lock: { mode: "pessimistic_write" }'));
  assert.match(source, /syncCanonicalAssetProjection\(manager, DEFAULT_PLATFORM_SCOPE, actor\.sub\)/);
  assert.match(source, /park\.park_code = 'JH'/);
  assert.match(source, /if \(protectedScope && scopeRemainsActive\) await this\.syncCanonicalAssetProjection\(manager, targetScope, actor\.sub\)/);
  assert.match(source, /if \(defaultScopeProtected && defaultScopeRemainsActive\) \{\s+await this\.syncCanonicalAssetProjection/);
  assert.match(source, /const wasActive = entity\.status === 1/);
  assert.match(source, /const scopeRemainsActive = await this\.hasActiveCanonicalParkSource/);
  assert.match(source, /if \(authorizationProtectedScope && wasActive && saved\.status !== 1 && !scopeRemainsActive\) \{\s+await this\.tenantsService\.reconcileDeactivatedParkAuthorization/);
  assert.match(source, /defaultAuthorizationProtectedScope && !defaultScopeRemainsActive && defaultScopeIsSecondary[\s\S]*reconcileDeactivatedParkAuthorization\(manager, DEFAULT_PLATFORM_SCOPE/);
  assert.match(source, /const targetScopeReactivated = !wasActive && saved\.status === 1/);
  assert.match(source, /if \(authorizationProtectedScope && targetScopeReactivated\) \{\s+await this\.tenantsService\.reconcileReactivatedParkAuthorization/);
  assert.match(source, /if \(targetScopeReactivated\) \{\s+await ensureCodeRuleScopeProvisioned\(manager, targetScope, actor\.sub\)/);
  assert.match(source, /const defaultScopeWasActive = defaultScopeProtected[\s\S]*hasValidCanonicalParkSourceBeforeMutation\(manager, DEFAULT_PLATFORM_SCOPE\)/);
  assert.match(source, /private async hasValidCanonicalParkSourceBeforeMutation[\s\S]*error instanceof ConflictException[\s\S]*return false/);
  assert.match(source, /const defaultScopeReactivated =[\s\S]*defaultScopeProtected[\s\S]*!defaultScopeWasActive[\s\S]*defaultScopeRemainsActive/);
  assert.match(source, /if \(defaultAuthorizationProtectedScope && defaultScopeReactivated\)[\s\S]*reconcileReactivatedParkAuthorization\(manager, DEFAULT_PLATFORM_SCOPE/);
  assert.match(source, /if \(defaultScopeReactivated\) \{\s+await ensureCodeRuleScopeProvisioned\(manager, DEFAULT_PLATFORM_SCOPE, actor\.sub\)/);
  assert.doesNotMatch(source, /!wasActive[\s\S]{0,80}!defaultScopeWasActive/);
  assert.match(source, /const renamesCrossScopeDefaultSource = nextCode !== undefined[\s\S]*entity\.tenantId !== DEFAULT_PLATFORM_SCOPE\.tenantId/);
  assert.match(source, /if \(await hasProtectedAssetScope\(manager, scope\)\)/);
  assert.match(source, /await ensureAssetParkProjection\(manager, scope, actorId\)/);
  assert.match(source, /retireIndependentAssetScope/);
  assert.doesNotMatch(source, /Independent park scope retirement is not supported/);
  assert.match(source, /Asset module must be disabled before park retirement/);
  assert.match(updateBlock, /code === "23503"[\s\S]*active park scope with buildings[\s\S]*ConflictException/);
});

test("park controller writes cross-scope mutations to the target audit scope", () => {
  const source = readFileSync(resolve(__dirname, "parks.controller.ts"), "utf8");
  assert.equal((source.match(/request\.auditScopeOverride = targetScope/g) ?? []).length, 3);
});

test("park deactivation detects a remaining active source in the same scope", async () => {
  const hasActiveSource = (ParksService.prototype as unknown as {
    hasActiveCanonicalParkSource(manager: unknown, scope: unknown): Promise<boolean>;
  }).hasActiveCanonicalParkSource;
  const calls: unknown[] = [];
  const manager = {
    getRepository: () => ({
      find: async () => [{ id: "survivor" }],
      exists: async (options: unknown) => {
        calls.push(options);
        return true;
      }
    })
  };

  assert.equal(await hasActiveSource.call(
    {} as ParksService,
    manager,
    { tenantId: "tenant-a", parkId: "park-a" }
  ), true);
  assert.deepEqual(calls, []);
});

test("park status recovery uses the system module while other park routes remain asset-gated", () => {
  const source = readFileSync(resolve(__dirname, "parks.service.ts"), "utf8");
  assert.deepEqual(Reflect.getMetadata(MODULES_KEY, ParksController), ["asset"]);
  for (const handler of [
    ParksController.prototype.update,
    ParksController.prototype.list,
    ParksController.prototype.detail
  ]) {
    assert.deepEqual(Reflect.getMetadata(MODULES_KEY, handler), []);
    assert.deepEqual(Reflect.getMetadata(ANY_MODULES_KEY, handler), ["asset", "system"]);
  }
  assert.equal(Reflect.getMetadata(MODULES_KEY, ParksController.prototype.create), undefined);
  assert.equal(Reflect.getMetadata(ANY_MODULES_KEY, ParksController.prototype.create), undefined);
  assert.equal(Reflect.getMetadata(MODULES_KEY, ParksController.prototype.remove), undefined);
  assert.equal(Reflect.getMetadata(ANY_MODULES_KEY, ParksController.prototype.remove), undefined);
  assert.match(source, /module\.module_code='asset'[\s\S]*module\.module_code='system'/);
  assert.match(source, /const systemEnabled[\s\S]*const inactiveScopeSystem = !assetEnabled && systemEnabled/);
  assert.match(source, /hasCanonicalActiveAssetParkSource\(manager, scope\)/);
  assert.match(source, /if \(!assetEnabled && !inactiveScopeSystem\)/);
  assert.equal((source.match(/lockMutationScopes\(manager, targetScope, true\);\s*await this\.assertParkModuleAccess\(scope, manager\)/g) ?? []).length, 2);
  assert.match(source, /throw new ForbiddenException\("Tenant module is not authorized"\)/);
});

test("asset-authorized park access does not require a canonical source lookup", async () => {
  const assertParkModuleAccess = (ParksService.prototype as unknown as {
    assertParkModuleAccess(scope: unknown, manager: unknown): Promise<void>;
  }).assertParkModuleAccess;
  const manager = {
    query: async () => [{ moduleCode: "asset" }, { moduleCode: "system" }],
    getRepository: () => {
      throw new Error("canonical source lookup must not run for asset access");
    }
  };

  await assert.doesNotReject(() => assertParkModuleAccess.call(
    {} as ParksService,
    { tenantId: "tenant-a", parkId: "park-a" },
    manager
  ));
});

test("cross-scope protected park retirement requires prior deactivation", async () => {
  const saved: unknown[] = [];
  const entity = {
    id: "park-row-b",
    tenantId: "tenant-a",
    parkId: "park-b",
    parkCode: "PARK-B",
    status: 1,
    isDeleted: false,
    updateBy: null
  };
  const service = Object.assign(Object.create(ParksService.prototype), {
    detail: async () => entity,
    dataSource: {
      transaction: async (callback: (manager: unknown) => Promise<unknown>) => callback({
        getRepository: () => ({
          findOne: async () => entity,
          save: async (value: unknown) => {
            saved.push(value);
            return value;
          }
        })
      })
    },
    lockMutationScopes: async () => undefined,
    assertParkModuleAccess: async () => undefined,
    hasCanonicalProjectionContract: async () => true
  }) as ParksService;

  await assert.rejects(
    () => service.softDelete(
      { tenantId: "tenant-a", parkId: "park-a" },
      { sub: "actor-a", tenantId: "tenant-a", roles: ["TENANT_ADMIN"], permissions: [] } as never,
      "park-row-b"
    ),
    /Park must be inactive before retirement/
  );
  assert.deepEqual(saved, []);
  assert.equal(entity.isDeleted, false);
});

test("cross-scope park retirement requires prior deactivation even without an asset projection", async () => {
  const entity = {
    id: "park-row-b",
    tenantId: "tenant-a",
    parkId: "park-b",
    parkCode: "PARK-B",
    status: 1,
    isDeleted: false,
    updateBy: null
  };
  const service = Object.assign(Object.create(ParksService.prototype), {
    detail: async () => entity,
    dataSource: {
      transaction: async (callback: (manager: unknown) => Promise<unknown>) => callback({
        getRepository: () => ({
          findOne: async () => entity,
          save: async () => {
            throw new Error("active cross-scope park must not be soft-deleted");
          }
        })
      })
    },
    lockMutationScopes: async () => undefined,
    assertParkModuleAccess: async () => undefined,
    hasCanonicalProjectionContract: async () => false
  }) as ParksService;

  await assert.rejects(
    () => service.softDelete(
      { tenantId: "tenant-a", parkId: "park-a" },
      { sub: "actor-a", tenantId: "tenant-a", roles: ["TENANT_ADMIN"], permissions: [] } as never,
      "park-row-b"
    ),
    /Park must be inactive before retirement/
  );
  assert.equal(entity.isDeleted, false);
});

test("inactive cross-scope protected park deletion reaches independent retirement", async () => {
  const retiredScopes: Array<{ scope: unknown; retireAssetProjection: unknown }> = [];
  const entity = {
    id: "park-row-b",
    tenantId: "tenant-a",
    parkId: "park-b",
    parkCode: "PARK-B",
    status: 0,
    isDeleted: false,
    updateBy: null
  };
  const service = Object.assign(Object.create(ParksService.prototype), {
    detail: async () => entity,
    dataSource: {
      transaction: async (callback: (manager: unknown) => Promise<unknown>) => callback({
        getRepository: () => ({
          findOne: async () => entity,
          save: async (value: unknown) => value
        })
      })
    },
    lockMutationScopes: async () => undefined,
    assertParkModuleAccess: async () => undefined,
    hasCanonicalProjectionContract: async () => true,
    retireIndependentAssetScope: async (_manager: unknown, targetScope: unknown, _actorId: string, retireAssetProjection: boolean) => {
      assert.equal(entity.isDeleted, false);
      retiredScopes.push({ scope: targetScope, retireAssetProjection });
    },
    syncCanonicalAssetProjection: async () => {
      throw new Error("independent retired scope must not resync projection");
    }
  }) as ParksService;

  await assert.doesNotReject(() => service.softDelete(
    { tenantId: "tenant-a", parkId: "park-a" },
    { sub: "actor-a", tenantId: "tenant-a", roles: ["TENANT_ADMIN"], permissions: [] } as never,
    "park-row-b"
  ));
  assert.equal(entity.isDeleted, true);
  assert.equal(entity.updateBy, "actor-a");
  assert.deepEqual(retiredScopes, [{ scope: { tenantId: "tenant-a", parkId: "park-b" }, retireAssetProjection: true }]);
});

test("inactive cross-scope park retirement clears authorization even without asset projection", async () => {
  const retiredScopes: Array<{ scope: unknown; retireAssetProjection: unknown }> = [];
  const entity = {
    id: "park-row-b",
    tenantId: "tenant-a",
    parkId: "park-b",
    parkCode: "PARK-B",
    status: 0,
    isDeleted: false,
    updateBy: null
  };
  const service = Object.assign(Object.create(ParksService.prototype), {
    detail: async () => entity,
    dataSource: {
      transaction: async (callback: (manager: unknown) => Promise<unknown>) => callback({
        getRepository: () => ({
          findOne: async () => entity,
          save: async (value: unknown) => value
        })
      })
    },
    lockMutationScopes: async () => undefined,
    assertParkModuleAccess: async () => undefined,
    hasCanonicalProjectionContract: async () => false,
    retireIndependentAssetScope: async (_manager: unknown, targetScope: unknown, _actorId: string, retireAssetProjection: boolean) => {
      assert.equal(entity.isDeleted, false);
      retiredScopes.push({ scope: targetScope, retireAssetProjection });
    }
  }) as ParksService;

  await assert.doesNotReject(() => service.softDelete(
    { tenantId: "tenant-a", parkId: "park-a" },
    { sub: "actor-a", tenantId: "tenant-a", roles: ["TENANT_ADMIN"], permissions: [] } as never,
    "park-row-b"
  ));
  assert.equal(entity.isDeleted, true);
  assert.deepEqual(retiredScopes, [{ scope: { tenantId: "tenant-a", parkId: "park-b" }, retireAssetProjection: false }]);
});

test("independent asset scope retirement blocks active asset assignment before soft-deleting projection", async () => {
  const retire = (ParksService.prototype as unknown as {
    retireIndependentAssetScope(
      manager: { query(sql: string, parameters: unknown[]): Promise<unknown[]> },
      scope: { tenantId: string; parkId: string },
      actorId: string,
      retireAssetProjection?: boolean
    ): Promise<void>;
  }).retireIndependentAssetScope;
  const scope = { tenantId: "tenant-a", parkId: "park-b" };
  const activeAssetManager = {
    getRepository: () => ({
      find: async () => [],
      exists: async () => true
    }),
    query: async (sql: string) => {
      if (sql.includes("FROM rel_tenant_module")) return [{ exists: 1 }];
      return [];
    }
  };

  await assert.rejects(
    () => retire.call({} as ParksService, activeAssetManager, scope, "actor-a"),
    /Asset module must be disabled before park retirement/
  );

  const queries: Array<{ sql: string; parameters: unknown[] }> = [];
  const inactiveAssetManager = {
    getRepository: () => ({
      find: async () => [],
      exists: async () => true
    }),
    query: async (sql: string, parameters: unknown[]) => {
      queries.push({ sql, parameters });
      return [];
    }
  };
  await assert.doesNotReject(() => retire.call({} as ParksService, inactiveAssetManager, scope, "actor-a"));
  assert.equal(queries.length, 3);
  assert.match(queries[1]!.sql, /UPDATE asset_park SET is_deleted=true, status='disabled'/);
  assert.deepEqual(queries[1]!.parameters, ["tenant-a", "park-b", "actor-a"]);
  assert.match(queries[2]!.sql, /UPDATE rel_tenant_module SET is_deleted=true, enabled=false, status='disabled'/);
  assert.deepEqual(queries[2]!.parameters, ["tenant-a", "park-b", "actor-a"]);

  queries.length = 0;
  await assert.doesNotReject(() => retire.call({} as ParksService, inactiveAssetManager, scope, "actor-a", false));
  assert.equal(queries.length, 2);
  assert.match(queries[1]!.sql, /UPDATE rel_tenant_module SET is_deleted=true, enabled=false, status='disabled'/);
});

test("park mutation scope locks use one deterministic shared-key order", async () => {
  const lockMutationScopes = (ParksService.prototype as unknown as {
    lockMutationScopes(manager: unknown, scope: unknown, includeDefaultScope: boolean): Promise<void>;
  }).lockMutationScopes;
  const acquired: string[] = [];
  const manager = {
    query: async (_sql: string, parameters: [string]) => {
      acquired.push(parameters[0]);
    }
  };

  await lockMutationScopes.call(
    {} as ParksService,
    manager,
    { tenantId: "tenant-z", parkId: "park-z" },
    true
  );
  assert.deepEqual(acquired, [
    "tenant-asset-park:10000001:20000001",
    "tenant-asset-park:tenant-z:park-z"
  ]);

  acquired.length = 0;
  await lockMutationScopes.call(
    {} as ParksService,
    manager,
    { tenantId: "10000001", parkId: "20000001" },
    true
  );
  assert.deepEqual(acquired, ["tenant-asset-park:10000001:20000001"]);
});

test("destructive protected park mutation permits only a single surviving active canonical source", async () => {
  const assertSurvives = (ParksService.prototype as unknown as {
    assertCanonicalSourceSurvives(manager: unknown, scope: unknown, park: unknown): Promise<void>;
  }).assertCanonicalSourceSurvives;
  const scope = { tenantId: "tenant-a", parkId: "park-a" };
  const removed = { id: "park-row-a", ...scope };
  const managerForCount = (count: number) => ({
    getRepository: () => ({
      createQueryBuilder: () => {
        const builder = {
          where: () => builder,
          andWhere: () => builder,
          getCount: async () => count
        };
        return builder;
      }
    })
  });

  await assert.doesNotReject(assertSurvives.call({} as ParksService, managerForCount(1), scope, removed));
  await assert.rejects(assertSurvives.call({} as ParksService, managerForCount(0), scope, removed), /one active canonical park/);
  await assert.rejects(assertSurvives.call({} as ParksService, managerForCount(2), scope, removed), /one active canonical park/);

  const counts = [3, 1];
  const defaultFallbackManager = {
    getRepository: () => ({
      createQueryBuilder: () => {
        const builder = {
          where: () => builder,
          andWhere: () => builder,
          getCount: async () => counts.shift() ?? 0
        };
        return builder;
      }
    })
  };
  await assert.doesNotReject(assertSurvives.call(
    {} as ParksService,
    defaultFallbackManager,
    { tenantId: "10000001", parkId: "20000001" },
    { id: "auxiliary", tenantId: "10000001", parkId: "20000001" }
  ));
});
