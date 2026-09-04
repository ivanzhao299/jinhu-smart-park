#!/usr/bin/env node
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildLegacyUnitSettingsPageObservationReceipt,
  LegacyUnitSettingsPageObservationError,
} from "../hr-cutover/legacy-unit-settings-page-observation-receipt.mjs";

const root = resolve(import.meta.dirname, "../..");
const contractPath = resolve(root, "scripts/hr-cutover/contracts/legacy-unit-settings-page-observation-v1.json");
const contract = () => JSON.parse(readFileSync(contractPath, "utf8"));
const build = (observation = null, evidenceOrigin = "no_live_observation", selectedContract = contract()) => buildLegacyUnitSettingsPageObservationReceipt({
  contract: selectedContract,
  repositoryRoot: root,
  observation,
  evidenceOrigin,
});
const rejects = (code, action) => assert.throws(
  action,
  error => error instanceof LegacyUnitSettingsPageObservationError && error.code === code,
);
const liveObservation = () => ({
  navigationSource: {
    surface: "desktop_client",
    atomicId: "client.organization_job.001",
    familyId: "organization_job",
    entryPoint: "单位设置",
    navigationKind: "legacy_menu_entry",
  },
  window: {
    stableId: "unit-settings.window.primary",
    titleLabel: "单位设置",
    windowType: "main_window",
    modal: false,
  },
  controls: [
    {
      stableId: "unit-settings.control.address",
      parentWindowStableId: "unit-settings.window.primary",
      fieldLabel: "单位地址",
      controlType: "text_input",
      required: false,
      readOnly: false,
      visibilityCondition: "always",
    },
    {
      stableId: "unit-settings.control.email",
      parentWindowStableId: "unit-settings.window.primary",
      fieldLabel: "电子邮箱",
      controlType: "text_input",
      required: false,
      readOnly: false,
      visibilityCondition: "always",
    },
    {
      stableId: "unit-settings.control.master-unknown",
      parentWindowStableId: "unit-settings.window.primary",
      fieldLabel: "负责人",
      controlType: "unknown",
      required: false,
      readOnly: false,
      visibilityCondition: "unknown",
    }
  ],
  buttons: [
    {
      stableId: "unit-settings.button.save",
      parentWindowStableId: "unit-settings.window.primary",
      buttonLabel: "保存",
      action: "save",
      visibilityCondition: "role_gated",
    }
  ],
  observedRole: "hr_admin",
  screenshots: [
    {
      sha256: "a".repeat(64),
      windowStableId: "unit-settings.window.primary",
      captureKind: "full_window",
    }
  ],
  observedAt: "2026-09-04T08:00:00Z",
  semanticGapObservations: [
    { sourceColumn: "company.addr", pageControlStableId: "unit-settings.control.address", pageLabelObserved: "单位地址", semanticStatus: "pending_authoritative_confirmation", authoritativeMeaning: null },
    { sourceColumn: "company.email", pageControlStableId: "unit-settings.control.email", pageLabelObserved: "电子邮箱", semanticStatus: "pending_authoritative_confirmation", authoritativeMeaning: null },
    { sourceColumn: "company.master", pageControlStableId: null, pageLabelObserved: null, semanticStatus: "pending_authoritative_confirmation", authoritativeMeaning: null },
  ],
});

test("missing live page observation stays pending with zero credit", () => {
  const receipt = build();
  assert.equal(receipt.atomicEntry.atomicId, "client.organization_job.001");
  assert.equal(receipt.atomicEntry.entryPoint, "单位设置");
  assert.equal(receipt.windowIdentity, null);
  assert.deepEqual(receipt.controls, []);
  assert.deepEqual(receipt.buttons, []);
  assert.equal(receipt.observedRole, "unknown");
  assert.deepEqual(receipt.screenshotEvidence, []);
  assert.equal(receipt.observedAt, null);
  assert.equal(receipt.observationStatus, "pending");
  assert.equal(receipt.status, "LIVE_PAGE_OBSERVATION_PENDING");
  assert.equal(receipt.compatibilityCredit, 0);
  assert.equal(receipt.productionImport, "HOLD");
});

test("complete live observation records only stable UI identity and remains review pending", () => {
  const receipt = build(liveObservation(), "live_desktop_observation");
  assert.equal(receipt.windowIdentity.stableId, "unit-settings.window.primary");
  assert.deepEqual(receipt.controls.map(control => [control.fieldLabel, control.controlType, control.required, control.readOnly]), [
    ["单位地址", "text_input", false, false],
    ["电子邮箱", "text_input", false, false],
    ["负责人", "unknown", false, false],
  ]);
  assert.deepEqual(receipt.buttons.map(button => [button.buttonLabel, button.action]), [["保存", "save"]]);
  assert.equal(receipt.observedRole, "hr_admin");
  assert.equal(receipt.screenshotEvidence[0].sha256, "a".repeat(64));
  assert.equal(receipt.observedAt, "2026-09-04T08:00:00Z");
  assert.equal(receipt.observationStatus, "captured_review_pending");
  assert.equal(receipt.status, "LIVE_PAGE_OBSERVATION_CAPTURED_REVIEW_PENDING");
  assert.equal(receipt.compatibilityCredit, 0);
});

