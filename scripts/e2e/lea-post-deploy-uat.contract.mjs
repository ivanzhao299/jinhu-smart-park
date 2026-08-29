import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
