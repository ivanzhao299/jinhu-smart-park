import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import type { TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { FilesController } from "./files.controller";

const scope: TenantParkScope = { tenantId: "tenant-1", parkId: "park-1" };
const actor: JwtPrincipal = {
  sub: "verifier-1",
  username: "verifier-1",
  tenantId: scope.tenantId,
  parkId: scope.parkId,
  roles: [],
  permissions: []
};

test("denied identity download returns no blob and writes no success audit", async () => {
  let auditCalls = 0;
  let streamCalls = 0;
  const controller = new FilesController(
    {
      prepareDownload: async () => {
        throw new ForbiddenException("Identity evidence access is forbidden");
      },
      recordDownload: async () => {
        auditCalls += 1;
      },
      createReadStream: () => {
        streamCalls += 1;
        return null;
      }
    } as never,
    { getId: () => "request-1" } as never
  );

  await assert.rejects(
    controller.download(
      scope,
      actor,
      "22222222-2222-4222-8222-222222222222",
      { setHeader: () => undefined } as never
    ),
    ForbiddenException
  );
  assert.equal(streamCalls, 0);
  assert.equal(auditCalls, 0);
});
