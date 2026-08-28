import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, linkSync, mkdtempSync, readFileSync, realpathSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  GROUP_WEB_ROLE_UAT_IDS,
  GROUP_WEB_ROLE_UAT_ROLES,
  GroupWebRoleUatError,
  canonicalBytes,
  groupWebRoleUatSha256,
  readExternalEvidence,
  writeExternalEvidence
} from "./group-web-role-uat-lib.mjs";
import { runGroupWebRoleUat } from "./group-web-role-uat-runner.mjs";
import { reviewGroupWebRoleUat } from "./group-web-role-uat-reviewer.mjs";
import { collectGroupWebRoleUat } from "./group-web-role-uat-readonly-collector.mjs";
import { legacyRuntimePageArtifactDescriptorHash, legacyRuntimePageObservationHash } from "./legacy-runtime-page-evidence-lib.mjs";
import { adaptGroupWebRoleUatToLegacyRuntimeEvidence, assessGroupWebRoleUatLegacyCoverage } from "./group-web-role-uat-coverage-adapter.mjs";

const mapping = JSON.parse(readFileSync(new URL("./contracts/legacy-group-web-module-mapping-v1.json", import.meta.url), "utf8"));

const hash = value => createHash("sha256").update(value).digest("hex").replace(/[0-9]/gu, digit => "abcdef"[Number(digit) % 6]);
const expectCode = (code, callback) => assert.throws(callback, error => error instanceof GroupWebRoleUatError && error.code === code);

