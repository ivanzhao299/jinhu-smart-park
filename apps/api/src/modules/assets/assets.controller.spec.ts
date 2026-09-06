import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { ParseUUIDPipe } from "@nestjs/common";
import { ROUTE_ARGS_METADATA } from "@nestjs/common/constants";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AssetsController } from "./assets.controller";
import { AssetSpaceMappingService } from "./asset-space-mapping.service";
import { AssetsService } from "./assets.service";

const malformedUuidIsHttp400 = async (controller: object, methodName: string) => {
  const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, controller, methodName) as Record<string, { pipes?: unknown[] }>;
  const pipe = Object.values(args).flatMap((argument) => argument.pipes ?? [])
    .find((candidate): candidate is ParseUUIDPipe => candidate instanceof ParseUUIDPipe);
  assert.ok(pipe, `${methodName} must declare ParseUUIDPipe`);
  await assert.rejects(
    pipe.transform("not-a-uuid", { type: "param", metatype: String, data: "id" }),
    (error: unknown) => typeof error === "object" && error !== null && "getStatus" in error
      && (error as { getStatus(): number }).getStatus() === 400
  );
};

test("every asset resource route rejects malformed UUIDs at the HTTP boundary", async () => {
  for (const methodName of [
    "detailPark", "updatePark", "deletePark", "detailBuilding", "updateBuilding", "deleteBuilding",
    "detailFloor", "updateFloor", "deleteFloor", "detailUnit", "updateUnit", "deleteUnit",
    "mapOperatingBuilding", "mapOperatingFloor", "convertOperatingUnit"
  ]) await malformedUuidIsHttp400(AssetsController, methodName);
});

test("operating-space candidates propagate the custom-scope principal", async () => {
  const actor = {
    sub: "00000000-0000-4000-8000-000000000001",
    username: "custom-unit-reader",
    tenantId: "tenant-1",
    parkId: "park-1",
    roles: [],
    permissions: [],
    dataScope: "custom"
  } satisfies JwtPrincipal;
  let receivedActor: JwtPrincipal | undefined;
  const controller = new AssetsController({} as never, {} as never, {
    listUnitCandidates: async (_scope: unknown, candidateActor: JwtPrincipal) => {
      receivedActor = candidateActor;
      return { items: [], total: 0, page: 1, page_size: 20 };
    }
  } as never);
  await controller.operatingSpaceCandidates(
    { tenantId: "tenant-1", parkId: "park-1" }, actor, { page: 1, page_size: 20 }
  );
  assert.equal(receivedActor, actor);
});

test("candidate query delegates custom unit filtering to the shared data-scope service", async () => {
  const calls: unknown[][] = [];
  const builder = new Proxy({}, {
    get: (_target, property) => property === "then"
      ? undefined
      : property === "getRawMany"
      ? async () => []
      : (...args: unknown[]) => { calls.push([property, ...args]); return builder; }
  }) as never;
  const actor = { sub: "user-1", dataScope: "custom" } as JwtPrincipal;
  let applied: unknown[] | undefined;
  const service = new AssetSpaceMappingService({
    getRepository: () => ({ createQueryBuilder: () => builder })
  } as never, {
    applyToQueryBuilder: async (...args: unknown[]) => { applied = args; return builder; }
  } as never);
  await service.listUnitCandidates({ tenantId: "tenant-1", parkId: "park-1" }, actor, 1, 20);
  assert.equal(applied?.[2], actor);
  assert.equal(applied?.[3], "unit");
  assert.equal(applied?.[4], "source");
  assert.deepEqual(applied?.[5], { unit: "id" });
  assert.ok(calls.some(([method]) => method === "where"));
});

const buildAssetsService = (activeCount: number) => {
  const entity = { id: "unit-1", isDeleted: false, updateBy: "" };
  let saved = false;
  const repository = {
    findOne: async () => entity,
    save: async () => { saved = true; return entity; }
  };
  const manager = {
    getRepository: () => repository,
    query: async () => [{ activeCount }]
  };
  const service = new AssetsService(
    {} as never, {} as never, {} as never, {} as never,
    { transaction: async (run: (value: typeof manager) => unknown) => run(manager) } as never,
    { buildFindWhere: async (_scope: unknown, _actor: unknown, _dimension: unknown, where: unknown) => where } as never,
    {} as never
  );
  return { service, entity, wasSaved: () => saved };
};

test("asset unit deletion rejects an active operating projection", async () => {
  const { service, entity, wasSaved } = buildAssetsService(1);
  await assert.rejects(
    service.deleteUnit({ tenantId: "tenant-1", parkId: "park-1" }, { sub: "actor-1" } as JwtPrincipal, "unit-1"),
    (error: unknown) => typeof error === "object" && error !== null && "getStatus" in error
      && (error as { getStatus(): number }).getStatus() === 409
  );
  assert.equal(entity.isDeleted, false);
  assert.equal(wasSaved(), false);
});

test("asset unit deletion remains a soft delete when no active projection exists", async () => {
  const { service, entity, wasSaved } = buildAssetsService(0);
  assert.deepEqual(
    await service.deleteUnit({ tenantId: "tenant-1", parkId: "park-1" }, { sub: "actor-1" } as JwtPrincipal, "unit-1"),
    { id: "unit-1" }
  );
  assert.equal(entity.isDeleted, true);
  assert.equal(entity.updateBy, "actor-1");
  assert.equal(wasSaved(), true);
});
