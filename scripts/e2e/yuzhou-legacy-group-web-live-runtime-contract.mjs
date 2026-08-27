import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { LegacyGroupWebRuntimeError, verifyLegacyGroupWebRuntime } from "../hr-cutover/legacy-group-web-live-runtime-lib.mjs";

const root = resolve(import.meta.dirname, "../..");
const manifest = JSON.parse(readFileSync(resolve(root, "scripts/hr-cutover/contracts/legacy-group-web-live-runtime-v1.json"), "utf8"));
const clone = value => structuredClone(value);
const rejects = (code, callback) => assert.throws(callback, error => error instanceof LegacyGroupWebRuntimeError && error.code === code);

test("deployed Group Web source and live database reconcile to the exact L1-L3 module boundary", () => {
  assert.deepEqual(verifyLegacyGroupWebRuntime(manifest), {
    ok: true,
    modules: 231,
    navigableModules: 186,
    domains: 12,
    atomicActions: 7,
    remainingCompatibilityGates: 3,
    productionImport: "HOLD"
  });
});

test("all twelve top-level domains reconcile exactly to 231 legacy modules", () => {
  assert.equal(manifest.topLevelDomains.reduce((sum, domain) => sum + domain.legacyModuleCount, 0), 231);
  const duplicate = clone(manifest);
  duplicate.topLevelDomains[1].id = duplicate.topLevelDomains[0].id;
  rejects("GROUP_WEB_DOMAIN_INVALID", () => verifyLegacyGroupWebRuntime(duplicate));
  const lost = clone(manifest);
  lost.topLevelDomains[0].legacyModuleCount -= 1;
  rejects("GROUP_WEB_DOMAIN_SET_INVALID", () => verifyLegacyGroupWebRuntime(lost));
});

test("route-source reconciliation and seven action atoms fail closed on drift", () => {
  const missingRoute = clone(manifest);
  missingRoute.deploymentEvidence.modules.routeFilesResolved -= 1;
  rejects("GROUP_WEB_MODULE_BOUNDARY_INVALID", () => verifyLegacyGroupWebRuntime(missingRoute));
  const action = clone(manifest);
  action.atomicAuthorization.actions.pop();
  rejects("GROUP_WEB_AUTHORIZATION_BOUNDARY_INVALID", () => verifyLegacyGroupWebRuntime(action));
});

test("runtime evidence cannot contain credentials, workstation paths, personal data, writes or import release", () => {
  const secret = clone(manifest);
  secret.remainingCompatibilityGates.push(["pass", "word=example"].join(""));
  rejects("GROUP_WEB_SENSITIVE_CONTENT", () => verifyLegacyGroupWebRuntime(secret));
  for (const key of ["credentialsRecorded", "personalValuesRecorded", "screenshotsCommitted", "sourceFilesCommitted", "writeActionsExecuted"]) {
    const unsafe = clone(manifest);
    unsafe.security[key] = true;
    rejects("GROUP_WEB_SECURITY_INVALID", () => verifyLegacyGroupWebRuntime(unsafe));
  }
  const released = clone(manifest);
  released.productionImport = "GO";
  rejects("GROUP_WEB_PRODUCTION_IMPORT_NOT_HELD", () => verifyLegacyGroupWebRuntime(released));
});