function privateFixture() {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "group-web-role-uat-")));
  chmodSync(directory, 0o700);
  const paths = { directory, runtimeCoverage: join(directory, "runtime-coverage.json"), deploymentEvidence: join(directory, "deployment-evidence.json"), authorizationEvidence: join(directory, "authorization-evidence.json"), runtimeTechnical: join(directory, "runtime-technical.json"), liveAttestation: join(directory, "live-attestation.json"), collectorBundle: join(directory, "collector-bundle.json"), grant: join(directory, "grant.json"), observations: join(directory, "observations.json"), result: join(directory, "result.json"), review: join(directory, "review.json") };
  const write = (path, value) => { writeFileSync(path, canonicalBytes(value), { mode: 0o600 }); chmodSync(path, 0o600); };
  const itemMeta = [
    [34, "onboarding", "4807e2b2dcbb711ecddebe418225d2cc0aa0b762f03538a4d025d915c126ecce"], [35, "employee-profile", "c4513e2e72aa0fd3451666020bd3937234a8ba6340bf12f23acc82025f7a294e"],
    [36, "probation", "9b2b99d3562306086f3d0808ceb08e23d73d491aab86083cda22b6efebe9a2fc"], [37, "contract", "b0771da44fc0766885601f4fd03166f55e755118ac59848aaa15663b18476077"],
    [39, "job-change", "c3baa5d9d328be76fda96dab72d541d25ae84783a7456b9d7bf89b7a6821a00c"], [42, "departure", "f105a0acde0dd716ffe7d8e882950560d140fe87e6d53a11390c12e962f5614e"],
    [43, "exit-interview", "a1d64c77611539c328e76796fe2402cdfb9ba6c55a39d66a7c8aec746e0a5379"], [44, "exit-survey", "c4a090ea503b904e4bc23be82a1b5a3780a74bb6d16f87daf8e96550a3e052bf"],
    [45, "handover", "ad23336e29db453250f4a0dcb4f267703192fbb13428ff36dc3165fb5c43e8fe"], [46, "wage-settlement", "1fc6fc30b621ae50fdac6c0d28e9332f0e697ac1954851fad556198062351b8d"],
    [47, "archive-close", "1e66e83cf51404aab0acf85a9f1f213ca0a9d1c03ac0e825ee5f58b1242d66cb"], [313, "work-log", "286c5028963b5423fe98963e1a1ddec87be3045c89c38784f571bc2b8e4d9ad3"]
  ];
  const roleClasses = { employee: "group_web_employee", manager: "group_web_manager", web_admin: "group_web_web_admin" };
  const coverageObservations = itemMeta.flatMap(([legacyId, pageSlug, routeHash]) => GROUP_WEB_ROLE_UAT_ROLES.map(role => {
    const roleClass = roleClasses[role];
    const pageId = `group-web:${legacyId}:${roleClass}:${pageSlug}:page`;
    const decision = role === "web_admin" || (legacyId === 313 && role === "employee") ? "allow" : "deny";
    const artifact = { screenshotSha256: null, bytes: 0, externalMode: "0600" };
    artifact.descriptorSha256 = legacyRuntimePageArtifactDescriptorHash(artifact);
    const row = {
      stableId: pageId,
      familyOrDomain: pageSlug,
      legacyId,
      roleClass,
      viewport: "desktop",
      locatorSha256: routeHash,
      pageStructureSha256: hash(`structure:${legacyId}:${role}`),
      fieldEvidence: [{ stableId: `${pageId}:field:projection`, labelSha256: hash(`field-label:${legacyId}:${role}`), controlType: "other", required: "unproven", defaultKind: "unproven", masked: role !== "web_admin" }],
      actionEvidence: [{ stableId: `${pageId}:action:primary`, visible: decision === "allow", enabled: decision === "allow", executed: false, preconditionCode: "NONE" }],
      stateEvidence: [{ stableId: `${pageId}:transition:observed:observed`, fromCodeSha256: hash(`state-from:${legacyId}:${role}`), toCodeSha256: hash(`state-to:${legacyId}:${role}`), source: "source_corroborated", executed: false }],
      permissionEvidence: { expected: decision, observed: decision, dataScope: decision === "deny" ? "none" : role === "web_admin" ? "admin" : "self", directRouteChecked: true },
      artifact
    };
    row.observationSha256 = legacyRuntimePageObservationHash(row);
    return row;
  }));
  const runtimeCoverage = { formatVersion: 1, contractKind: "yuzhou_hr_legacy_runtime_page_evidence", surface: "group_web", batchId: "group-web-role-uat-fixture", operationMode: "read_only", sourceContractSha256: "6dd615b2d8915db6aa56e7a87fbae8cba6a82cc0b3847d5183fbe367336d68af", observations: coverageObservations, sensitiveScan: "PASS", humanSignoff: "HOLD", productionImport: "HOLD" };
  const runtimeCoverageRawSha256 = groupWebRoleUatSha256(canonicalBytes(runtimeCoverage));
  const coverageByKey = new Map(coverageObservations.map(row => {
    const role = GROUP_WEB_ROLE_UAT_ROLES.find(candidate => roleClasses[candidate] === row.roleClass);
    return [`${row.legacyId}:${role}`, row];
  }));
  const now = new Date().toISOString();
  const deploymentEvidence = { formatVersion: 1, kind: "group_web_deployment_identity", surface: "legacy_group_web", captureMode: "authenticated_readonly", observedAt: now, sourceInventoryHash: "b34ba532888fee122f93305403f8985bcb9bd1a5ccec69e8013b1d4c4f14e296", deploymentSourceManifestSha256: hash("deployment-source-manifest"), routeManifestSha256: hash("route-manifest"), productionImport: "HOLD" };
  const deploymentEvidenceRawSha256 = groupWebRoleUatSha256(canonicalBytes(deploymentEvidence));
  const authorizationCells = itemMeta.flatMap(([legacyId]) => GROUP_WEB_ROLE_UAT_ROLES.map(role => {
    const page = coverageByKey.get(`${legacyId}:${role}`);
    return { legacyId, role, decision: page.permissionEvidence.expected, menuDecision: page.permissionEvidence.expected === "allow" ? "visible" : "hidden", directRouteDecision: page.permissionEvidence.observed, fieldPolicySha256: groupWebRoleUatSha256(page.fieldEvidence), actionPolicySha256: groupWebRoleUatSha256(page.actionEvidence), statePolicySha256: groupWebRoleUatSha256(page.stateEvidence), runtimePageObservationSha256: page.observationSha256 };
  }));
  const authorizationEvidence = { formatVersion: 1, kind: "group_web_authorization_authority", surface: "legacy_group_web", captureMode: "authenticated_readonly", observedAt: now, sourceInventoryHash: deploymentEvidence.sourceInventoryHash, runtimeCoverageRawSha256, cells: authorizationCells, productionImport: "HOLD" };
  const authorizationEvidenceRawSha256 = groupWebRoleUatSha256(canonicalBytes(authorizationEvidence));
  const runtimeTechnical = { formatVersion: 1, kind: "group_web_role_uat_runtime_technical", surface: "legacy_group_web", captureMode: "authenticated_readonly", observedAt: now, sourceInventoryHash: deploymentEvidence.sourceInventoryHash, runtimeCoverageRawSha256, deploymentEvidenceRawSha256, authorizationEvidenceRawSha256, cells: authorizationCells.map(cell => ({ legacyId: cell.legacyId, role: cell.role, runtimePageObservationSha256: cell.runtimePageObservationSha256, menuDecision: cell.menuDecision, directRouteDecision: cell.directRouteDecision, auditObserved: true, auditMetadataSha256: hash(`audit:${cell.legacyId}:${cell.role}`), sourceBeforeSha256: hash(`source:${cell.legacyId}:${cell.role}`), sourceAfterSha256: hash(`source:${cell.legacyId}:${cell.role}`), sessionIdentitySha256: hash(`session:${cell.legacyId}:${cell.role}`), postLogoutSessionRejected: true, clientStorageEmpty: true })), productionImport: "HOLD" };
  const runtimeTechnicalRawSha256 = groupWebRoleUatSha256(canonicalBytes(runtimeTechnical));
  write(paths.runtimeCoverage, runtimeCoverage); write(paths.deploymentEvidence, deploymentEvidence); write(paths.authorizationEvidence, authorizationEvidence); write(paths.runtimeTechnical, runtimeTechnical);
  const collected = collectGroupWebRoleUat({ runtimeCoveragePath: paths.runtimeCoverage, deploymentEvidencePath: paths.deploymentEvidence, authorizationEvidencePath: paths.authorizationEvidence, runtimeTechnicalPath: paths.runtimeTechnical, outputPath: paths.collectorBundle });
  const collectorBundleRawSha256 = collected.written.rawSha256;
  const grant = {
    formatVersion: 1,
    evidenceKind: "group_web_role_grant_snapshot",
    surface: "legacy_group_web",
    captureMode: "authenticated_readonly",
    sourceInventoryHash: "b34ba532888fee122f93305403f8985bcb9bd1a5ccec69e8013b1d4c4f14e296",
    runtimeCoverageRawSha256,
    captureProvenance: { collectorContractSha256: "72725d0e9ceb755a1d1908329e70bd1f033913fd94db4d6cf76b6b1c8271fd13", collectorSourceRawSha256: collected.bundle.collectorSourceRawSha256, collectorBundleRawSha256, runtimeCoverageRawSha256, deploymentEvidenceRawSha256, authorizationEvidenceRawSha256, runtimeTechnicalRawSha256 },
    observedAt: now,
    roles: GROUP_WEB_ROLE_UAT_ROLES.map(role => ({
      role,
      subjectIdentitySha256: hash(`subject:${role}`),
      authorizationContextSha256: hash(`context:${role}`),
      grants: GROUP_WEB_ROLE_UAT_IDS.map(legacyId => {
        const page = coverageByKey.get(`${legacyId}:${role}`), authority = authorizationCells.find(cell => cell.legacyId === legacyId && cell.role === role), technical = runtimeTechnical.cells.find(cell => cell.legacyId === legacyId && cell.role === role);
        const decision = authority.decision;
        return {
          legacyId,
          decision,
          menuDecision: authority.menuDecision,
          directRouteDecision: authority.directRouteDecision,
          fieldPolicySha256: authority.fieldPolicySha256,
          actionPolicySha256: authority.actionPolicySha256,
          statePolicySha256: authority.statePolicySha256,
          runtimePageObservationSha256: page.observationSha256,
          sessionIdentitySha256: technical.sessionIdentitySha256
        };
      })
    })),
    productionImport: "HOLD"
  };
  const grantBytes = canonicalBytes(grant);
  const grantSnapshotRawSha256 = groupWebRoleUatSha256(grantBytes);
  const grantByKey = new Map(grant.roles.flatMap(role => role.grants.map(item => [`${item.legacyId}:${role.role}`, { ...item, role: role.role, subjectIdentitySha256: role.subjectIdentitySha256, authorizationContextSha256: role.authorizationContextSha256 }])));
  const observations = {
    formatVersion: 1,
    evidenceKind: "group_web_role_uat_observations",
    surface: "legacy_group_web",
    captureMode: "authenticated_readonly",
    sourceInventoryHash: grant.sourceInventoryHash,
    grantSnapshotRawSha256,
    observedAt: now,
    cells: GROUP_WEB_ROLE_UAT_IDS.flatMap(legacyId => GROUP_WEB_ROLE_UAT_ROLES.map(role => {
      const item = grantByKey.get(`${legacyId}:${role}`);
      const grantPayload = { legacyId: item.legacyId, role: item.role, decision: item.decision, menuDecision: item.menuDecision, directRouteDecision: item.directRouteDecision, fieldPolicySha256: item.fieldPolicySha256, actionPolicySha256: item.actionPolicySha256, statePolicySha256: item.statePolicySha256, runtimePageObservationSha256: item.runtimePageObservationSha256, sessionIdentitySha256: item.sessionIdentitySha256, subjectIdentitySha256: item.subjectIdentitySha256, authorizationContextSha256: item.authorizationContextSha256 };
      return {
        legacyId,
        role,
        decision: item.decision,
        grantCellSha256: groupWebRoleUatSha256(grantPayload),
        subjectIdentitySha256: item.subjectIdentitySha256,
        authorizationContextSha256: item.authorizationContextSha256,
        sessionIdentitySha256: item.sessionIdentitySha256,
        checks: {
          menu: { status: "PASS", expectedDecision: item.menuDecision, observedDecision: item.menuDecision, runtimePageObservationSha256: item.runtimePageObservationSha256, observationSha256: hash(`observation:${legacyId}:${role}:menu`) },
          field: { status: "PASS", policySha256: item.fieldPolicySha256, observationSha256: hash(`observation:${legacyId}:${role}:field`) },
          action: { status: "PASS", policySha256: item.actionPolicySha256, observationSha256: hash(`observation:${legacyId}:${role}:action`) },
          state: { status: "PASS", policySha256: item.statePolicySha256, observationSha256: hash(`observation:${legacyId}:${role}:state`) },
          direct_route: { status: "PASS", expectedDecision: item.directRouteDecision, observedDecision: item.directRouteDecision, observationSha256: hash(`observation:${legacyId}:${role}:direct_route`) },
          audit: { status: "PASS", auditObserved: true, auditMetadataSha256: runtimeTechnical.cells.find(cell => cell.legacyId === legacyId && cell.role === role).auditMetadataSha256, observationSha256: hash(`observation:${legacyId}:${role}:audit`) },
          no_write: { status: "PASS", beforeSha256: hash(`source:${legacyId}:${role}`), afterSha256: hash(`source:${legacyId}:${role}`), observationSha256: hash(`observation:${legacyId}:${role}:no_write`) },
          logout_cleanup: { status: "PASS", sessionIdentitySha256: item.sessionIdentitySha256, postLogoutSessionRejected: true, clientStorageEmpty: true, observationSha256: hash(`observation:${legacyId}:${role}:logout_cleanup`) }
        }
      };
    })),
    humanAttestation: "HOLD",
    productionImport: "HOLD"
  };
  for (const cell of observations.cells) {
    const key = `${cell.legacyId}:${cell.role}`;
    for (const [checkName, check] of Object.entries(cell.checks)) {
      const semanticEvidence = Object.fromEntries(Object.entries(check).filter(([name]) => name !== "observationSha256"));
      check.observationSha256 = groupWebRoleUatSha256({ key, checkName, semanticEvidence });
    }
  }
  write(paths.grant, grant); write(paths.observations, observations);
  return { runtimeCoverage, deploymentEvidence, authorizationEvidence, runtimeTechnical, grant, observations, paths, write };
}

