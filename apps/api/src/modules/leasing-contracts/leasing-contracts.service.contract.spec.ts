import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("leasing shared occupancy comparisons use explicit Shanghai business-day boundaries", () => {
  const service = readFileSync(resolve(__dirname, "leasing-contracts.service.ts"), "utf8");

  assert.match(service, /\(\(\$5::date \+ 1\)::timestamp AT TIME ZONE 'Asia\/Shanghai'\)/);
  assert.match(service, /\(\$4::date::timestamp AT TIME ZONE 'Asia\/Shanghai'\)/);
  assert.doesNotMatch(service, /occupancy\.start_at < \(\$5::date \+ interval '1 day'\)/);
  assert.doesNotMatch(service, /occupancy\.end_at > \$4::date/);
});
