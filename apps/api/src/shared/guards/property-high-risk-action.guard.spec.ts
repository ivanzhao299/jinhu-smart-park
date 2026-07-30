import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { ConflictException } from "@nestjs/common";
import { TRACK_A_HIGH_RISK_ACTION_IDS } from "@jinhu/shared";
import {
  PROPERTY_HIGH_RISK_ACTION_KEY
} from "../decorators/property-high-risk-action.decorator";
import {
  PROPERTY_APPROVAL_REQUIRED_MESSAGE,
  PropertyHighRiskActionGuard
} from "./property-high-risk-action.guard";

function createGuard(
  flag: unknown,
  metadata?: unknown
) {
  const reflector = {
    getAllAndOverride: (key: string) =>
      key === PROPERTY_HIGH_RISK_ACTION_KEY ? metadata : undefined
  };
  const config = {
    get: (key: string) => key === "PROPERTY_WORKBENCH_V2" ? flag : undefined
  };
  return new PropertyHighRiskActionGuard(reflector as never, config as never);
}

function createContext(body: unknown = undefined, user: unknown = undefined) {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ body, user })
    })
  };
}

function assertStableApprovalConflict(run: () => unknown): void {
  assert.throws(
    run,
    (error: unknown) => {
      assert.ok(error instanceof ConflictException);
      assert.equal(error.getStatus(), 409);
      assert.equal(error.message, PROPERTY_APPROVAL_REQUIRED_MESSAGE);
      return true;
    }
  );
}

const highRiskCases = [
  {
    metadata: { actionId: "homestay.bookings.cancel" },
    body: {}
  },
  {
    metadata: {
      actionId: "homestay.finance.refund-or-waive",
      discriminator: {
        bodyField: "entry_type",
        highRiskValues: ["refund", "waiver"]
      }
    },
    body: { entry_type: "refund" }
  },
  {
    metadata: { actionId: "housing.leases.approve" },
    body: {}
  },
  {
    metadata: { actionId: "housing.leases.void" },
    body: {}
  },
  {
    metadata: { actionId: "housing.leases.checkout" },
    body: {}
  },
  {
    metadata: {
      actionId: "housing.finance.refund-waive-or-deposit-refund",
      discriminator: {
        bodyField: "entry_type",
        highRiskValues: ["refund", "waiver", "deposit_refund"]
      }
    },
    body: { entry_type: "deposit_refund" }
  },
  {
    metadata: { actionId: "housing.purchases.lifecycle" },
    body: {}
  },
  {
    metadata: { actionId: "housing.purchases.transfer" },
    body: {}
  }
] as const;

test("guard is a complete no-op unless the trimmed case-insensitive flag is true", () => {
  for (const flag of [
    undefined,
    null,
    false,
    true,
    1,
    {},
    [],
    "",
    "false",
    " truex ",
    "1",
    "yes"
  ]) {
    for (const item of [
      ...highRiskCases,
      { metadata: { actionId: "unknown.property.action" }, body: {} }
    ]) {
      const guard = createGuard(flag, item.metadata);
      assert.equal(guard.canActivate(createContext(item.body) as never), true);
    }
  }
});

test("guard blocks a known high-risk action with the stable 409 contract", () => {
  for (const flag of ["true", " TRUE ", "TrUe"]) {
    const guard = createGuard(flag, {
      actionId: "housing.leases.approve"
    });
    assertStableApprovalConflict(
      () => guard.canActivate(createContext() as never)
    );
  }
});

test("all eight high-risk actions block normal, superuser, and wildcard principals", () => {
  assert.deepEqual(
    highRiskCases.map((item) => item.metadata.actionId).sort(),
    [...TRACK_A_HIGH_RISK_ACTION_IDS].sort()
  );
  const principals = [
    { isSuper: false, permissions: [] },
    { isSuper: true, permissions: [] },
    { isSuper: false, permissions: ["*"] }
  ];
  for (const item of highRiskCases) {
    for (const principal of principals) {
      const guard = createGuard("true", item.metadata);
      assertStableApprovalConflict(
        () => guard.canActivate(createContext(item.body, principal) as never)
      );
    }
  }
});

