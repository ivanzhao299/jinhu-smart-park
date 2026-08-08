import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  propertyTaskError,
  translatePropertyTaskDatabaseError
} from "./property-task.error";

function response(error: ReturnType<typeof propertyTaskError>) {
  return error.getResponse() as Record<string, unknown>;
}

describe("C4 property task error wire and leak boundary", () => {
  it("keeps the closed error status/recovery contract", () => {
    assert.deepEqual(response(propertyTaskError("task-version-conflict", {}, 7)), {
      message: "task-version-conflict",
      errorCode: "task-version-conflict",
      retryable: true,
      recoveryAction: "property.task.reload",
      latestVersion: 7,
      details: {}
    });
    assert.deepEqual(response(propertyTaskError("property-action-forbidden", {
      sourceId: "secret",
      assigneeDisplay: "secret"
    })), {
      message: "property-action-forbidden",
      errorCode: "property-action-forbidden",
      retryable: false,
      details: {}
    });
  });

  it("allows only signed task detail keys and safe local deep links", () => {
    assert.deepEqual(response(propertyTaskError("task-already-claimed", {
      assigneeDisplay: "Operator",
      assigneeId: "secret",
      sourceId: "secret"
    })).details, { assigneeDisplay: "Operator" });
    assert.deepEqual(response(propertyTaskError("task-source-ineligible", {
      deepLink: "/test_fixture_source/return",
      sourceId: "secret"
    })).details, { deepLink: "/test_fixture_source/return" });
    for (const deepLink of ["https://outside.invalid", "//outside.invalid", "secret"]) {
      assert.deepEqual(response(propertyTaskError("task-source-ineligible", {
        deepLink
      })).details, { deepLink: null });
    }
  });

  it("normalizes signed database conflicts and preserves unknown errors", () => {
    assert.throws(
      () => translatePropertyTaskDatabaseError({
        message: "property-task-projection-version-conflict"
      }),
      (error) => response(error as ReturnType<typeof propertyTaskError>).errorCode
        === "task-version-conflict"
    );
    assert.throws(
      () => translatePropertyTaskDatabaseError({ code: "40001" }),
      (error) => response(error as ReturnType<typeof propertyTaskError>).errorCode
        === "property-version-conflict"
    );
    const unknown = new Error("unknown-database-error");
    assert.throws(() => translatePropertyTaskDatabaseError(unknown), unknown);
  });
});
