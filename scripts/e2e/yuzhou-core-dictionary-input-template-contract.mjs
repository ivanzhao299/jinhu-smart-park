import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const template = JSON.parse(readFileSync(new URL("../hr-cutover/contracts/yuzhou-core-dictionary-input-template-v1.json", import.meta.url), "utf8"));

test("core dictionary input template is HOLD-only and contains schema placeholders, never source values", () => {
  assert.deepEqual(Object.keys(template).sort(), ["artifactKind", "formatVersion", "instructions", "productionImport", "sourceSystem"]);
  assert.equal(template.formatVersion, 1);
  assert.equal(template.artifactKind, "yuzhou_core_dictionary_input_template");
  assert.equal(template.sourceSystem, "yuzhou-v10");
  assert.equal(template.productionImport, "HOLD");
  assert.equal(template.instructions.fileMode, "0600");
  for (const key of ["eventState", "contractType", "contractState"]) {
    assert.equal(typeof template.instructions[key].sourceObject, "string");
    assert.equal(typeof template.instructions[key].sourceRecordCount, "number");
    assert.equal(typeof template.instructions[key].sourceDistinctValueCount, "number");
    assert.match(JSON.stringify(template.instructions[key].rowShape), /<source (?:value|code|name)>|<positive integer>/u);
  }
  assert.doesNotMatch(JSON.stringify(template), /(?:fixture-|"[0-9a-f]{64}")/u);
});
