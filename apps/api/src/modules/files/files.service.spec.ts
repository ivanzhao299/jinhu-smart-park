import assert from "node:assert/strict";
import test from "node:test";
import type { TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { FilesService, normalizeMultipartFileName } from "./files.service";

const scope: TenantParkScope = { tenantId: "tenant-1", parkId: "park-1" };
const actor: JwtPrincipal = {
  sub: "user-1",
  username: "user-1",
  tenantId: scope.tenantId,
  parkId: scope.parkId,
  roles: [],
  permissions: []
};

test("pending purchase receipt listing is restricted to the uploader", async () => {
  let where: Record<string, unknown> | undefined;
  const accessCalls: unknown[][] = [];
  const service = new FilesService(
    {
      findAndCount: async (options: { where: Record<string, unknown> }) => {
        where = options.where;
        return [[], 0];
      }
    } as never,
    {} as never,
    {} as never,
    {
      isProtectedBizType: () => true,
      assertReferenceAccess: async (...args: unknown[]) => {
        accessCalls.push(args);
      }
    } as never
  );

  await service.list(scope, actor, {
    biz_type: "housing_purchase",
    page: 1,
    page_size: 20
  });

  assert.equal(accessCalls.length, 1);
  assert.equal(accessCalls[0]?.[5], actor.sub);
  assert.equal(where?.createBy, actor.sub);
  assert.ok(where?.bizId);
});

test("multipart filenames use an independently decoded UTF-8 name when its bytes match", () => {
  for (const expected of [
    "热转印桌面打印机用户指南.pdf",
    "こんにちは.pdf",
    "사용자 안내서.pdf",
    "𠀀.pdf"
  ]) {
    const mojibake = Buffer.from(expected, "utf8").toString("latin1");
    assert.equal(normalizeMultipartFileName(mojibake, expected), expected);
  }
});

test("multipart filename normalization does not guess without transport evidence", () => {
  assert.equal(normalizeMultipartFileName("floor-plan.pdf"), "floor-plan.pdf");
  assert.equal(normalizeMultipartFileName("平面图.pdf"), "平面图.pdf");
  assert.equal(normalizeMultipartFileName("こんにちは.pdf"), "こんにちは.pdf");
  assert.equal(normalizeMultipartFileName("사용자 안내서.pdf"), "사용자 안내서.pdf");
  assert.equal(normalizeMultipartFileName("café.pdf"), "café.pdf");
  assert.equal(normalizeMultipartFileName("Ã©.pdf"), "Ã©.pdf");
  assert.equal(normalizeMultipartFileName("Â£.pdf"), "Â£.pdf");
  assert.equal(normalizeMultipartFileName("ä½ .pdf"), "ä½ .pdf");
});

test("multipart filename normalization ignores an inconsistent or unsafe hint", () => {
  assert.equal(normalizeMultipartFileName("report.pdf", "other.pdf"), "report.pdf");
  assert.equal(normalizeMultipartFileName("report.pdf", "report\0.pdf"), "report.pdf");
});