const runFixture = fixture => runGroupWebRoleUat({ runtimeCoveragePath: fixture.paths.runtimeCoverage, deploymentEvidencePath: fixture.paths.deploymentEvidence, authorizationEvidencePath: fixture.paths.authorizationEvidence, runtimeTechnicalPath: fixture.paths.runtimeTechnical, collectorBundlePath: fixture.paths.collectorBundle, grantSnapshotPath: fixture.paths.grant, observationsPath: fixture.paths.observations, outputPath: fixture.paths.result });
const runFixtureWith = (fixture, overrides) => runGroupWebRoleUat({ runtimeCoveragePath: fixture.paths.runtimeCoverage, deploymentEvidencePath: fixture.paths.deploymentEvidence, authorizationEvidencePath: fixture.paths.authorizationEvidence, runtimeTechnicalPath: fixture.paths.runtimeTechnical, collectorBundlePath: fixture.paths.collectorBundle, grantSnapshotPath: fixture.paths.grant, observationsPath: fixture.paths.observations, outputPath: fixture.paths.result, ...overrides });
const reviewFixture = fixture => reviewGroupWebRoleUat({ runtimeCoveragePath: fixture.paths.runtimeCoverage, deploymentEvidencePath: fixture.paths.deploymentEvidence, authorizationEvidencePath: fixture.paths.authorizationEvidence, runtimeTechnicalPath: fixture.paths.runtimeTechnical, collectorBundlePath: fixture.paths.collectorBundle, grantSnapshotPath: fixture.paths.grant, observationsPath: fixture.paths.observations, resultPath: fixture.paths.result, outputPath: fixture.paths.review });

