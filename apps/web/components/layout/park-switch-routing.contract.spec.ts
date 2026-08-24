import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

for (const component of ["UserMenu.tsx", "MobileTerminalHeader.tsx"]) {
  test(`${component} predicts navigation from the authoritative switched user`, () => {
    const source = readFileSync(`components/layout/${component}`, "utf8");

    assert.match(source, /resolvePostParkSwitchPath\(nextUser, pathname\)/);
    assert.match(source, /nextPath === pathname\) router\.refresh\(\)/);
    assert.match(source, /else router\.replace\(nextPath as Route\)/);
  });
}
