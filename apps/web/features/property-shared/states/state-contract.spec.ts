import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const pageStateSource = readFileSync(
  resolve(process.cwd(), "apps/web/features/property-shared/states/PageState.tsx"),
  "utf8"
);
const liveRegionSource = readFileSync(
  resolve(process.cwd(), "apps/web/features/property-shared/states/LiveRegion.tsx"),
  "utf8"
);

test("state surfaces use ARIA busy and deduplicated live regions", () => {
  assert.match(pageStateSource, /aria-busy=/);
  assert.match(liveRegionSource, /aria-live=/);
  assert.match(liveRegionSource, /aria-atomic="true"/);
  assert.match(liveRegionSource, /lastKeyRef/);
});

test("state components stay within foundation import boundaries", () => {
  const combined = `${pageStateSource}\n${liveRegionSource}`;
  assert.doesNotMatch(combined, /features\/(?:homestay|housing|identity|approval)/);
  assert.doesNotMatch(combined, /lib\/api-client/);
  assert.doesNotMatch(combined, /@jinhu\/shared\//);
});
