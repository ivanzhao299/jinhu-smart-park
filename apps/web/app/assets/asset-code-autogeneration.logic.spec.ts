import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const webRoot = resolve(__dirname, "../..");

const buildingPage = readFileSync(resolve(webRoot, "app/assets/buildings/page.tsx"), "utf8");
const floorPage = readFileSync(resolve(webRoot, "app/assets/floors/page.tsx"), "utf8");
const unitDialog = readFileSync(resolve(webRoot, "app/assets/units/components/UnitFormDialog.tsx"), "utf8");
const unitsPage = readFileSync(resolve(webRoot, "app/assets/units/UnitsPageClient.tsx"), "utf8");

function findTextField(source: string, label: string) {
  const field = source.split("\n").find((line) => line.includes(`<TextField label="${label}"`));
  assert.ok(field, `missing ${label} field`);
  return field;
}

test("asset code fields are optional on create and remain required on edit", () => {
  const cases = [
    [buildingPage, "楼栋编码", "请输入或生成楼栋编码"],
    [floorPage, "楼层编码", "请输入或生成楼层编码"],
    [unitDialog, "房源编码", "请输入或生成房源编码"],
  ] as const;

  for (const [source, label, placeholder] of cases) {
    const field = findTextField(source, label);
    assert.match(field, /required=\{Boolean\(editingId\)\}/, `${label} must only be required on edit`);
    assert.doesNotMatch(field, /\srequired\s/, `${label} must not be unconditionally required`);
    assert.match(field, new RegExp(`placeholder="${placeholder}"`));
  }
});

test("asset create payloads preserve trimmed manual codes and blank-code contract", () => {
  assert.match(buildingPage, /buildingCode:\s*form\.buildingCode\.trim\(\)/);
  assert.match(floorPage, /floorCode:\s*form\.floorCode\.trim\(\)/);
  assert.match(unitsPage, /unitCode:\s*form\.unitCode\.trim\(\)/);
});
