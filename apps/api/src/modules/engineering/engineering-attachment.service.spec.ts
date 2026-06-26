import assert from "node:assert/strict";
import test from "node:test";
import { NotFoundException } from "@nestjs/common";
import type { TenantParkScope } from "@jinhu/shared";
import type { FilesService } from "../files/files.service";
import { EngineeringAttachmentService } from "./engineering-attachment.service";

const FILE_ID = "00000000-0000-0000-0000-000000000901";
const OTHER_FILE_ID = "00000000-0000-0000-0000-000000000902";

function makeScope(): TenantParkScope {
  return { tenantId: "tenant-a", parkId: "park-a" };
}

function makeService(options: { missingIds?: string[] } = {}): { service: EngineeringAttachmentService; checkedIds: string[] } {
  const checkedIds: string[] = [];
  const filesService = {
    detail: async (_scope: TenantParkScope, id: string) => {
      checkedIds.push(id);
      if (options.missingIds?.includes(id)) {
        throw new NotFoundException("File not found");
      }
      return { id };
    }
  } as unknown as FilesService;
  return { service: new EngineeringAttachmentService(filesService), checkedIds };
}

test("EngineeringAttachmentService preserves undefined and null attachment ids", async () => {
  const { service, checkedIds } = makeService();

  assert.equal(await service.normalizeAttachmentIds(makeScope(), undefined), undefined);
  assert.equal(await service.normalizeAttachmentIds(makeScope(), null), null);
  assert.deepEqual(checkedIds, []);
});

test("EngineeringAttachmentService verifies and deduplicates file ids in current scope", async () => {
  const { service, checkedIds } = makeService();

  const result = await service.normalizeAttachmentIds(makeScope(), [FILE_ID, FILE_ID, OTHER_FILE_ID]);

  assert.deepEqual(result, [FILE_ID, OTHER_FILE_ID]);
  assert.deepEqual(checkedIds, [FILE_ID, OTHER_FILE_ID]);
});

test("EngineeringAttachmentService rejects attachment ids outside current scope", async () => {
  const { service } = makeService({ missingIds: [OTHER_FILE_ID] });

  await assert.rejects(
    () => service.normalizeAttachmentIds(makeScope(), [FILE_ID, OTHER_FILE_ID]),
    /attachment_ids must reference files in the current tenant and park/
  );
});
