import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RequireAnyModule, RequireModule } from "../decorators/modules.decorator";
import { ModuleGuard } from "./module.guard";

class AssetController {}

RequireModule("asset")(AssetController);

function recoveryHandler() {}
RequireAnyModule("asset", "system")(recoveryHandler);

function inheritedAssetHandler() {}

function allModulesHandler() {}
RequireModule("asset", "safety")(allModulesHandler);

function createContext(handler: () => void) {
  return {
    getHandler: () => handler,
    getClass: () => AssetController,
    switchToHttp: () => ({
      getRequest: () => ({
        user: {
          tenantId: "tenant-a",
          parkId: "park-a"
        }
      })
    })
  };
}

function createGuard(enabledModuleCodes: string[]) {
  return new ModuleGuard(
    new Reflector(),
    {
      listEnabledModulesForTenant: async () => enabledModuleCodes.map((moduleCode) => ({ module_code: moduleCode }))
    } as never
  );
}

test("RequireAnyModule overrides the class module policy and accepts either enabled module", async () => {
  await assert.doesNotReject(createGuard(["asset"]).canActivate(createContext(recoveryHandler) as never));
  await assert.doesNotReject(createGuard(["system"]).canActivate(createContext(recoveryHandler) as never));
  await assert.rejects(
    createGuard(["leasing"]).canActivate(createContext(recoveryHandler) as never),
    ForbiddenException
  );
});

test("RequireModule keeps the inherited all-required policy when no method override exists", async () => {
  await assert.doesNotReject(createGuard(["asset"]).canActivate(createContext(inheritedAssetHandler) as never));
  await assert.rejects(
    createGuard(["system"]).canActivate(createContext(inheritedAssetHandler) as never),
    ForbiddenException
  );
});

test("RequireModule requires every declared module", async () => {
  await assert.doesNotReject(createGuard(["asset", "safety"]).canActivate(createContext(allModulesHandler) as never));
  await assert.rejects(
    createGuard(["asset"]).canActivate(createContext(allModulesHandler) as never),
    ForbiddenException
  );
});