test("guard fails closed with the stable contract for unknown or drifted metadata", () => {
  const invalidMetadata = [
    null,
    false,
    "",
    { actionId: "unknown.property.action" },
    {
      actionId: "housing.leases.approve",
      discriminator: {
        bodyField: "entry_type",
        highRiskValues: ["refund"]
      }
    },
    { actionId: "homestay.finance.refund-or-waive" },
    {
      actionId: "homestay.finance.refund-or-waive",
      discriminator: {
        bodyField: "entry_type",
        highRiskValues: ["refund"]
      }
    },
    {
      actionId: "housing.finance.refund-waive-or-deposit-refund",
      discriminator: {
        bodyField: "entry_type",
        highRiskValues: ["deposit_refund", "refund", "waiver"]
      }
    }
  ];
  for (const metadata of invalidMetadata) {
    assertStableApprovalConflict(
      () => createGuard("true", metadata)
        .canActivate(createContext({ entry_type: "refund" }) as never)
    );
  }
});

test("guard blocks only high-risk homestay ledger entry types", () => {
  const guard = createGuard("true", {
    actionId: "homestay.finance.refund-or-waive",
    discriminator: {
      bodyField: "entry_type",
      highRiskValues: ["refund", "waiver"]
    }
  });
  for (const entry_type of ["charge", "payment"]) {
    assert.equal(guard.canActivate(createContext({ entry_type }) as never), true);
  }
  for (const entry_type of ["refund", "waiver"]) {
    assertStableApprovalConflict(
      () => guard.canActivate(createContext({ entry_type }) as never)
    );
  }
});

test("guard blocks housing refund, waiver, and deposit refund ledger entries", () => {
  const guard = createGuard("true", {
    actionId: "housing.finance.refund-waive-or-deposit-refund",
    discriminator: {
      bodyField: "entry_type",
      highRiskValues: ["refund", "waiver", "deposit_refund"]
    }
  });
  for (const entry_type of [
    "charge",
    "payment",
    "deposit_receipt",
    "deposit_deduction"
  ]) {
    assert.equal(guard.canActivate(createContext({ entry_type }) as never), true);
  }
  for (const entry_type of ["refund", "waiver", "deposit_refund"]) {
    assertStableApprovalConflict(
      () => guard.canActivate(createContext({ entry_type }) as never)
    );
  }
});

test("enabled guard ignores routes without high-risk metadata", () => {
  assert.equal(
    createGuard("true").canActivate(createContext() as never),
    true
  );
});

test("property high-risk guard is the final global guard after auth, permission, module, and idempotency", () => {
  const appModule = readFileSync(
    resolve(__dirname, "../../app.module.ts"),
    "utf8"
  );
  const guardClasses = [...appModule.matchAll(
    /provide: APP_GUARD,\s+useClass: (\w+)/gu
  )].map((match) => match[1]);
  assert.deepEqual(
    guardClasses,
    [
      "JwtAuthGuard",
      "PermissionGuard",
      "ModuleGuard",
      "IdempotencyKeyGuard",
      "PropertyHighRiskActionGuard"
    ]
  );
});

test("env examples, production compose, and release docs share the safe flag contract", () => {
  const root = resolve(__dirname, "../../../../..");
  const envExample = readFileSync(resolve(root, ".env.example"), "utf8");
  const productionEnvExample = readFileSync(
    resolve(root, ".env.production.example"),
    "utf8"
  );
  const compose = readFileSync(
    resolve(root, "infra/docker/docker-compose.prod.yml"),
    "utf8"
  );
  const productionDoc = readFileSync(
    resolve(root, "docs/deployment/production.md"),
    "utf8"
  );
  const releaseSop = readFileSync(
    resolve(root, "docs/release/production-release-sop.md"),
    "utf8"
  );
  assert.equal(
    envExample.match(/^PROPERTY_WORKBENCH_V2=false$/gmu)?.length,
    1
  );
  assert.equal(
    productionEnvExample.match(/^PROPERTY_WORKBENCH_V2=false$/gmu)?.length,
    1
  );
  assert.match(
    compose,
    /PROPERTY_WORKBENCH_V2: \$\{PROPERTY_WORKBENCH_V2:-false\}/
  );
  assert.match(productionDoc, /PROPERTY_WORKBENCH_V2/u);
  assert.match(productionDoc, /HTTP 409/u);
  assert.match(productionDoc, /超级管理员也不会绕过/u);
  assert.match(releaseSop, /PROPERTY_WORKBENCH_V2/u);
  assert.match(releaseSop, /必须为 `false`/u);
});
