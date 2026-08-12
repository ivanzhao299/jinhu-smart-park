import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const componentRoot = __dirname;
const webRoot = resolve(componentRoot, "../..");

test("control-plane and embedded runtime use DS surfaces with accessibility fallbacks", () => {
  const control = readFileSync(resolve(componentRoot, "PropertyControlPlaneClient.tsx"), "utf8");
  const controlCss = readFileSync(resolve(componentRoot, "PropertyControlPlane.module.css"), "utf8");
  const runtime = readFileSync(resolve(componentRoot, "PropertyRuntimeSlots.tsx"), "utf8");
  const runtimeCss = readFileSync(resolve(componentRoot, "PropertyRuntimeSlots.module.css"), "utf8");

  assert.match(control, /<PropertyPageSurface/);
  assert.match(control, /<PropertyPanelSurface/);
  assert.match(control, /className="ds-hero"/);
  assert.match(control, /className="ds-hero-copy"/);
  assert.match(runtime, /className="ds-command-grid"/);
  assert.match(runtime, /ds-command-card/);
  assert.doesNotMatch(runtime, /<div className="ds-page">/);
  for (const css of [controlCss, runtimeCss]) {
    assert.match(css, /:focus-visible/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(css, /@media \(forced-colors: active\)/);
    assert.match(css, /outline: 2px solid Highlight/);
    assert.match(css, /background-image: none/);
    assert.match(css, /box-shadow: none/);
  }
});

test("identity detail deep-link targets a focusable Party identity section", () => {
  const control = readFileSync(resolve(componentRoot, "PropertyControlPlaneClient.tsx"), "utf8");
  const party = readFileSync(resolve(webRoot, "app/assets/parties/PartyDetailClient.tsx"), "utf8");

  assert.match(control, /\?tab=identity#identity/);
  assert.match(party, /searchParams\.get\("tab"\) === "identity"/);
  assert.match(party, /getElementById\("identity"\)/);
  assert.match(party, /id="identity" tabIndex=\{-1\}/);
});

test("property control-plane routes inherit the authenticated dashboard context", () => {
  const layout = readFileSync(resolve(webRoot, "app/property/layout.tsx"), "utf8");

  assert.match(layout, /import \{ DashboardLayout \}/);
  assert.match(layout, /<DashboardLayout>\{children\}<\/DashboardLayout>/);
});

test("shared property foundation exposes three guarded control planes and unit shortcuts", () => {
  const foundation = readFileSync(resolve(componentRoot, "PropertyFoundationControlClient.tsx"), "utf8");
  const operations = readFileSync(resolve(webRoot, "app/assets/property-operations/page.tsx"), "utf8");
  const occupancies = readFileSync(resolve(webRoot, "app/assets/property-occupancies/page.tsx"), "utf8");
  const transitions = readFileSync(resolve(webRoot, "app/assets/property-mode-transitions/page.tsx"), "utf8");
  const unitDrawer = readFileSync(resolve(webRoot, "app/assets/units/components/UnitDetailDrawer.tsx"), "utf8");

  assert.match(foundation, /<PropertyPageSurface/);
  assert.match(foundation, /<PropertyPanelSurface/);
  assert.match(foundation, /<PropertyResponsiveRecords/);
  assert.match(operations, /PROPERTY_OPERATIONS_PAGE/);
  assert.match(operations, /PROPERTY_OPERATION_READ/);
  assert.match(occupancies, /PROPERTY_OCCUPANCIES_PAGE/);
  assert.match(occupancies, /PROPERTY_OCCUPANCY_READ/);
  assert.match(transitions, /PROPERTY_MODE_TRANSITIONS_PAGE/);
  assert.match(transitions, /PROPERTY_APPROVAL_READ/);
  assert.match(unitDrawer, /assets\/property-operations/);
  assert.match(unitDrawer, /assets\/property-occupancies\?unitId=/);
  assert.match(unitDrawer, /assets\/property-mode-transitions\?unitId=/);
  assert.match(unitDrawer, /PROPERTY_OPERATIONS_PAGE[\s\S]*PROPERTY_OPERATION_READ[\s\S]*经营配置/);
  assert.match(unitDrawer, /PROPERTY_OCCUPANCIES_PAGE[\s\S]*PROPERTY_OCCUPANCY_READ[\s\S]*占用记录/);
  assert.match(unitDrawer, /PROPERTY_MODE_TRANSITIONS_PAGE[\s\S]*PROPERTY_APPROVAL_READ[\s\S]*模式审计/);
  assert.match(foundation, /version: item\.version/);
  assert.match(foundation, /unitCode: string/);
  assert.match(foundation, /unitName: string/);
  assert.match(foundation, /label: "房源"/);
  assert.match(foundation, /params\.set\("keyword", keyword\.trim\(\)\)/);
  assert.match(foundation, /params\.set\("sourceDomain", sourceDomain\)/);
  assert.match(foundation, /value="apartment">公寓/);
  assert.match(foundation, /params\.set\("sourceType", sourceType\.trim\(\)\)/);
  assert.match(foundation, /params\.set\("status", occupancyStatus\)/);
  assert.match(foundation, /label: "保留到期"/);
  assert.match(foundation, /label: "释放信息"/);
  assert.match(foundation, /releaseKeys = useRef/);
  for (const parameter of ["buildingId", "configuredMode", "operationStatus", "blockerCode"]) {
    assert.match(foundation, new RegExp(`params\\.set\\("${parameter}"`));
  }
  for (const label of ["楼栋 / 物理房源", "生效时间", "暂停/停用原因", "当前占用", "切换原因", "操作人", "审批时间", "执行时间"]) {
    assert.match(foundation, new RegExp(`label: "${label}"`));
  }
  assert.match(foundation, /row\.deepLink\?\.startsWith\("\/"\)/);
  assert.match(foundation, /asset_unit_id: assetUnitId\.trim\(\) \|\| null/);
  assert.match(foundation, /transitionPayload\.current !== payloadFingerprint/);
  assert.match(foundation, /label: "检查快照"/);
  assert.match(foundation, /modeTransitionSnapshotSummary/);
  assert.match(foundation, /blocking_reasons/);
  assert.match(foundation, /value="not_required">无需执行/);
  assert.match(foundation, /setRemark\(item\.remark \?\? ""\)/);
  assert.match(foundation, /remark: remark\.trim\(\) \|\| null/);
  assert.match(foundation, /label: "备注"/);
  assert.match(foundation, /!isTerminalOccupancy\(detail as OccupancyRow\) && !isManualOccupancy\(detail as OccupancyRow\)/);
  const manualCreate = foundation.slice(
    foundation.indexOf("function ManualOccupancyCreatePanel"),
    foundation.indexOf("function FoundationRecords")
  );
  assert.ok(
    manualCreate.indexOf('"/property/occupancies/availability"')
      < manualCreate.indexOf('"/property/occupancies",'),
    "manual locks must run the availability check before the create request"
  );
  assert.match(foundation, /availability\.data\.conflicts/);
  assert.match(foundation, /aria-label="可用性冲突"/);
  assert.match(manualCreate, /conflict\.sourceId/);
  assert.match(manualCreate, /exactRetry = retryKey\.current !== null && retryPayload\.current === payloadFingerprint/);
  assert.match(manualCreate, /createIdempotencyKey\("property-occupancy-availability"\)/);
  assert.match(manualCreate, /idempotencyKey: availabilityKey\.current/);
  assert.match(foundation, /releasePayloads\.current\[mode\] !== payloadFingerprint/);
  assert.match(foundation, /releasePayloads\.current\[releaseMode\] = null/);
});

test("the authenticated shell suppresses motion globally when the user requests it", () => {
  const globals = readFileSync(resolve(webRoot, "app/globals.css"), "utf8");

  assert.match(globals, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(globals, /animation-duration: 0\.01ms !important/);
  assert.match(globals, /animation-iteration-count: 1 !important/);
  assert.match(globals, /transition-duration: 0\.01ms !important/);
  assert.match(globals, /scroll-behavior: auto !important/);
});
