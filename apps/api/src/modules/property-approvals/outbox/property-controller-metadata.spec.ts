import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import {
  PROPERTY_BUSINESS_PERMISSIONS,
  PROPERTY_TRACK_B_ENDPOINT_PERMISSION_MANIFEST
} from "@jinhu/shared";
import { MODULES_KEY } from "../../../shared/decorators/modules.decorator";
import { PERMISSIONS_KEY } from "../../../shared/decorators/permissions.decorator";
import { PropertyApprovalController } from "../property-approval.controller";
import {
  PropertyApprovalIncidentController,
  PropertyApprovalIncidentRetryController,
  PropertyEventIncidentController
} from "./property-incident.controller";
import { PropertyNotificationController } from "./property-notification.controller";

const metadata = (key: string, method: (...args: never[]) => unknown) =>
  Reflect.getMetadata(key, method) as string[];

describe("property runtime controller authorization metadata", () => {
  it("requires active asset module on every incident and notification surface", () => {
    assert.deepEqual(Reflect.getMetadata(MODULES_KEY, PropertyEventIncidentController), ["asset"]);
    assert.deepEqual(Reflect.getMetadata(MODULES_KEY, PropertyApprovalIncidentController), ["asset"]);
    assert.deepEqual(Reflect.getMetadata(MODULES_KEY, PropertyApprovalIncidentRetryController), ["asset"]);
    assert.deepEqual(Reflect.getMetadata(MODULES_KEY, PropertyNotificationController), ["asset"]);
  });

  it("exposes canonical approval retry with page, read and retry permissions", () => {
    assert.deepEqual(
      metadata(PERMISSIONS_KEY, PropertyApprovalIncidentRetryController.prototype.retry),
      [
        PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_APPROVAL_INCIDENTS_PAGE,
        PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_APPROVAL_READ_INCIDENT,
        PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_APPROVAL_RETRY
      ]
    );
  });

  it("requires exact page/read/replay permissions on event replay", () => {
    assert.deepEqual(
      metadata(PERMISSIONS_KEY, PropertyEventIncidentController.prototype.replay),
      [
        PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_EVENT_DELIVERY_INCIDENTS_PAGE,
        PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_EVENT_READ_INCIDENT,
        PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_EVENT_REPLAY
      ]
    );
  });

  it("keeps notification read and mark-read permissions orthogonal", () => {
    assert.deepEqual(
      metadata(PERMISSIONS_KEY, PropertyNotificationController.prototype.detail),
      [
        PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_NOTIFICATIONS_PAGE,
        PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_NOTIFICATION_READ
      ]
    );
    assert.deepEqual(
      metadata(PERMISSIONS_KEY, PropertyNotificationController.prototype.markRead),
      [
        PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_NOTIFICATIONS_PAGE,
        PROPERTY_BUSINESS_PERMISSIONS.PROPERTY_NOTIFICATION_MARK_READ
      ]
    );
  });

  it("keeps all 13 approval/runtime routes exactly equivalent to the 53-row manifest", () => {
    const controllers = [
      PropertyApprovalController,
      PropertyApprovalIncidentRetryController,
      PropertyApprovalIncidentController,
      PropertyEventIncidentController,
      PropertyNotificationController
    ];
    const methodName = new Map([
      [RequestMethod.GET, "GET"],
      [RequestMethod.POST, "POST"],
      [RequestMethod.PUT, "PUT"]
    ]);
    const actual = controllers.flatMap((controller) => {
      const controllerPath = Reflect.getMetadata(PATH_METADATA, controller) as string;
      const prototype = controller.prototype as unknown as Record<string, unknown>;
      return Object.getOwnPropertyNames(prototype).flatMap((name) => {
        if (name === "constructor") return [];
        const handler = prototype[name] as (...args: never[]) => unknown;
        const requestMethod = Reflect.getMetadata(METHOD_METADATA, handler) as
          RequestMethod | undefined;
        if (requestMethod == null) return [];
        const routePath = Reflect.getMetadata(PATH_METADATA, handler) as string;
        const method = methodName.get(requestMethod);
        assert.ok(method, `unsupported request method on ${controller.name}.${name}`);
        const suffix = routePath && routePath !== "/" ? `/${routePath}` : "";
        return [{
          method,
          path: `/api/v1/${controllerPath}${suffix}`,
          requiredPermissions: [
            ...(Reflect.getMetadata(PERMISSIONS_KEY, handler) as string[] ?? [])
          ].sort(),
          requiredModule: (
            Reflect.getMetadata(MODULES_KEY, handler)
            ?? Reflect.getMetadata(MODULES_KEY, controller)
          )?.[0]
        }];
      });
    }).sort((a, b) => `${a.method}:${a.path}`.localeCompare(`${b.method}:${b.path}`));
    const expected = PROPERTY_TRACK_B_ENDPOINT_PERMISSION_MANIFEST
      .filter(({ path }) =>
        path.startsWith("/api/v1/property/approvals")
        || path.startsWith("/api/v1/property/approval-incidents")
        || path.startsWith("/api/v1/property/event-delivery-incidents")
        || path.startsWith("/api/v1/property/notifications"))
      .map(({ method, path, requiredPermissions, requiredModule }) => ({
        method,
        path,
        requiredPermissions: [...requiredPermissions],
        requiredModule
      }))
      .sort((a, b) => `${a.method}:${a.path}`.localeCompare(`${b.method}:${b.path}`));
    assert.equal(PROPERTY_TRACK_B_ENDPOINT_PERMISSION_MANIFEST.length, 53);
    assert.equal(actual.length, 13);
    assert.deepEqual(actual, expected);
  });
});