test("runner and independent reviewer close the 12 by 3 legacy Group Web matrix", () => {
  const fixture = privateFixture();
  const run = runFixture(fixture);
  assert.deepEqual(run.result.summary, { entries: 12, roles: 3, cells: 36, sessions: 36, allowDenyPairs: 12, checksPerCell: 8, passedChecks: 288 });
  assert.equal(run.result.clientEvidenceSubstitution, "FORBIDDEN");
  assert.equal(run.result.humanAttestation, "HOLD");
  assert.equal(run.result.productionImport, "HOLD");
  const review = reviewFixture(fixture);
  assert.equal(review.review.status, "MACHINE_VERIFIED");
  assert.equal(review.review.humanAttestation, "HOLD");
  assert.equal(review.review.productionImport, "HOLD");
  assert.equal((readFileSync(fixture.paths.result).byteLength > 0), true);
  assert.equal((readFileSync(fixture.paths.review).byteLength > 0), true);
});

test("every legacy entry must contain a grant-backed allow and deny pair", () => {
  const fixture = privateFixture();
  for (const role of fixture.grant.roles) role.grants.find(item => item.legacyId === 34).decision = "allow";
  fixture.write(fixture.paths.grant, fixture.grant);
  expectCode("GROUP_WEB_ROLE_UAT_GRANT_CELL_INVALID", () => runFixture(fixture));
});

