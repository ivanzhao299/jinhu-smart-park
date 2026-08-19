import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("unit creation switches authenticated park context before writing", () => {
  const page = readFileSync(resolve(__dirname, "UnitsPageClient.tsx"), "utf8");
  const dialog = readFileSync(resolve(__dirname, "components/UnitFormDialog.tsx"), "utf8");
  const submit = page.slice(page.indexOf("async function submit"), page.indexOf("async function remove"));

  assert.match(page, /import \{ getStoredUser, getToken, switchParkContext \} from "\.\.\/\.\.\/\.\.\/lib\/auth"/u);
  assert.match(page, /useAuthSessionActions/u);
  assert.match(page, /parkId: string/u);
  assert.match(dialog, /<SelectField label="所属园区"/u);
  assert.match(page, /onParkChange=\{\(parkId\) => void changeFormPark\(parkId\)/u);
  assert.match(submit, /if \(!editingId\) await ensureParkContext\(form\.parkId\)/u);
  assert.match(submit, /await apiRequest<UnitRow>\(editingId \? `\/park-units\/\$\{editingId\}` : "\/park-units"/u);
  assert.doesNotMatch(submit, /parkId: form\.parkId/u);
  assert.doesNotMatch(submit, /window\.location\.href = "\/login"/u);
});

test("unit page publishes switched user and reloads target park lookups", () => {
  const page = readFileSync(resolve(__dirname, "UnitsPageClient.tsx"), "utf8");
  const toolbar = readFileSync(resolve(__dirname, "components/UnitsToolbar.tsx"), "utf8");

  assert.match(page, /const nextUser = await switchParkContext\(targetParkId\)/u);
  assert.match(page, /sessionActions\?\.publishUser\(nextUser\)/u);
  assert.match(page, /setListParkId\(nextUser\.park_id\)/u);
  assert.match(page, /const scopedDataGeneration = useRef\(0\)/u);
  assert.match(page, /if \(generation === scopedDataGeneration\.current\) \{/u);
  assert.match(page, /scopedDataGeneration\.current \+= 1/u);
  assert.match(page, /setBuildings\(\[\]\)/u);
  assert.match(page, /setFloors\(\[\]\)/u);
  assert.match(page, /setDicts\(dictMap\)/u);
  assert.match(page, /await loadLookups\(\)/u);
  assert.match(toolbar, /<SelectField label="查看园区"/u);
  assert.match(page, /changeListPark\(parkId\)/u);
});

test("unit create drawer does not default to first building or first floor", () => {
  const page = readFileSync(resolve(__dirname, "UnitsPageClient.tsx"), "utf8");
  const openCreate = page.slice(page.indexOf("function openCreate"), page.indexOf("function closeForm"));

  assert.match(openCreate, /const defaultBuildingId = filters\.buildingId \|\| ""/u);
  assert.match(openCreate, /const defaultFloorId = defaultBuildingId \? filters\.floorId \|\| "" : ""/u);
  assert.doesNotMatch(openCreate, /buildings\[0\]/u);
  assert.doesNotMatch(openCreate, /floors\.find/u);
});

test("unit saves use a synchronous submit lock and report refresh partial success", () => {
  const page = readFileSync(resolve(__dirname, "UnitsPageClient.tsx"), "utf8");
  const submit = page.slice(page.indexOf("async function submit"), page.indexOf("async function remove"));

  assert.match(page, /const unitSubmitLock = useRef\(false\)/u);
  assert.match(page, /const formParkSwitchLock = useRef\(false\)/u);
  assert.match(submit, /if \(unitSubmitLock\.current \|\| formParkSwitchLock\.current\) return/u);
  assert.match(submit, /unitSubmitLock\.current = true/u);
  assert.match(submit, /unitSubmitLock\.current = false/u);
  assert.match(submit, /保存成功，但列表刷新失败：/u);
});

test("unit park lookup refresh has same-target retry and stale dict guard", () => {
  const page = readFileSync(resolve(__dirname, "UnitsPageClient.tsx"), "utf8");
  const dialog = readFileSync(resolve(__dirname, "components/UnitFormDialog.tsx"), "utf8");
  const loadLookups = page.slice(page.indexOf("const loadLookups"), page.indexOf("const handleSwitchError"));
  const changeListPark = page.slice(page.indexOf("const changeListPark"), page.indexOf("const changeFormPark"));
  const changeFormPark = page.slice(page.indexOf("const changeFormPark"), page.indexOf("const retryCurrentParkData"));

  assert.match(loadLookups, /if \(generation === scopedDataGeneration\.current\) \{[\s\S]*setDicts\(dictMap\);[\s\S]*\}/u);
  assert.doesNotMatch(changeListPark, /targetParkId === effectiveParkId\) return/u);
  assert.match(changeListPark, /if \(targetParkId !== effectiveParkId\) \{/u);
  assert.match(changeListPark, /await reloadParkScopedData\(\)/u);
  assert.match(changeFormPark, /throw new Error\(`园区已切换，但数据刷新失败：/u);
  assert.match(page, /const retryCurrentParkData = useCallback/u);
  assert.match(page, /onRetryParkLoad=\{\(\) => void retryCurrentParkData\(\)/u);
  assert.match(dialog, /重新加载当前园区数据/u);
});
