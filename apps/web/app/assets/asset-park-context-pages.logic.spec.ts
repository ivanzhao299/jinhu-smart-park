import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const assetsRoot = __dirname;
const webRoot = resolve(assetsRoot, "../..");

test("asset board and statistics pages expose authenticated park context switching", () => {
  const board = readFileSync(resolve(assetsRoot, "unit-status-board/page.tsx"), "utf8");
  const statistics = readFileSync(resolve(assetsRoot, "statistics/page.tsx"), "utf8");
  const selector = readFileSync(resolve(webRoot, "components/assets/AssetParkContextSelector.tsx"), "utf8");

  for (const source of [board, statistics]) {
    assert.match(source, /useAssetParkContextSwitch/);
    assert.match(source, /<AssetParkContextSelector/);
    assert.match(source, /await switchToPark\(targetParkId\)/);
    assert.match(source, /setParkReloadKey\(\(value\) => value \+ 1\)/);
    assert.match(source, /RequestSequence = useRef\(0\)/);
    assert.match(source, /sequence === .*RequestSequence\.current/);
    assert.doesNotMatch(source, /params\.set\("parkId"/);
    assert.doesNotMatch(source, /params\.set\("park_id"/);
  }

  assert.match(selector, /switchParkContext\(targetParkId\)/);
  assert.match(selector, /publishUser\(nextUser\)/);
  assert.match(selector, /当前账号无法访问所选园区/);
});

test("shared property foundation lists expose one park context switch for all three surfaces", () => {
  const foundation = readFileSync(resolve(webRoot, "components/property/PropertyFoundationControlClient.tsx"), "utf8");
  const operations = readFileSync(resolve(assetsRoot, "property-operations/page.tsx"), "utf8");
  const occupancies = readFileSync(resolve(assetsRoot, "property-occupancies/page.tsx"), "utf8");
  const transitions = readFileSync(resolve(assetsRoot, "property-mode-transitions/page.tsx"), "utf8");

  assert.match(foundation, /useAssetParkContextSwitch/);
  assert.match(foundation, /<AssetParkContextSelector/);
  assert.match(foundation, /await switchToPark\(targetParkId\)/);
  assert.match(foundation, /setParkReloadKey\(\(value\) => value \+ 1\)/);
  assert.match(foundation, /setData\(null\)/);
  assert.match(foundation, /<ManualOccupancyCreatePanel key=\{parkReloadKey\} disabled=\{parkSwitching\}/);
  assert.match(foundation, /function ManualOccupancyCreatePanel\(\{ disabled, onCreated \}/);
  assert.match(foundation, /disabled \|\| lock\.current/);
  assert.match(foundation, /disabled=\{disabled \|\| busy\}/);
  assert.doesNotMatch(foundation, /params\.set\("parkId"/);
  assert.doesNotMatch(foundation, /params\.set\("park_id"/);

  assert.match(operations, /surface="operations"/);
  assert.match(occupancies, /surface="occupancies"/);
  assert.match(transitions, /surface="mode-transitions"/);
});

test("global and mobile park switchers use readable filled controls", () => {
  const globals = readFileSync(resolve(webRoot, "app/globals.css"), "utf8");
  const mobile = readFileSync(resolve(webRoot, "app/mobile-terminal.css"), "utf8");

  assert.match(globals, /\.user-park-switcher:hover,\n\.user-park-switcher:focus-within/);
  assert.match(globals, /background: var\(--surface-elevated, #ffffff\)/);
  assert.match(globals, /color: var\(--text-primary, #081a2c\)/);
  assert.match(globals, /\.asset-park-context-selector select/);
  assert.match(mobile, /background: rgba\(248, 250, 252, 0\.94\)/);
  assert.match(mobile, /color: #0f172a/);
});