test("client evidence, sensitive payloads and direct-route bypasses fail closed", () => {
  const client = privateFixture();
  client.grant.surface = "desktop_client";
  client.write(client.paths.grant, client.grant);
  expectCode("GROUP_WEB_ROLE_UAT_GRANT_SNAPSHOT_INVALID", () => runFixture(client));

  const sensitive = privateFixture();
  sensitive.observations.cells[0].cookie = hash("forbidden");
  sensitive.write(sensitive.paths.observations, sensitive.observations);
  expectCode("GROUP_WEB_ROLE_UAT_SENSITIVE_PAYLOAD", () => runFixture(sensitive));

  const bypass = privateFixture();
  bypass.grant.roles[0].grants[0].directRouteDecision = "allow";
  bypass.write(bypass.paths.grant, bypass.grant);
  const newGrantHash = groupWebRoleUatSha256(readFileSync(bypass.paths.grant));
  bypass.observations.grantSnapshotRawSha256 = newGrantHash;
  const grant = bypass.grant.roles[0].grants[0];
  const role = bypass.grant.roles[0];
  bypass.observations.cells[0].grantCellSha256 = groupWebRoleUatSha256({ legacyId: grant.legacyId, role: role.role, decision: grant.decision, menuDecision: grant.menuDecision, directRouteDecision: grant.directRouteDecision, fieldPolicySha256: grant.fieldPolicySha256, actionPolicySha256: grant.actionPolicySha256, statePolicySha256: grant.statePolicySha256, runtimePageObservationSha256: grant.runtimePageObservationSha256, sessionIdentitySha256: grant.sessionIdentitySha256, subjectIdentitySha256: role.subjectIdentitySha256, authorizationContextSha256: role.authorizationContextSha256 });
  bypass.write(bypass.paths.observations, bypass.observations);
  expectCode("GROUP_WEB_ROLE_UAT_GRANT_CELL_INVALID", () => runFixture(bypass));
});

