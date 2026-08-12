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
  assert.match(foundation, /version: item\.version/);
  assert.match(foundation, /unitCode: string/);
  assert.match(foundation, /unitName: string/);
  assert.match(foundation, /label: "房源"/);
});

test("the authenticated shell suppresses motion globally when the user requests it", () => {
  const globals = readFileSync(resolve(webRoot, "app/globals.css"), "utf8");

  assert.match(globals, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(globals, /animation-duration: 0\.01ms !important/);
  assert.match(globals, /animation-iteration-count: 1 !important/);
  assert.match(globals, /transition-duration: 0\.01ms !important/);
  assert.match(globals, /scroll-behavior: auto !important/);
});
