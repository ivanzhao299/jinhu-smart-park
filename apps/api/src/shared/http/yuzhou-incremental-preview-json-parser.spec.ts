import "reflect-metadata";
import assert from "node:assert/strict";
import { request } from "node:http";
import test from "node:test";
import { Body, Controller, Module, Post } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { ClsService } from "nestjs-cls";
import { YUZHOU_INCREMENTAL_MAX_PACKAGE_BYTES } from "@jinhu/shared";
import { ApiExceptionFilter } from "../filters/api-exception.filter";
import { createYuzhouIncrementalPreviewJsonParser } from "./yuzhou-incremental-preview-json-parser";

const previewPath = "/hr/imports/yuzhou/incremental/preview";

@Controller()
class ParserProbeController {
  @Post("hr/imports/yuzhou/incremental/preview")
  preview(@Body() body: { payload: string }) {
    return { length: body.payload.length, end: body.payload.slice(-4) };
  }

  @Post("ordinary")
  ordinary(@Body() body: { payload: string }) {
    return { length: body.payload.length, end: body.payload.slice(-4) };
  }
}

@Module({ controllers: [ParserProbeController] })
class ParserProbeModule {}

function jsonOfSize(bytes: number): string {
  const overhead = Buffer.byteLength(JSON.stringify({ payload: "" }));
  const value = JSON.stringify({ payload: "x".repeat(bytes - overhead - 4) + "tail" });
  assert.equal(Buffer.byteLength(value), bytes);
  return value;
}

async function send(
  app: NestExpressApplication,
  path: string,
  body: string,
  options: { method?: string; chunked?: boolean; contentType?: string } = {}
): Promise<{ status: number; body: Record<string, unknown> }> {
  const address = app.getHttpServer().address() as { port: number };
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: "127.0.0.1",
      port: address.port,
      path,
      method: options.method ?? "POST",
      headers: {
        "content-type": options.contentType ?? "application/json",
        ...(options.chunked ? {} : { "content-length": Buffer.byteLength(body) })
      }
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("error", reject);
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString()) });
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(10000, () => req.destroy(new Error("HTTP parser probe timed out")));
    if (options.chunked) {
      req.write(body.slice(0, Math.floor(body.length / 2)));
      req.end(body.slice(Math.floor(body.length / 2)));
    } else {
      req.end(body);
    }
  });
}

async function withApp(
  prefix: string,
  callback: (app: NestExpressApplication) => Promise<void>,
  productionFilter = false
): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(ParserProbeModule, { logger: false });
  try {
    app.setGlobalPrefix(prefix);
    app.use(createYuzhouIncrementalPreviewJsonParser(prefix));
    if (productionFilter) {
      app.useGlobalFilters(new ApiExceptionFilter({ getId: () => "parser-probe" } as ClsService));
    }
    // Real initialization installs Nest's default parsers after our middleware.
    await app.listen(0, "127.0.0.1");
    await callback(app);
  } finally {
    await app.close();
  }
}

test("scoped preview parses above 100kb and accepts exactly 8MiB, rejects one byte over", async () => {
  await withApp("api/v1", async (app) => {
    for (const bytes of [100 * 1024 + 1, YUZHOU_INCREMENTAL_MAX_PACKAGE_BYTES]) {
      const result = await send(app, `/api/v1${previewPath}?probe=1`, jsonOfSize(bytes));
      assert.equal(result.status, 201);
      assert.deepEqual(result.body, { length: bytes - 14, end: "tail" });
    }
    for (const chunked of [false, true]) {
      const result = await send(app, `/api/v1${previewPath}`, jsonOfSize(YUZHOU_INCREMENTAL_MAX_PACKAGE_BYTES + 1), { chunked });
      assert.equal(result.status, 413);
    }
  });
});

test("Nest default JSON parser remains active for ordinary bodies and its 100kb boundary", async () => {
  await withApp("api/v1", async (app) => {
    for (const bytes of [32, 100 * 1024]) {
      const result = await send(app, "/api/v1/ordinary", jsonOfSize(bytes));
      assert.equal(result.status, 201);
      assert.deepEqual(result.body, { length: bytes - 14, end: "tail" });
    }
    const result = await send(app, "/api/v1/ordinary", jsonOfSize(100 * 1024 + 1));
    assert.equal(result.status, 413);
  });
});

test("sibling, missing, wrong-prefix and non-POST paths do not get the raised limit", async () => {
  await withApp("custom/v2", async (app) => {
    const body = jsonOfSize(100 * 1024 + 1);
    for (const path of [
      `/custom/v2${previewPath}/sibling`,
      `/custom/v2${previewPath}-sibling`,
      `/api/v1${previewPath}`,
      previewPath,
      "/custom/v2/missing"
    ]) {
      assert.equal((await send(app, path, body)).status, 413, path);
    }
    for (const method of ["GET", "PUT", "PATCH", "DELETE"]) {
      assert.equal((await send(app, `/custom/v2${previewPath}`, body, { method })).status, 413, method);
    }
    assert.equal((await send(app, `/custom/v2${previewPath}`, body)).status, 201);
  });
});

test("prefix normalization supports an empty prefix and leading/trailing slashes", async () => {
  for (const prefix of ["", "/custom/v2/"]) {
    await withApp(prefix, async (app) => {
      const normalized = prefix.replace(/^\/+|\/+$/g, "");
      const path = `${normalized ? `/${normalized}` : ""}${previewPath}`;
      assert.equal((await send(app, path, jsonOfSize(100 * 1024 + 1))).status, 201);
    });
  }
});

test("production exception filter preserves safe scoped 413/400/415 responses", async () => {
  await withApp("api/v1", async (app) => {
    const oversized = await send(app, `/api/v1${previewPath}`, jsonOfSize(YUZHOU_INCREMENTAL_MAX_PACKAGE_BYTES + 1));
    assert.equal(oversized.status, 413);
    assert.equal(oversized.body.code, 413);
    const malformed = await send(app, `/api/v1${previewPath}`, '{"payload":"private-probe",}');
    assert.equal(malformed.status, 400);
    assert.equal(malformed.body.code, 400);
    assert.equal(malformed.body.message, "Invalid incremental import JSON body");
    assert.ok(!JSON.stringify(malformed.body).includes("private-probe"));
    const unsupported = await send(app, `/api/v1${previewPath}`, '{"payload":"tail"}', { contentType: "application/json; charset=unsupported" });
    assert.equal(unsupported.status, 415);
    const largeBody = jsonOfSize(100 * 1024 + 1);
    assert.equal((await send(app, `/api/v1${previewPath}`, largeBody)).status, 201);
    assert.equal((await send(app, "/api/v1/ordinary", jsonOfSize(32))).status, 201);
    for (const path of [
      `/api/v1${previewPath}/sibling`,
      `/other-prefix${previewPath}`,
      "/api/v1/missing"
    ]) {
      assert.equal((await send(app, path, largeBody)).status, 500, path);
    }
    for (const method of ["GET", "PUT", "PATCH", "DELETE"]) {
      assert.equal((await send(app, `/api/v1${previewPath}`, largeBody, { method })).status, 500, method);
    }
    // Record the existing global-filter behavior rather than widening this fix.
    const ordinary = await send(app, "/api/v1/ordinary", largeBody);
    assert.equal(ordinary.status, 500);
  }, true);
});
