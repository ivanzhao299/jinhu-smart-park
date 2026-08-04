import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { SYSTEM_PERMISSIONS } from "@jinhu/shared";
import { PERMISSIONS_KEY } from "../../shared/decorators/permissions.decorator";
import {
  PropertyOperationListController,
  PropertyOperationsController
} from "./property-operations.controller";
import { PropertyOccupanciesController } from "./property-occupancies.controller";

test("the frozen nine property control routes expose the missing list/detail endpoints", () => {
  assert.equal(
    Reflect.getMetadata(PATH_METADATA, PropertyOperationListController),
    "property/operations"
  );
  assert.equal(
    Reflect.getMetadata(PATH_METADATA, PropertyOperationListController.prototype.list),
    "/"
  );
  assert.equal(
    Reflect.getMetadata(METHOD_METADATA, PropertyOperationListController.prototype.list),
    0
  );
  assert.equal(
    Reflect.getMetadata(PATH_METADATA, PropertyOccupanciesController.prototype.detail),
    ":id"
  );
  assert.equal(
    Reflect.getMetadata(METHOD_METADATA, PropertyOccupanciesController.prototype.detail),
    0
  );
});

test("control reads combine exact page and action permissions", () => {
  assert.deepEqual(
    Reflect.getMetadata(
      PERMISSIONS_KEY,
      PropertyOperationListController.prototype.list
    ),
    [
      SYSTEM_PERMISSIONS.PROPERTY_OPERATIONS_PAGE,
      SYSTEM_PERMISSIONS.PROPERTY_OPERATION_READ
    ]
  );
  assert.deepEqual(
    Reflect.getMetadata(
      PERMISSIONS_KEY,
      PropertyOperationsController.prototype.transitionLogs
    ),
    [
      SYSTEM_PERMISSIONS.PROPERTY_MODE_TRANSITIONS_PAGE,
      SYSTEM_PERMISSIONS.PROPERTY_APPROVAL_READ
    ]
  );
  for (const method of ["list", "detail", "checkAvailability"] as const) {
    assert.deepEqual(
      Reflect.getMetadata(
        PERMISSIONS_KEY,
        PropertyOccupanciesController.prototype[method]
      ),
      [
        SYSTEM_PERMISSIONS.PROPERTY_OCCUPANCIES_PAGE,
        SYSTEM_PERMISSIONS.PROPERTY_OCCUPANCY_READ
      ]
    );
  }
});

test("availability is a read-only POST without an idempotency interceptor or audit decorator", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "property-occupancies.controller.ts"),
    "utf8"
  );
  const start = source.indexOf('@Post("availability")');
  const end = source.indexOf("@Get(\":id\")", start);
  const block = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(block, /IdempotencyInterceptor/);
  assert.doesNotMatch(block, /AuditLog/);
});

test("control DTOs and projections use camelCase and stable pagination", () => {
  const dto = fs.readFileSync(
    path.join(__dirname, "dto/property-control.dto.ts"),
    "utf8"
  );
  const occupancyDto = fs.readFileSync(
    path.join(__dirname, "dto/property-occupancy.dto.ts"),
    "utf8"
  );
  const service = fs.readFileSync(
    path.join(__dirname, "property-occupancies.service.ts"),
    "utf8"
  );
  for (const field of [
    "pageSize",
    "buildingId",
    "configuredMode",
    "operationStatus",
    "blockerCode",
    "decisionStatus",
    "executionStatus"
  ]) {
    assert.match(dto, new RegExp(`\\b${field}\\b`));
  }
  for (const field of [
    "unitId",
    "sourceDomain",
    "sourceType",
    "startFrom",
    "endTo",
    "pageSize"
  ]) {
    assert.match(occupancyDto, new RegExp(`\\b${field}\\b`));
  }
  assert.match(service, /allowedActions/);
  assert.match(service, /addOrderBy\("occupancy\.id", "ASC"\)/);
});

test("source identifiers and deep links are emitted only by a server allowlist", () => {
  const service = fs.readFileSync(
    path.join(__dirname, "property-occupancies.service.ts"),
    "utf8"
  );
  assert.match(service, /private projectSource/);
  assert.match(service, /permissions\.every/);
  assert.match(service, /encodeURIComponent\(id\)/);
  assert.match(service, /return \{\};/);
});
