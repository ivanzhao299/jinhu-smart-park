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
  assert.match(source, /const nextActiveSources = activeSources \+ \(\(dto\.status \?\? 1\) === 1 \? 1 : 0\)/);
  assert.match(source, /const defaultFallbackSurvives = nextActiveSources === 0/);
  assert.match(source, /where: \{ parkCode: "JH", status: 1, isDeleted: false \}/);
  assert.match(source, /syncCanonicalAssetProjection\(manager, scope, actor\.sub\)/);
  assert.equal((source.match(/await this\.lockMutationScopes\(manager, scope, true\)/g) ?? []).length, 3);
  const updateBlock = source.slice(source.indexOf("async update("), source.indexOf("async softDelete("));
  assert.ok(updateBlock.indexOf("lockMutationScopes") < updateBlock.indexOf('lock: { mode: "pessimistic_write" }'));
  const deleteBlock = source.slice(source.indexOf("async softDelete("), source.indexOf("private scopedBuilder"));
  assert.ok(deleteBlock.indexOf("lockMutationScopes") < deleteBlock.indexOf('lock: { mode: "pessimistic_write" }'));
  assert.match(source, /syncCanonicalAssetProjection\(manager, DEFAULT_PLATFORM_SCOPE, actor\.sub\)/);
  assert.match(source, /park\.park_code = 'JH'/);
  assert.match(source, /if \(protectedScope && scopeRemainsActive\) await this\.syncCanonicalAssetProjection\(manager, scope, actor\.sub\)/);
  assert.match(source, /if \(defaultScopeProtected && defaultScopeRemainsActive\) \{\s+await this\.syncCanonicalAssetProjection/);
  assert.match(source, /const wasActive = entity\.status === 1/);
  assert.match(source, /const scopeRemainsActive = await this\.hasActiveCanonicalParkSource/);
  assert.match(source, /if \(wasActive && saved\.status !== 1 && !scopeRemainsActive\) \{\s+await this\.tenantsService\.reconcileDeactivatedParkAuthorization/);
  assert.match(source, /defaultScopeProtected && !defaultScopeRemainsActive && defaultScopeIsSecondary[\s\S]*reconcileDeactivatedParkAuthorization\(manager, DEFAULT_PLATFORM_SCOPE/);
  assert.match(source, /if \(!wasActive && saved\.status === 1\) \{\s+await this\.tenantsService\.reconcileReactivatedParkAuthorization/);
  assert.match(source, /const defaultScopeWasActive = defaultScopeProtected[\s\S]*hasValidCanonicalParkSourceBeforeMutation\(manager, DEFAULT_PLATFORM_SCOPE\)/);
  assert.match(source, /private async hasValidCanonicalParkSourceBeforeMutation[\s\S]*error instanceof ConflictException[\s\S]*return false/);
  assert.match(source, /defaultScopeProtected[\s\S]*!defaultScopeWasActive[\s\S]*defaultScopeRemainsActive[\s\S]*reconcileReactivatedParkAuthorization\(manager, DEFAULT_PLATFORM_SCOPE/);
  assert.doesNotMatch(source, /!wasActive[\s\S]{0,80}!defaultScopeWasActive/);
  assert.match(source, /const renamesCrossScopeDefaultSource = nextCode !== undefined[\s\S]*entity\.tenantId !== DEFAULT_PLATFORM_SCOPE\.tenantId/);
  assert.match(source, /if \(await hasProtectedAssetScope\(manager, scope\)\)/);
  assert.match(source, /await ensureAssetParkProjection\(manager, scope, actorId\)/);
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
  assert.match(source, /const systemEnabled[\s\S]*const inactiveScopeSystem/);
  assert.match(source, /hasCanonicalActiveAssetParkSource\(manager, scope\)/);
  assert.match(source, /if \(!assetEnabled && !inactiveScopeSystem\)/);
  assert.equal((source.match(/lockMutationScopes\(manager, scope, true\);\s*await this\.assertParkModuleAccess\(scope, manager\)/g) ?? []).length, 2);
  assert.match(source, /throw new ForbiddenException\("Tenant module is not authorized"\)/);
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
