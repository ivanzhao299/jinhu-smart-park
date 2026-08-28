#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chmodSync, lstatSync, statSync } from "node:fs";
import { resolve } from "node:path";

const LAB_ID = /^jinhu_hr_migration_lab_full_[a-z0-9_]{6,48}$/;
const FORBIDDEN_TARGET = /prod(?:uction)?|jinhu_smart_park|shared|default/i;

export const ALLOWED_REHEARSAL_FAULTS = Object.freeze([
  "REGISTERED_FILE_UNREADABLE"
]);

const DETECTOR_BY_FAULT = Object.freeze({
  REGISTERED_FILE_UNREADABLE: "FILE_TREE_UNREADABLE"
});

export class FaultInjectionError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "FaultInjectionError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new FaultInjectionError(code, detail); };
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export function validateFaultId(value) {
  if (!ALLOWED_REHEARSAL_FAULTS.includes(value)) fail("FAULT_NOT_ALLOWLISTED", String(value));
  return value;
}

function validateTargetIdentity(value) {
  if (!LAB_ID.test(value ?? "") || FORBIDDEN_TARGET.test(value)) fail("FAULT_TARGET_DENIED", String(value));
}

function assertCallback(value, label) {
  if (typeof value !== "function") fail("FAULT_CALLBACK_MISSING", label);
}

export function injectAllowlistedFault(options) {
  const faultId = validateFaultId(options?.faultId);
  validateTargetIdentity(options?.targetIdentity);
  const detectorCode = DETECTOR_BY_FAULT[faultId];
  let detectorObserved = false;
  let detectorFailure = null;
  let revertFailure = null;

  const file = resolve(options.registeredFile ?? "");
  if (options.registered !== true || !file || lstatSync(file).isSymbolicLink() || !statSync(file).isFile()) fail("FAULT_FILE_NOT_REGISTERED", "registered regular file required");
  assertCallback(options.detectFile, "detectFile");
  const originalMode = statSync(file).mode & 0o777;
  try {
    chmodSync(file, 0o000);
    try { options.detectFile(); }
    catch (error) {
      if (error?.code === detectorCode) detectorObserved = true;
      else detectorFailure = error;
    }
  } finally {
    try { chmodSync(file, originalMode); } catch (error) { revertFailure = error; }
  }

  if (revertFailure) fail("FAULT_REVERT_FAILED", faultId);
  if (detectorFailure) fail("FAULT_DETECTOR_FAILED", faultId);
  if (!detectorObserved) fail("FAULT_NOT_DETECTED", faultId);
  return {
    faultId,
    status: "DETECTED",
    detectorCode,
    reverted: true,
    targetIdentitySha256: sha256(options.targetIdentity)
  };
}