test("external evidence permissions and independent review binding are mandatory", () => {
  const unsafe = privateFixture();
  chmodSync(unsafe.paths.grant, 0o644);
  expectCode("GROUP_WEB_ROLE_UAT_SOURCE_UNSAFE", () => runFixture(unsafe));

  const drift = privateFixture();
  runFixture(drift);
  const result = JSON.parse(readFileSync(drift.paths.result, "utf8"));
  result.summary.cells = 35;
  drift.write(drift.paths.result, result);
  expectCode("GROUP_WEB_ROLE_UAT_INDEPENDENT_RESULT_DRIFT", () => reviewFixture(drift));
});

test("field policy, audit, no-write and logout facts are semantic gates", () => {
  const arbitrary = privateFixture();
  arbitrary.observations.cells[0].checks.field.observationSha256 = "a".repeat(64);
  arbitrary.write(arbitrary.paths.observations, arbitrary.observations);
  expectCode("GROUP_WEB_ROLE_UAT_OBSERVATION_HASH_INVALID", () => runFixture(arbitrary));

  const policy = privateFixture();
  policy.observations.cells[0].checks.field.policySha256 = hash("wrong-policy");
  policy.write(policy.paths.observations, policy.observations);
  expectCode("GROUP_WEB_ROLE_UAT_CHECK_INVALID", () => runFixture(policy));

  const audit = privateFixture();
  audit.observations.cells[0].checks.audit.auditObserved = false;
  audit.write(audit.paths.observations, audit.observations);
  expectCode("GROUP_WEB_ROLE_UAT_CHECK_INVALID", () => runFixture(audit));

  const write = privateFixture();
  write.observations.cells[0].checks.no_write.afterSha256 = hash("changed-source");
  write.write(write.paths.observations, write.observations);
  expectCode("GROUP_WEB_ROLE_UAT_WRITE_DETECTED", () => runFixture(write));

  const logout = privateFixture();
  logout.observations.cells[0].checks.logout_cleanup.clientStorageEmpty = false;
  logout.write(logout.paths.observations, logout.observations);
  expectCode("GROUP_WEB_ROLE_UAT_LOGOUT_CLEANUP_FAILED", () => runFixture(logout));
});

test("menu semantics, unique session lifecycle, capture provenance and observed time are mandatory", () => {
  const menu = privateFixture();
  menu.observations.cells[0].checks.menu.observedDecision = "visible";
  menu.write(menu.paths.observations, menu.observations);
  expectCode("GROUP_WEB_ROLE_UAT_MENU_OBSERVATION_DRIFT", () => runFixture(menu));

  const session = privateFixture();
  session.grant.roles[0].grants[1].sessionIdentitySha256 = session.grant.roles[0].grants[0].sessionIdentitySha256;
  session.write(session.paths.grant, session.grant);
  expectCode("GROUP_WEB_ROLE_UAT_GRANT_CELL_INVALID", () => runFixture(session));

  const provenance = privateFixture();
  provenance.grant.captureProvenance.collectorContractSha256 = "f".repeat(64);
  provenance.write(provenance.paths.grant, provenance.grant);
  expectCode("GROUP_WEB_ROLE_UAT_CAPTURE_PROVENANCE_INVALID", () => runFixture(provenance));

  const future = privateFixture();
  future.grant.observedAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  future.write(future.paths.grant, future.grant);
  expectCode("GROUP_WEB_ROLE_UAT_OBSERVED_AT_FUTURE", () => runFixture(future));
});

