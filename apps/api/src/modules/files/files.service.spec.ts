import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import type { TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { FilesService, normalizeMultipartFileName,projectHrEmployeeDocumentFile } from "./files.service";
import type { FileEntity } from "./entities/file.entity";

const scope: TenantParkScope = { tenantId: "tenant-1", parkId: "park-1" };
const actor: JwtPrincipal = {
  sub: "user-1",
  username: "user-1",
  tenantId: scope.tenantId,
  parkId: scope.parkId,
  roles: [],
  permissions: []
};

test("HR employee document projection omits storage, hashes and audit internals",()=>{
  const file={id:"file-1",fileCode:"F-1",originalName:"contract.pdf",fileUrl:"/api/v1/files/file-1/download",fileSize:"1024",mimeType:"application/pdf",bizType:"hr_employee_document",bizId:"employee-1",status:1,createTime:new Date("2026-08-24T00:00:00Z"),storedName:"secret.pdf",storagePath:"tenant/park/secret.pdf",storageBucket:null,storageType:"local",md5:"secret-md5",contentSha256:"secret-sha",tenantId:"tenant-1",parkId:"park-1",createBy:"actor",updateBy:"actor",remark:"private",isDeleted:false,version:1} as FileEntity;
  assert.deepEqual(Object.keys(projectHrEmployeeDocumentFile(file)).sort(),[
    "bizId","bizType","createTime","fileCode","fileSize","fileUrl","id","mimeType","originalName","status"
  ].sort());
});

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

test("pending repair listing excludes files already bound to work orders", async () => {
  const whereClauses: string[] = [];
  const builder = {
    where(sql: string) { whereClauses.push(sql); return this; },
    andWhere(sql: string) { whereClauses.push(sql); return this; },
    orderBy() { return this; },
    skip() { return this; },
    take() { return this; },
    async getManyAndCount() { return [[{ id: "pending-file" }], 1]; }
  };
  const service = new FilesService(
    { createQueryBuilder: () => builder } as never,
    {} as never,
    {} as never,
    {
      isProtectedBizType: () => true,
      assertReferenceAccess: async () => undefined
    } as never
  );
  const result = await service.list(scope, actor, {
    biz_type: "housing_repair",
    biz_id: "11111111-1111-4111-8111-111111111111",
    pending: "true",
    page: 1,
    page_size: 20
  });
  assert.equal(result.total, 1);
  assert.match(whereClauses.join("\n"), /NOT EXISTS[\s\S]*biz_work_order/u);
  assert.match(whereClauses.join("\n"), /file\.id = ANY\(repair\.image_file_ids\)/u);
});

test("pending file mode rejects unsupported business scopes", async () => {
  const service = new FilesService({} as never, {} as never, {} as never, {} as never);
  await assert.rejects(
    service.list(scope, actor, {
      biz_type: "housing_handover",
      pending: "true",
      page: 1,
      page_size: 20
    }),
    /pending file listing requires housing_repair and biz_id/u
  );
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

test("every custom FilesService upload adapter forwards validated multipart metadata", () => {
  const moduleRoot = resolve(__dirname, "..");
  const servicePaths = readdirSync(moduleRoot, { recursive: true, encoding: "utf8" })
    .filter((relativePath) => relativePath.endsWith(".service.ts"))
    .map((relativePath) => resolve(moduleRoot, relativePath))
    .filter((absolutePath) => readFileSync(absolutePath, "utf8").includes("filesService.upload("));

  assert.ok(servicePaths.length > 0, "expected at least one custom FilesService upload adapter");
  for (const absolutePath of servicePaths) {
    const source = readFileSync(absolutePath, "utf8");
    const uploadCalls = source.match(/filesService\.upload\(/g) ?? [];
    const metadataForwards = source.match(/\{ biz_type: [^,]+,(?: biz_id: id,)? \.\.\.metadata \}/g) ?? [];
    assert.equal(
      metadataForwards.length,
      uploadCalls.length,
      `${absolutePath} must forward MultipartFileMetadataDto through every FilesService.upload call`
    );
  }

  const unitController = readFileSync(resolve(__dirname, "../units/units.controller.ts"), "utf8");
  for (const method of ["uploadPhoto", "uploadFloorplan"]) {
    assert.match(
      unitController,
      new RegExp(`${method}\\([\\s\\S]*?@Body\\(\\) metadata: MultipartFileMetadataDto`),
      `${method} must validate the shared multipart metadata DTO`
    );
  }
});

test("upload persists SHA-256 alongside the legacy MD5 digest", async () => {
  let saved: Record<string, unknown> | undefined;
  const repository = {
    count: async () => 0,
    create: (value: Record<string, unknown>) => value,
    save: async (value: Record<string, unknown>) => {
      saved = value;
      return { id: "file-1", ...value };
    }
  };
  const service = new FilesService(
    repository as never,
    {
      save: async () => ({
        storageType: "local",
        storageBucket: null,
        storagePath: "tenant-1/park-1/file"
      })
    } as never,
    {} as never,
    {} as never
  );
  const payload = Buffer.from("identity-evidence");
  await service.upload(
    scope,
    actor.sub,
    { biz_type: "party_identity_evidence" },
    {
      originalname: "evidence.png",
      mimetype: "image/png",
      size: payload.byteLength,
      buffer: payload
    }
  );
  assert.equal(saved?.md5, "c915f5b1fec5cc845a4fd0f4a91a66c8");
  assert.equal(
    saved?.contentSha256,
    "19fbbac87e6b967cf30be1f11b515f3b02e93f982ef15fe64dfe6cb3f9518842"
  );
});

test("identity downloads use the download-specific authorization path before returning storage", async () => {
  const accessCalls: unknown[][] = [];
  const file = {
    id: "22222222-2222-4222-8222-222222222222",
    tenantId: scope.tenantId,
    parkId: scope.parkId,
    bizType: "party_identity_evidence",
    bizId: "11111111-1111-4111-8111-111111111111",
    createBy: "maker",
    storagePath: "tenant/park/evidence",
    storageType: "local"
  };
  const service = new FilesService(
    {
      findOne: async () => file
    } as never,
    {
      resolve: () => "/tmp/evidence"
    } as never,
    {} as never,
    {
      assertPendingFileOwner: () => undefined,
      assertReferenceAccess: async (...args: unknown[]) => {
        accessCalls.push(args);
      }
    } as never
  );
  await service.prepareDownload(scope, actor, file.id);
  assert.equal(accessCalls.length, 1);
  assert.equal(accessCalls[0]?.[4], "download");
  assert.equal(accessCalls[0]?.[6], file.id);
});

test("successful identity download records a protected evidence access audit", async () => {
  let audit: Record<string, unknown> | undefined;
  const service = new FilesService(
    {} as never,
    {} as never,
    {
      recordOperation: async (input: Record<string, unknown>) => {
        audit = input;
      }
    } as never,
    {} as never
  );
  await service.recordDownload(
    scope,
    { id: actor.sub, username: actor.username, roles: [] },
    {
      id: "22222222-2222-4222-8222-222222222222",
      bizType: "party_identity_evidence",
      bizId: "11111111-1111-4111-8111-111111111111",
      fileUrl: "/api/v1/files/22222222-2222-4222-8222-222222222222/download"
    } as never,
    "request-1"
  );
  assert.equal(audit?.action, "download");
  assert.equal(audit?.bizType, "party_identity_evidence");
  assert.equal(audit?.success, true);
  assert.equal(audit?.requestId, "request-1");
});

test("identity deletion authorizes before revealing whether evidence is referenced", async () => {
  const calls: string[] = [];
  const file = {
    id: "22222222-2222-4222-8222-222222222222",
    tenantId: scope.tenantId,
    parkId: scope.parkId,
    bizType: "party_identity_evidence",
    bizId: "11111111-1111-4111-8111-111111111111",
    createBy: actor.sub,
    isDeleted: false
  };
  const repository = {
    findOne: async () => file,
    save: async (value: unknown) => value
  };
  const manager = {
    getRepository: () => repository,
    transaction: async (run: (transactionManager: unknown) => Promise<unknown>) => run(manager)
  };
  const service = new FilesService(
    { manager } as never,
    {} as never,
    {} as never,
    {
      assertPendingFileOwner: () => calls.push("pending-owner"),
      assertReferenceAccess: async () => { calls.push("authorize"); },
      assertDeletionAllowed: async () => { calls.push("reference-check"); },
      detachReferencesOnDelete: async () => { calls.push("detach"); }
    } as never
  );

  await service.softDeleteForActor(scope, actor, file.id);
  assert.deepEqual(calls, ["pending-owner", "authorize", "reference-check", "detach"]);
});

test("pending housing repair deletion completes after scoped authorization and reference checks", async () => {
  const calls: string[] = [];
  const file = {
    id: "22222222-2222-4222-8222-222222222222",
    tenantId: scope.tenantId,
    parkId: scope.parkId,
    bizType: "housing_repair",
    bizId: "11111111-1111-4111-8111-111111111111",
    createBy: actor.sub,
    isDeleted: false,
    updateBy: null
  };
  const repository = {
    findOne: async () => file,
    save: async (value: typeof file) => {
      calls.push("save");
      return value;
    }
  };
  const manager = {
    getRepository: () => repository,
    transaction: async (run: (transactionManager: unknown) => Promise<unknown>) => run(manager)
  };
  const service = new FilesService(
    { manager } as never,
    {} as never,
    {} as never,
    {
      assertPendingFileOwner: () => calls.push("pending-owner"),
      assertReferenceAccess: async (
        receivedScope: TenantParkScope,
        receivedActor: JwtPrincipal,
        bizType: string,
        bizId: string,
        action: string
      ) => {
        calls.push("authorize");
        assert.deepEqual(receivedScope, scope);
        assert.equal(receivedActor, actor);
        assert.equal(bizType, "housing_repair");
        assert.equal(bizId, file.bizId);
        assert.equal(action, "delete");
      },
      assertDeletionAllowed: async () => calls.push("reference-check"),
      detachReferencesOnDelete: async () => calls.push("detach")
    } as never
  );

  const result = await service.softDeleteForActor(scope, actor, file.id);

  assert.deepEqual(result, { id: file.id });
  assert.equal(file.isDeleted, true);
  assert.equal(file.updateBy, actor.sub);
  assert.deepEqual(calls, ["pending-owner", "authorize", "reference-check", "detach", "save"]);
});

test("identity deletion never checks references after authorization is rejected", async () => {
  const calls: string[] = [];
  const file = {
    id: "22222222-2222-4222-8222-222222222222",
    tenantId: scope.tenantId,
    parkId: scope.parkId,
    bizType: "party_identity_evidence",
    bizId: "11111111-1111-4111-8111-111111111111",
    createBy: actor.sub,
    isDeleted: false
  };
  const repository = { findOne: async () => file };
  const manager = {
    getRepository: () => repository,
    transaction: async (run: (transactionManager: unknown) => Promise<unknown>) => run(manager)
  };
  const service = new FilesService(
    { manager } as never,
    {} as never,
    {} as never,
    {
      assertPendingFileOwner: () => calls.push("pending-owner"),
      assertReferenceAccess: async () => {
        calls.push("authorize");
        throw new ForbiddenException("forbidden");
      },
      assertDeletionAllowed: async () => { calls.push("reference-check"); },
      detachReferencesOnDelete: async () => { calls.push("detach"); }
    } as never
  );

  await assert.rejects(service.softDeleteForActor(scope, actor, file.id), ForbiddenException);
  assert.deepEqual(calls, ["pending-owner", "authorize"]);
});
