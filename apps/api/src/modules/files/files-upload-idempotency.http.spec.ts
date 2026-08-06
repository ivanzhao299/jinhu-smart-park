import { type CanActivate, type ExecutionContext, Injectable, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ClsService } from "nestjs-cls";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { FilesController } from "./files.controller";
import { FilesService } from "./files.service";
import {
  setIdempotencyService,
  type IdempotencyBeginContext,
  type IdempotencyFingerprintInput
} from "../../shared/services/idempotency.service";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";

const principal: JwtPrincipal = {
  sub: "user-http", username: "user-http", tenantId: "tenant-http", parkId: "park-http",
  roles: [], permissions: []
};
let uploadCalls = 0;

@Injectable()
class PrincipalGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    context.switchToHttp().getRequest<{ user?: JwtPrincipal }>().user = principal;
    return true;
  }
}

const filesService = {
  async uploadForActor(_scope: unknown, _user: unknown, dto: { remark?: string }, file?: { buffer: Buffer }) {
    uploadCalls += 1;
    return { id: `file-${uploadCalls}`, remark: dto.remark ?? null, size: file?.buffer.length ?? 0 };
  }
};

@Module({
  controllers: [FilesController],
  providers: [
    { provide: FilesService, useValue: filesService },
    { provide: ClsService, useValue: { getId: () => "request-http" } }
  ]
})
class FileUploadHttpTestModule {}

interface StoredRequest {
  fingerprint: string;
  id: string;
  responseBody?: unknown;
  responseStatus?: number;
  status: "processing" | "succeeded";
}

const requests = new Map<string, StoredRequest>();

const idempotency = {
  buildFingerprint(input: IdempotencyFingerprintInput): string {
    return createHash("sha256").update(JSON.stringify(input)).digest("hex");
  },
  async tryBegin(input: IdempotencyBeginContext) {
    const scopeKey = `${input.tenantId}|${input.userId}|${input.requestPath}|${input.idempotencyKey}`;
    const existing = requests.get(scopeKey);
    if (!existing) {
      const request = { id: randomUUID(), fingerprint: input.requestFingerprint, status: "processing" as const };
      requests.set(scopeKey, request);
      return { outcome: "began" as const, request };
    }
    if (existing.fingerprint !== input.requestFingerprint) return { outcome: "conflict" as const, request: existing };
    if (existing.status === "succeeded") {
      return {
        outcome: "cached" as const,
        request: existing,
        cachedResponse: { responseBody: existing.responseBody, responseStatus: existing.responseStatus ?? 201 }
      };
    }
    return { outcome: "processing" as const, request: existing };
  },
  async markSucceeded(id: string, responseStatus: number, responseBody: unknown) {
    for (const request of requests.values()) {
      if (request.id === id) Object.assign(request, { responseBody, responseStatus, status: "succeeded" as const });
    }
  },
  async markFailed() {}
};

describe("files multipart HTTP idempotency", () => {
  let application: Awaited<ReturnType<typeof NestFactory.create>>;
  let baseUrl = "";

  before(async () => {
    setIdempotencyService(idempotency as never);
    application = await NestFactory.create(FileUploadHttpTestModule, { logger: false });
    application.useGlobalGuards(new PrincipalGuard());
    await application.listen(0, "127.0.0.1");
    baseUrl = await application.getUrl();
  });

  after(async () => {
    await application.close();
  });

  it("replays same file and remark without invoking FilesService twice", async () => {
    const first = await upload("same-key", "image-one", "现场入口");
    const replay = await upload("same-key", "image-one", "现场入口");
    assert.equal(first.status, 201);
    assert.equal(replay.status, 201);
    const firstBody = await first.json() as { size: number };
    assert.equal(firstBody.size, Buffer.byteLength("image-one"));
    assert.deepEqual(await replay.json(), firstBody);
    assert.equal(uploadCalls, 1);
  });

  it("returns 409 for same key with a different file or remark", async () => {
    assert.equal((await upload("same-key", "image-two", "现场入口")).status, 409);
    assert.equal((await upload("remark-key", "image-one", "备注一")).status, 201);
    assert.equal((await upload("remark-key", "image-one", "备注二")).status, 409);
    assert.equal(uploadCalls, 2);
  });

  async function upload(key: string, content: string, remark: string): Promise<Response> {
    const form = new FormData();
    form.set("file", new Blob([content], { type: "image/jpeg" }), "site.jpg");
    form.set("biz_type", "housing_repair");
    form.set("biz_id", "11111111-1111-4111-8111-111111111111");
    form.set("remark", remark);
    return fetch(`${baseUrl}/files`, {
      method: "POST",
      headers: { "X-Idempotency-Key": key },
      body: form
    });
  }
});
