import assert from "node:assert/strict";
import test from "node:test";
import { ConflictException } from "@nestjs/common";
import {
  PROPERTY_APPROVAL_REQUIRED_ACTION_KEY,
  PropertyApprovalRequiredGuard
} from "./property-approval-required.guard";

function createGuard(metadata: unknown) {
  const reflector = {
    getAllAndOverride: (key: string) =>
      key === PROPERTY_APPROVAL_REQUIRED_ACTION_KEY ? metadata : undefined
  };
  return new PropertyApprovalRequiredGuard(reflector as never);
}

function createContext(
  params: Record<string, string>,
  body: unknown,
  user: unknown = undefined
) {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ params, body, user })
    })
  };
}

function assertApprovalConflict(
  run: () => unknown,
  actionId: string,
  targetId: string
): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof ConflictException);
    assert.equal(error.getStatus(), 409);
    assert.deepEqual(error.getResponse(), {
      message: "approval-required",
      errorCode: "approval-required",
      actionId,
      targetId,
      approvalAvailable: false
    });
    return true;
  });
}

const principals = [
  { isSuper: false, permissions: [] },
  { isSuper: true, permissions: [] },
  { isSuper: false, permissions: ["*"] },
  { isSuper: false, permissions: ["legacy:property:all"] }
];

test("mode transition always fails closed for every principal shape", () => {
  const metadata = {
    actionId: "property.mode-transition.request",
    variant: "always"
  };
  for (const principal of principals) {
    assertApprovalConflict(
      () => createGuard(metadata).canActivate(
        createContext({ unitId: "unit-1" }, {}, principal) as never
      ),
      "property.mode-transition.request",
      "unit-1"
    );
  }
});

test("only the exact force release variants fail closed", () => {
  const metadata = {
    actionId: "property.occupancy.force-release.request",
    variant: "force-release"
  };
  for (const force of [true, "true"]) {
    assertApprovalConflict(
      () => createGuard(metadata).canActivate(
        createContext({ id: "occupancy-1" }, { force }) as never
      ),
      "property.occupancy.force-release.request",
      "occupancy-1"
    );
  }
  for (const force of [undefined, false, "false", " TRUE ", 1, null]) {
    assert.equal(
      createGuard(metadata).canActivate(
        createContext({ id: "occupancy-1" }, { force }) as never
      ),
      true
    );
  }
});

test("missing or drifted metadata fails closed with the canonical URL action", () => {
  for (const metadata of [
    undefined,
    null,
    {},
    { actionId: "property.mode-transition.request", variant: "force-release" },
    {
      actionId: "property.occupancy.force-release.request",
      variant: "force-release",
      bypass: true
    }
  ]) {
    assertApprovalConflict(
      () => createGuard(metadata).canActivate(
        createContext({ unitId: "unit-drift" }, {}) as never
      ),
      "property.mode-transition.request",
      "unit-drift"
    );
    assertApprovalConflict(
      () => createGuard(metadata).canActivate(
        createContext({ id: "occupancy-drift" }, { force: false }) as never
      ),
      "property.occupancy.force-release.request",
      "occupancy-drift"
    );
  }
});

test("cross-route valid metadata pair swaps fail closed with the URL canonical action", () => {
  assertApprovalConflict(
    () => createGuard({
      actionId: "property.occupancy.force-release.request",
      variant: "force-release"
    }).canActivate(
      createContext({ unitId: "unit-swapped" }, { force: false }) as never
    ),
    "property.mode-transition.request",
    "unit-swapped"
  );

  assertApprovalConflict(
    () => createGuard({
      actionId: "property.mode-transition.request",
      variant: "always"
    }).canActivate(
      createContext({ id: "occupancy-swapped" }, { force: false }) as never
    ),
    "property.occupancy.force-release.request",
    "occupancy-swapped"
  );
});
