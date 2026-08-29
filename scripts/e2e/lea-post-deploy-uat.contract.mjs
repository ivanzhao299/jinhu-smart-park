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
  assert.match(browserRunner, /api_response_failed:/u);
  assert.match(browserRunner, /safeUsername/u);
});

test("housing real API keeps the residential boundary and admits only office as the alternate long-rent usage", () => {
  assert.match(housingRunner, /Number\(unit\.usageType\) === 70[\s\S]*expectRequestStatus\("\/property\/occupancies", 403/u);
  assert.match(housingRunner, /Number\(unit\.usageType\) === 10[\s\S]*office long-rent fixture skips/u);
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
});
