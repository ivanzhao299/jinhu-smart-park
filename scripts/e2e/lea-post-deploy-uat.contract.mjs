import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const browserRunner = readFileSync(new URL("../go-live-browser-uat-check.mjs", import.meta.url), "utf8");
const housingRunner = readFileSync(new URL("./housing-rental-api-e2e.mjs", import.meta.url), "utf8");
const officeRunner = readFileSync(new URL("./lea-post-deploy-office-matrix.mjs", import.meta.url), "utf8");

test("browser UAT persists screenshot, Network, mobile and expected-403 evidence", () => {
  for (const contract of [
    "--browser-url",
    "--close-browser",
    "--direct-paths",
    "--expect-forbidden",
    "--mobile-path-prefixes",
    "--viewport-matrix",
    "--case-file",
    "--require-route-count",
    "--require-case-count",
    "Page.captureScreenshot",
    "Network.responseReceived",
    "page_evidence",
    "horizontalOverflow"
  ]) assert.match(browserRunner, new RegExp(contract.replaceAll("-", "\\-")));
  assert.match(browserRunner, /BROWSER_UAT_USERNAME and BROWSER_UAT_PASSWORD must be supplied together/u);
  assert.match(browserRunner, /horizontal_overflow:/u);
  assert.match(browserRunner, /mobile_viewport_mismatch:/u);
  assert.match(browserRunner, /api_response_failed:/u);
  assert.match(browserRunner, /trackedWebApiPrefix/u);
  assert.doesNotMatch(browserRunner, /Browser\.close"\)\.catch/u);
  assert.match(browserRunner, /safeUsername/u);
  assert.match(browserRunner, /Target\.createBrowserContext/u);
  assert.match(browserRunner, /Target\.disposeBrowserContext/u);
  assert.match(browserRunner, /logoutThroughUi/u);
  assert.match(browserRunner, /auditAnonymousContext/u);
  assert.match(browserRunner, /button\.user-logout-button/u);
  assert.match(browserRunner, /meStatus === 401/u);
  assert.match(browserRunner, /input\[autocomplete=.{0,4}username/u);
  assert.match(browserRunner, /button\[type=.{0,4}submit/u);
  assert.match(browserRunner, /method: "ui_form"/u);
  assert.match(browserRunner, /Input\.dispatchKeyEvent/u);
  assert.match(browserRunner, /login_post_not_observed/u);
  assert.match(browserRunner, /requestAnimationFrame/u);
  assert.match(browserRunner, /data-browser-uat-ready/u);
  assert.doesNotMatch(browserRunner, /submit\.click\(\)/u);
  assert.match(browserRunner, /Network\.requestWillBeSent/u);
  assert.match(browserRunner, /Network\.responseReceived/u);
  assert.match(browserRunner, /SESSION_CREATE: browser_harness_error/u);
  assert.doesNotMatch(browserRunner, /localStorage\.setItem\("jinhu_access_token"/u);
  assert.match(browserRunner, /deviceCapabilities/u);
  assert.match(browserRunner, /maxTouchPoints/u);
  assert.match(browserRunner, /coarsePointer/u);
  assert.match(browserRunner, /rewrite_target/u);
  assert.match(browserRunner, /redactedRewriteTarget/u);
  assert.match(browserRunner, /redactedApiBase/u);
  assert.match(browserRunner, /redactedWebBase/u);
  assert.match(browserRunner, /redactDiagnostic/u);
  assert.match(browserRunner, /run_id/u);
  assert.match(browserRunner, /evidence-manifest\.json/u);
  assert.match(browserRunner, /createHash\("sha256"\)/u);
  assert.match(browserRunner, /case_assertion_failed:/u);
  assert.match(browserRunner, /picker_selectors/u);
  assert.match(browserRunner, /unknown_fallback_text/u);
  assert.match(browserRunner, /detail_selectors/u);
  assert.match(browserRunner, /hcd_evidence_grade/u);
  assert.match(browserRunner, /case ids must be unique/u);
  assert.match(browserRunner, /serverLogoutSucceeded/u);
  assert.doesNotMatch(browserRunner, /credentials_file:.*credentialsFile/u);
  assert.match(browserRunner, /\^https\?:/u);
});

test("browser UAT rejects incomplete or unsafe cases while retaining blocked evidence", () => {
  for (const cases of [
    [{ id: "HCD-001", path: "/housing", text: ["住房"] }, { id: "HCD-001", path: "/homestay", text: ["民宿"] }],
    [{ id: "HCD-016", path: "/housing/leases/[leaseId]", detail_text: ["租约"] }],
    [{ id: "HCD-017", path: "/housing/../system", text: ["系统"] }],
    [{ id: "HCD-018", path: "/housing/handovers" }]
  ]) {
    const directory = mkdtempSync(resolve(tmpdir(), "jinhu-browser-contract-"));
    try {
      const caseFile = resolve(directory, "cases.json");
      const reportFile = resolve(directory, "report.json");
      writeFileSync(caseFile, JSON.stringify({ cases }));
      const execution = spawnSync(process.execPath, [
        new URL("../go-live-browser-uat-check.mjs", import.meta.url).pathname,
        "--chrome-path", "/bin/true",
        "--case-file", caseFile,
        "--report", reportFile
      ], {
        encoding: "utf8",
        env: { ...process.env, BROWSER_UAT_USERNAME: "contract-user", BROWSER_UAT_PASSWORD: "contract-password" }
      });
      assert.equal(execution.status, 1);
      const report = JSON.parse(readFileSync(reportFile, "utf8"));
      assert.equal(report.status, "FAIL");
      assert.equal(report.hcd_evidence_grade, "BLOCKED");
      assert.equal(report.report_file, "[LOCAL_REPORT_FILE]");
      assert.match(report.failures.join(" "), /invalid browser UAT case file/u);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

test("browser UAT redacts user identity and requires picker echo plus anonymous cookie isolation", () => {
  assert.match(browserRunner, /user_ref: userRef/u);
  assert.doesNotMatch(browserRunner, /display_name: user\.displayName/u);
  assert.match(browserRunner, /kind: "picker_echo"/u);
  assert.match(browserRunner, /executeCaseActions/u);
  assert.match(browserRunner, /case_action_failed:/u);
  assert.match(browserRunner, /selectWithKeyboard/u);
  assert.match(browserRunner, /chooseRemotePicker/u);
  assert.match(browserRunner, /action.type === "reload"/u);
  assert.match(browserRunner, /expectedResponses/u);
  assert.match(browserRunner, /Storage\.getCookies/u);
  assert.match(browserRunner, /hasAuthCookie/u);
  assert.match(browserRunner, /authorization: "Bearer " \+ token/u);
  assert.match(browserRunner, /location\.origin === \$\{JSON\.stringify\(new URL\(webBase\)\.origin\)\}/u);
  assert.match(browserRunner, /parsed\.pathname.*parsed\.search/u);
  assert.match(browserRunner, /entry\.error === "net::ERR_ABORTED"/u);
  assert.match(browserRunner, /identity: `\$\{request\.method \?\? "GET"\} \$\{url\}`/u);
  assert.match(browserRunner, /Math\.max\(/u);
  assert.match(browserRunner, /successfulRequestStarts\.get\(failedRequestIdentities\.get\(entry\)\?\.identity\)/u);
  assert.match(browserRunner, /> failedRequestIdentities\.get\(entry\)\?\.startSequence/u);
  assert.match(browserRunner, /routeDigest = sha256\(path\)\.slice\(0, 16\)/u);
  assert.match(browserRunner, /query_sha256=\$\{sha256\(parsed\.search\)\.slice\(0, 16\)\}/u);
  assert.match(browserRunner, /const pathname = new URL\(path, "http:\/\/browser-uat\.local"\)\.pathname/u);
  assert.match(browserRunner, /无法查看此详情/u);
  assert.equal((browserRunner.match(/无法查看此详情/gu) ?? []).length, 2);
  assert.match(browserRunner, /has no assertions/u);
  assert.match(browserRunner, /safePath/u);
});

test("browser UAT rejects malformed real-interaction definitions", () => {
  const directory = mkdtempSync(resolve(tmpdir(), "jinhu-browser-actions-contract-"));
  try {
    const caseFile = resolve(directory, "cases.json");
    const reportFile = resolve(directory, "report.json");
    writeFileSync(caseFile, JSON.stringify({ cases: [{
      id: "HCD-006", path: "/homestay/finance", text: ["财务"],
      actions: [{ type: "picker", label: "来源流水", query: "missing-option-text" }]
    }] }));
    const execution = spawnSync(process.execPath, [
      new URL("../go-live-browser-uat-check.mjs", import.meta.url).pathname,
      "--chrome-path", "/bin/true", "--case-file", caseFile, "--report", reportFile
    ], { encoding: "utf8", env: { ...process.env, BROWSER_UAT_USERNAME: "contract-user", BROWSER_UAT_PASSWORD: "contract-password" } });
    assert.equal(execution.status, 1);
    const report = JSON.parse(readFileSync(reportFile, "utf8"));
    assert.match(report.failures.join(" "), /invalid actions/u);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("browser UAT rejects unsafe real-interaction response bounds", () => {
  const directory = mkdtempSync(resolve(tmpdir(), "jinhu-browser-action-bounds-contract-"));
  try {
    const caseFile = resolve(directory, "cases.json");
    const reportFile = resolve(directory, "report.json");
    writeFileSync(caseFile, JSON.stringify({ cases: [{
      id: "HCD-013", path: "/homestay/finance", text: ["财务"],
      actions: [{ type: "wait_response", path: "https://outside.invalid/private", method: "post", status: 999, timeout_ms: 120000 }]
    }] }));
    const execution = spawnSync(process.execPath, [
      new URL("../go-live-browser-uat-check.mjs", import.meta.url).pathname,
      "--chrome-path", "/bin/true", "--case-file", caseFile, "--report", reportFile
    ], { encoding: "utf8", env: { ...process.env, BROWSER_UAT_USERNAME: "contract-user", BROWSER_UAT_PASSWORD: "contract-password" } });
    assert.equal(execution.status, 1);
    const report = JSON.parse(readFileSync(reportFile, "utf8"));
    assert.match(report.failures.join(" "), /invalid actions/u);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("housing real API preserves the forged occupancy boundary for residential and office long-rent units", () => {
  assert.match(housingRunner, /\[10, 70\]\.includes\(Number\(unit\.usageType\)\)/u);
  assert.match(housingRunner, /expectRequestStatus\("\/property\/occupancies", Number\(unit\.usageType\) === 70 \? 403 : 404/u);
});

test("office matrix uses real API writes, approval execution, candidate facets and a short-stay rejection", () => {
  assert.match(officeRunner, /\/park-units/u);
  assert.match(officeRunner, /target_mode: "long_rent"/u);
  assert.match(officeRunner, /executionStatus !== "executed"/u);
  assert.match(officeRunner, /unit-candidates\?usage_type=10/u);
  assert.match(officeRunner, /target_mode: "short_stay"/u);
  assert.match(officeRunner, /rejected\.status !== 409/u);
  assert.match(officeRunner, /requirePropertyApiE2eIsolation\(\)/u);
  assert.match(officeRunner, /Unit usage is not allowed for target operating mode/u);
  assert.match(officeRunner, /AbortSignal\.timeout\(15000\)/u);
  assert.match(officeRunner, /keyword=\$\{encodeURIComponent\(unitCode\)\}/u);
});
