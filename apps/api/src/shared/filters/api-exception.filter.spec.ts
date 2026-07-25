import assert from "node:assert/strict";
import test from "node:test";
import type { ArgumentsHost } from "@nestjs/common";
import type { Response } from "express";
import type { ClsService } from "nestjs-cls";
import { ApiExceptionFilter } from "./api-exception.filter";

test("ApiExceptionFilter translates PostgreSQL exclusion conflicts to HTTP 409", () => {
  let statusCode = 0;
  let payload: unknown;
  const response = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(body: unknown) {
      payload = body;
      return this;
    }
  } as unknown as Response;
  const host = {
    switchToHttp: () => ({ getResponse: () => response })
  } as unknown as ArgumentsHost;
  const cls = { getId: () => "request-1" } as unknown as ClsService;

  new ApiExceptionFilter(cls).catch({ code: "23P01" }, host);

  assert.equal(statusCode, 409);
  assert.deepEqual(payload, {
    code: 409,
    message: "Resource conflicts with an existing active record",
    data: null,
    request_id: "request-1",
    server_time: (payload as { server_time: number }).server_time
  });
});
