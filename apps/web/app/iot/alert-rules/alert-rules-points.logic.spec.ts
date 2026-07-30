import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("device point options consume the API array contract", () => {
  const page = readFileSync(resolve(__dirname, "page.tsx"), "utf8");

  assert.match(page, /apiRequest<PointRow\[\]>\(`\/iot\/devices\/\$\{deviceId\}\/points/);
  assert.match(page, /setPoints\(response\.data\)/);
  assert.doesNotMatch(page, /setPoints\(response\.data\.items\)/);
});