test("addr email and master remain explicit semantic gaps and master is never guessed", () => {
  const receipt = build(liveObservation(), "live_desktop_observation");
  assert.deepEqual(receipt.semanticConfirmationGaps.map(gap => [gap.sourceColumn, gap.authoritativeMeaning, gap.semanticStatus, gap.compatibilityCredit]), [
    ["company.addr", null, "pending_authoritative_confirmation", 0],
    ["company.email", null, "pending_authoritative_confirmation", 0],
    ["company.master", null, "pending_authoritative_confirmation", 0],
  ]);
  assert.ok(receipt.semanticConfirmationGaps.find(gap => gap.sourceColumn === "company.master")?.gapCode.endsWith("NO_GUESS"));
  assert.doesNotMatch(JSON.stringify(receipt), /leader_user_id|负责人账号|负责人用户/u);
});

test("values user identity image paths and incomplete live evidence fail closed", () => {
  const withValue = liveObservation();
  withValue.controls[0].value = "forbidden";
  rejects("UNIT_SETTINGS_OBSERVATION_INVALID", () => build(withValue, "live_desktop_observation"));

  const withUser = liveObservation();
  withUser.username = "forbidden";
  rejects("UNIT_SETTINGS_OBSERVATION_INVALID", () => build(withUser, "live_desktop_observation"));

  const withPath = liveObservation();
  withPath.screenshots[0].path = "/private/screenshot.png";
  rejects("UNIT_SETTINGS_OBSERVATION_INVALID", () => build(withPath, "live_desktop_observation"));

  const incomplete = liveObservation();
  incomplete.screenshots = [];
  rejects("UNIT_SETTINGS_LIVE_OBSERVATION_INCOMPLETE", () => build(incomplete, "live_desktop_observation"));
});

test("source drift semantic promotion and unstable identities fail closed", () => {
  const drift = contract();
  drift.sourceBindings.atomicInventory.sha256 = "0".repeat(64);
  rejects("UNIT_SETTINGS_SOURCE_EVIDENCE_DRIFT", () => build(null, "no_live_observation", drift));

  const promoted = contract();
  promoted.semanticConfirmationGaps[2].authoritativeMeaning = "leader_user_id";
  rejects("UNIT_SETTINGS_SEMANTIC_GAP_INVALID", () => build(null, "no_live_observation", promoted));

  const unstable = liveObservation();
  unstable.controls[0].stableId = "address";
  rejects("UNIT_SETTINGS_STABLE_ID_INVALID", () => build(unstable, "live_desktop_observation"));
});

test("CLI emits a safe pending receipt and accepts only private live observation files", () => {
  const script = resolve(root, "scripts/hr-cutover/legacy-unit-settings-page-observation-receipt.mjs");
  const pending = spawnSync(process.execPath, [script, "--pending"], { encoding: "utf8" });
  assert.equal(pending.status, 0, pending.stderr);
  assert.equal(JSON.parse(pending.stdout).status, "LIVE_PAGE_OBSERVATION_PENDING");
  assert.equal(pending.stderr, "");

  const temporary = mkdtempSync(join(tmpdir(), "unit-settings-observation-"));
  try {
    const input = join(temporary, "observation.json");
    writeFileSync(input, `${JSON.stringify(liveObservation())}\n`, { mode: 0o600 });
    chmodSync(input, 0o600);
    const live = spawnSync(process.execPath, [script, "--observation-file", input], { encoding: "utf8" });
    assert.equal(live.status, 0, live.stderr);
    const receipt = JSON.parse(live.stdout);
    assert.equal(receipt.status, "LIVE_PAGE_OBSERVATION_CAPTURED_REVIEW_PENDING");
    assert.equal(receipt.screenshotBinaryIncluded, false);
    assert.equal(receipt.controlValuesIncluded, false);
    assert.equal(live.stderr, "");
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("serialized receipts contain no control values credentials personal data or screenshot binary", () => {
  for (const receipt of [build(), build(liveObservation(), "live_desktop_observation")]) {
    const serialized = JSON.stringify(receipt);
    assert.doesNotMatch(serialized, /"(?:value|username|userId|password|credential|personalData|imagePath|imageBinary|base64)"\s*:/iu);
    assert.equal(receipt.controlValuesIncluded, false);
    assert.equal(receipt.userIdentityIncluded, false);
    assert.equal(receipt.personalDataIncluded, false);
    assert.equal(receipt.credentialsIncluded, false);
    assert.equal(receipt.screenshotBinaryIncluded, false);
  }
});
