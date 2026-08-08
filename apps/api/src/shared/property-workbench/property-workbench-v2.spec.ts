import assert from "node:assert/strict";
import test from "node:test";
import {
  PROPERTY_WORKBENCH_V2_CONFIG_KEY,
  isPropertyWorkbenchV2Enabled
} from "./property-workbench-v2";

function createConfig(value: unknown) {
  return {
    get: (key: string) =>
      key === PROPERTY_WORKBENCH_V2_CONFIG_KEY ? value : undefined
  };
}

test("property workbench v2 flag enables only for trimmed case-insensitive string true", () => {
  const matrix: ReadonlyArray<readonly [string, unknown, boolean]> = [
    ["unset", undefined, false],
    ["null", null, false],
    ["string false", "false", false],
    ["uppercase false", "FALSE", false],
    ["boolean false", false, false],
    ["boolean true", true, false],
    ["number one", 1, false],
    ["string one", "1", false],
    ["empty string", "", false],
    ["whitespace", "   ", false],
    ["near match", " truex ", false],
    ["lowercase true", "true", true],
    ["uppercase true", "TRUE", true],
    ["whitespace true", "  true  ", true],
    ["mixed-case true", "\tTrUe\n", true]
  ];

  for (const [label, value, expected] of matrix) {
    assert.equal(
      isPropertyWorkbenchV2Enabled(createConfig(value) as never),
      expected,
      label
    );
  }
});

test("property workbench v2 helper reads only the canonical config key", () => {
  const requestedKeys: string[] = [];
  const config = {
    get: (key: string) => {
      requestedKeys.push(key);
      return "true";
    }
  };

  assert.equal(isPropertyWorkbenchV2Enabled(config as never), true);
  assert.deepEqual(requestedKeys, [PROPERTY_WORKBENCH_V2_CONFIG_KEY]);
});
