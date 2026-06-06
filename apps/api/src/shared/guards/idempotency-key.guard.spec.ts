import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import { IdempotencyKeyGuard } from "./idempotency-key.guard";

const reflector = {
  getAllAndOverride: () => false
};

function createContext(method: string, headers: Record<string, string | undefined> = {}) {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({
        method,
        headers
      })
    })
  };
}

test("idempotency guard still rejects write requests without key", () => {
  const guard = new IdempotencyKeyGuard(reflector as never);
  assert.throws(() => guard.canActivate(createContext("POST") as never), BadRequestException);
});

test("idempotency guard ignores read requests", () => {
  const guard = new IdempotencyKeyGuard(reflector as never);
  assert.equal(guard.canActivate(createContext("GET") as never), true);
});