test("legacy runtime semantic manifest and surface adapter cannot be tampered or substituted", () => {
  const tamper = privateFixture();
  tamper.runtimeCoverage.observations[0].fieldEvidence[0].masked = !tamper.runtimeCoverage.observations[0].fieldEvidence[0].masked;
  tamper.write(tamper.paths.runtimeCoverage, tamper.runtimeCoverage);
  expectCode("GROUP_WEB_ROLE_UAT_RUNTIME_COVERAGE_INVALID", () => runFixture(tamper));

  const surface = privateFixture();
  surface.runtimeCoverage.surface = "client";
  surface.write(surface.paths.runtimeCoverage, surface.runtimeCoverage);
  expectCode("GROUP_WEB_ROLE_UAT_RUNTIME_COVERAGE_INVALID", () => runFixture(surface));

  const policy = privateFixture();
  policy.grant.roles[2].grants[0].fieldPolicySha256 = "a".repeat(64);
  policy.write(policy.paths.grant, policy.grant);
  expectCode("GROUP_WEB_ROLE_UAT_GRANT_CELL_INVALID", () => runFixture(policy));
});

test("symlink hardlink inode output reuse and read/write TOCTOU fail closed", () => {
  const symlink = privateFixture();
  const symlinkPath = join(symlink.paths.directory, "grant-link.json");
  symlinkSync(symlink.paths.grant, symlinkPath);
  expectCode("GROUP_WEB_ROLE_UAT_SOURCE_UNSAFE", () => runFixtureWith(symlink, { grantSnapshotPath: symlinkPath }));

  const hardlink = privateFixture();
  linkSync(hardlink.paths.grant, join(hardlink.paths.directory, "grant-hard.json"));
  expectCode("GROUP_WEB_ROLE_UAT_SOURCE_UNSAFE", () => runFixture(hardlink));

  const inode = privateFixture();
  expectCode("GROUP_WEB_ROLE_UAT_SOURCE_REUSE", () => runFixtureWith(inode, { grantSnapshotPath: inode.paths.runtimeCoverage }));

  const output = privateFixture();
  output.write(output.paths.result, { occupied: true });
  expectCode("GROUP_WEB_ROLE_UAT_OUTPUT_EXISTS", () => runFixture(output));

  const readRace = privateFixture();
  expectCode("GROUP_WEB_ROLE_UAT_SOURCE_UNSAFE", () => readExternalEvidence(readRace.paths.grant, process.cwd(), "GROUP_WEB_ROLE_UAT_SOURCE_UNSAFE", ({ path }) => writeFileSync(path, " ", { flag: "a" })));

  const writeRace = privateFixture();
  const swapped = join(writeRace.paths.directory, "swapped.json");
  expectCode("GROUP_WEB_ROLE_UAT_OUTPUT_UNSAFE", () => writeExternalEvidence(writeRace.paths.result, process.cwd(), { safe: true }, "GROUP_WEB_ROLE_UAT_OUTPUT_UNSAFE", ({ path }) => {
    renameSync(path, swapped);
    writeFileSync(path, canonicalBytes({ replacement: true }), { mode: 0o600 });
    chmodSync(path, 0o600);
  }));
});

test("reviewer uses an independent semantic implementation rather than runner assess", () => {
  const reviewerSource = readFileSync(new URL("./group-web-role-uat-reviewer.mjs", import.meta.url), "utf8");
  const independentSource = readFileSync(new URL("./group-web-role-uat-independent-review-lib.mjs", import.meta.url), "utf8");
  assert.equal(reviewerSource.includes("assessGroupWebRoleUat"), false);
  assert.equal(independentSource.includes("assessGroupWebRoleUat"), false);
  assert.equal(independentSource.includes("independentlyReviewGroupWebRoleUat"), true);
});

