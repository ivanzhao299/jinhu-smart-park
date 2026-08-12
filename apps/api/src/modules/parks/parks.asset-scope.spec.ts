import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { MODULES_KEY } from "../../shared/decorators/modules.decorator";
import { ParksController } from "./parks.controller";
import { ParksService } from "./parks.service";

test("canonical park mutations share the asset scope lock and preserve protected sources", () => {
  const source = readFileSync(resolve(__dirname, "parks.service.ts"), "utf8");
  assert.equal((source.match(/this\.dataSource\.transaction\(async \(manager\) =>/g) ?? []).length, 3);
  assert.equal((source.match(/await lockAssetScope\(manager, scope\)/g) ?? []).length, 3);
  assert.match(source, /hasProtectedAssetScope\(manager, scope\)/);
  assert.match(source, /Asset scope requires one active canonical park/);
  assert.match(source, /assertCanonicalSourceSurvives/);
  assert.match(source, /park\.id <> :removedParkId/);
  assert.match(source, /dto\.status !== undefined && dto\.status !== 1/);
  assert.match(source, /ensureAssetScopeProvisioned\(manager, scope, actor\.sub\)/);
  assert.match(source, /lockAssetScope\(manager, DEFAULT_PLATFORM_SCOPE\)/);
  assert.match(source, /ensureAssetScopeProvisioned\(manager, DEFAULT_PLATFORM_SCOPE, actor\.sub\)/);
  assert.match(source, /if \(protectedScope\) await ensureAssetScopeProvisioned\(manager, scope, actor\.sub\)/);
  assert.match(source, /await repository\.save\(entity\);\s+if \(protectedScope\) \{\s+await ensureAssetScopeProvisioned/);
});

test("park status recovery uses the system module while other park routes remain asset-gated", () => {
  assert.deepEqual(Reflect.getMetadata(MODULES_KEY, ParksController), ["asset"]);
  assert.deepEqual(Reflect.getMetadata(MODULES_KEY, ParksController.prototype.update), ["system"]);
  assert.deepEqual(Reflect.getMetadata(MODULES_KEY, ParksController.prototype.list), ["system"]);
  assert.deepEqual(Reflect.getMetadata(MODULES_KEY, ParksController.prototype.detail), ["system"]);
});

test("protected park mutation permits only a single surviving active canonical source", async () => {
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
});
