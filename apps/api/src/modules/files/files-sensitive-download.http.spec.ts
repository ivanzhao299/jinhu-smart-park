import { type CanActivate, type ExecutionContext, Injectable, Module } from "@nestjs/common";
import { NestFactory, Reflector } from "@nestjs/core";
import { ClsService } from "nestjs-cls";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { PermissionGuard } from "../../shared/guards/permission.guard";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { FilesController } from "./files.controller";
import type { FileEntity } from "./entities/file.entity";
import { FilesService } from "./files.service";

const principal: JwtPrincipal = {
  sub: "user-sensitive-http",
  username: "user-sensitive-http",
  tenantId: "tenant-sensitive-http",
  parkId: "park-sensitive-http",
  roles: ["employee"],
  permissions: [HR_PERMISSIONS.HR_EMPLOYEE_DOCUMENT_SELF_READ]
};

let fixturePath = "";
let auditFailure = false;
let originalName = "employee-file.pdf";
let photoMode = false;
let requiredAudit: Record<string, unknown> | undefined;

@Injectable()
class PrincipalGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    context.switchToHttp().getRequest<{ user?: JwtPrincipal }>().user = principal;
    return true;
  }
}

const fileRepository = {
  async findOne(): Promise<FileEntity> {
    return {
      id: "11111111-1111-4111-8111-111111111111",
      tenantId: principal.tenantId,
      parkId: principal.parkId,
      fileCode: "FILE-HTTP",
      originalName,
      storedName: photoMode ? "employee-photo.jpg" : "employee-file.pdf",
      fileUrl: "/api/v1/files/11111111-1111-4111-8111-111111111111/download",
      fileSize: "16",
      mimeType: photoMode ? "image/jpeg" : "application/pdf",
      bizType: photoMode ? "hr_employee_photo" : "hr_employee_document",
      bizId: "22222222-2222-4222-8222-222222222222",
      storageType: "local",
      storageBucket: "local",
      storagePath: "employee-file.pdf",
      status: 1,
      isDeleted: false,
      createBy: principal.sub
    } as FileEntity;
  }
};

const storageService = { resolve: () => fixturePath };
const auditService = {
  async recordOperationRequired(input: Record<string, unknown>): Promise<void> {
    requiredAudit = input;
    if (auditFailure) throw new Error("audit persistence unavailable");
  },
  async recordOperation(): Promise<void> {}
};
const businessAccessService = {
  assertRoutePermission(): void {},
  assertPendingFileOwner(): void {},
  async assertReferenceAccess(): Promise<void> {}
};

const filesService = Reflect.construct(FilesService, [
  fileRepository,
  storageService,
  auditService,
  businessAccessService
]) as FilesService;

@Module({
  controllers: [FilesController],
  providers: [
    { provide: FilesService, useValue: filesService },
    { provide: ClsService, useValue: { getId: () => "request-sensitive-http" } }
  ]
})
class SensitiveDownloadHttpTestModule {}

describe("HR sensitive file download HTTP boundary", () => {
  let application: Awaited<ReturnType<typeof NestFactory.create>>;
  let baseUrl = "";
  let temporaryDirectory = "";
  const payload = Buffer.from("sensitive-pdf-v1");

  before(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), "jinhu-sensitive-download-"));
    fixturePath = join(temporaryDirectory, "employee-file.pdf");
    await writeFile(fixturePath, payload, { mode: 0o600 });
    application = await NestFactory.create(SensitiveDownloadHttpTestModule, { logger: false });
    application.useGlobalGuards(new PrincipalGuard(), new PermissionGuard(new Reflector()));
    await application.listen(0, "127.0.0.1");
    baseUrl = await application.getUrl();
  });

  beforeEach(() => {
    auditFailure = false;
    photoMode = false;
    requiredAudit = undefined;
    originalName = "employee-file.pdf";
    fixturePath = join(temporaryDirectory, "employee-file.pdf");
  });

  after(async () => {
    await application.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it("does not emit download metadata or bytes when required audit persistence fails", async () => {
    auditFailure = true;
    const response = await download();
    const body = await response.text();
    assert.equal(response.status, 500);
    assert.equal(response.headers.has("content-disposition"), false);
    assert.notEqual(response.headers.get("content-length"), "16");
    assert.notEqual(response.headers.get("content-type"), "application/pdf");
    assert.equal(body.includes(payload.toString("utf8")), false);
    assert.equal(body.includes(fixturePath), false);
  });

  it("does not emit download metadata or bytes when storage open fails", async () => {
    fixturePath = join(temporaryDirectory, "missing.pdf");
    const response = await download();
    const body = await response.text();
    assert.equal(response.status, 500);
    assert.equal(response.headers.has("content-disposition"), false);
    assert.notEqual(response.headers.get("content-length"), "16");
    assert.notEqual(response.headers.get("content-type"), "application/pdf");
    assert.equal(body.includes(payload.toString("utf8")), false);
    assert.equal(body.includes(fixturePath), false);
  });

  it("emits a safe attachment header and exact stream only after authorization, audit, and open succeed", async () => {
    originalName = "employee\r\nX-Injected: yes.pdf";
    const response = await download();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/pdf");
    assert.equal(response.headers.get("content-length"), String(payload.length));
    const disposition = response.headers.get("content-disposition") ?? "";
    assert.match(disposition, /^attachment; filename\*=UTF-8''/u);
    assert.equal(/[\r\n]/u.test(disposition), false);
    assert.equal(response.headers.has("x-injected"), false);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), payload);
  });

  it("treats employee photos as audited HR-sensitive downloads before image headers or bytes", async () => {
    photoMode = true;
    originalName = "employee-photo.jpg";
    const response = await download();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/jpeg");
    assert.equal(requiredAudit?.resource, "hr.employee_photo");
    assert.equal(requiredAudit?.action, "下载员工照片");
    assert.deepEqual(requiredAudit?.afterJson, {
      fieldGroups: ["attachment"],
      projection: "download",
      itemCount: 1,
    });
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), payload);
  });

  it("does not emit photo headers or bytes if the employee-photo audit fails", async () => {
    photoMode = true;
    auditFailure = true;
    const response = await download();
    const body = await response.text();
    assert.equal(response.status, 500);
    assert.equal(response.headers.has("content-disposition"), false);
    assert.notEqual(response.headers.get("content-type"), "image/jpeg");
    assert.equal(body.includes(payload.toString("utf8")), false);
  });

  async function download(): Promise<Response> {
    return fetch(`${baseUrl}/files/11111111-1111-4111-8111-111111111111/download`);
  }
});