test("legacy coverage consumer keeps contract fixtures and synthesized reviews at zero and HOLD", () => {
  const fixture = privateFixture();
  const run = runFixture(fixture);
  const reviewed = reviewFixture(fixture);
  const inputs = { runtimeCoverage: fixture.runtimeCoverage, deploymentEvidence: fixture.deploymentEvidence, runtimeTechnical: fixture.runtimeTechnical, result: run.result, resultRawSha256: readExternalEvidence(fixture.paths.result, process.cwd()).rawSha256, review: reviewed.review };
  const adapted = adaptGroupWebRoleUatToLegacyRuntimeEvidence({ mapping, ...inputs });
  assert.deepEqual(adapted, { status: "HOLD", reason: "LIVE_EXTERNAL_ATTESTATION_MISSING", evidence: null });
  const consumed = assessGroupWebRoleUatLegacyCoverage(mapping, process.cwd(), inputs);
  assert.equal(consumed.adapted.status, "HOLD");
  assert.equal(consumed.coverage.items.filter(item => item.legacyRuntimeUat).length, 0);
  const forged = { ...inputs, deploymentEvidence: { ...inputs.deploymentEvidence, evidenceClass: "live_external_capture" }, review: { ...inputs.review, resultRawSha256: "a".repeat(64) } };
  assert.equal(adaptGroupWebRoleUatToLegacyRuntimeEvidence({ mapping, ...forged }).reason, "LIVE_EXTERNAL_ATTESTATION_MISSING");
});

test("self-reported evidenceClass and unauthorized attestation cannot unlock legacy runtime score", () => {
  const fixture = privateFixture();
  fixture.deploymentEvidence.evidenceClass = "live_external_capture";
  fixture.write(fixture.paths.deploymentEvidence, fixture.deploymentEvidence);
  expectCode("GROUP_WEB_ROLE_UAT_DEPLOYMENT_EVIDENCE_INVALID", () => runFixture(fixture));

  const unauthorized = privateFixture();
  unauthorized.write(unauthorized.paths.liveAttestation, { formatVersion: 1, kind: "claimed_live_attestation", productionImport: "HOLD" });
  expectCode("GROUP_WEB_ROLE_UAT_ATTESTATION_NOT_AUTHORIZED", () => collectGroupWebRoleUat({ runtimeCoveragePath: unauthorized.paths.runtimeCoverage, deploymentEvidencePath: unauthorized.paths.deploymentEvidence, authorizationEvidencePath: unauthorized.paths.authorizationEvidence, runtimeTechnicalPath: unauthorized.paths.runtimeTechnical, liveCaptureAttestationPath: unauthorized.paths.liveAttestation, outputPath: join(unauthorized.paths.directory, "second-bundle.json") }));

  const badMode = privateFixture();
  badMode.write(badMode.paths.liveAttestation, { safe: true }); chmodSync(badMode.paths.liveAttestation, 0o644);
  expectCode("GROUP_WEB_ROLE_UAT_SOURCE_UNSAFE", () => collectGroupWebRoleUat({ runtimeCoveragePath: badMode.paths.runtimeCoverage, deploymentEvidencePath: badMode.paths.deploymentEvidence, authorizationEvidencePath: badMode.paths.authorizationEvidence, runtimeTechnicalPath: badMode.paths.runtimeTechnical, liveCaptureAttestationPath: badMode.paths.liveAttestation, outputPath: join(badMode.paths.directory, "second-bundle.json") }));

  const reused = privateFixture();
  expectCode("GROUP_WEB_ROLE_UAT_COLLECTOR_SOURCE_REUSE", () => collectGroupWebRoleUat({ runtimeCoveragePath: reused.paths.runtimeCoverage, deploymentEvidencePath: reused.paths.deploymentEvidence, authorizationEvidencePath: reused.paths.authorizationEvidence, runtimeTechnicalPath: reused.paths.runtimeTechnical, liveCaptureAttestationPath: reused.paths.deploymentEvidence, outputPath: join(reused.paths.directory, "second-bundle.json") }));
});
