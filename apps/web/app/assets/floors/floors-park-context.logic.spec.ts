import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("floor creation switches authenticated park context before writing", () => {
  const page = readFileSync(resolve(__dirname, "page.tsx"), "utf8");
  const submit = page.slice(page.indexOf("async function submit"), page.indexOf("async function remove"));

  assert.match(page, /import \{ getStoredUser, getToken, switchParkContext \} from "\.\.\/\.\.\/\.\.\/lib\/auth"/u);
  assert.match(page, /useAuthSessionActions/u);
  assert.match(page, /parkId: string/u);
  assert.match(page, /<label htmlFor="floorFormPark">所属园区<\/label>/u);
  assert.match(page, /onChange=\{\(event\) => void changeFormPark\(event\.target\.value\)/u);
  assert.match(submit, /if \(!editingId\) await ensureParkContext\(form\.parkId\)/u);
  assert.match(submit, /await apiRequest<FloorRow>\(editingId \? `\/floors\/\$\{editingId\}` : "\/floors"/u);
  assert.doesNotMatch(submit, /parkId: form\.parkId/u);
  assert.doesNotMatch(submit, /window\.location\.href = "\/login"/u);
});

test("floor page publishes switched user and reloads target park buildings", () => {
  const page = readFileSync(resolve(__dirname, "page.tsx"), "utf8");

  assert.match(page, /const nextUser = await switchParkContext\(targetParkId\)/u);
  assert.match(page, /sessionActions\?\.publishUser\(nextUser\)/u);
  assert.match(page, /setListParkId\(nextUser\.park_id\)/u);
  assert.match(page, /const scopedDataGeneration = useRef\(0\)/u);
  assert.match(page, /if \(generation === scopedDataGeneration\.current\) setBuildings\(response\.data\.items\)/u);
  assert.match(page, /scopedDataGeneration\.current \+= 1/u);
  assert.match(page, /await loadBuildings\(\)/u);
  assert.match(page, /await load\(1, \{ buildingId: "", keyword: "", status: "" \}\)/u);
  assert.match(page, /<label htmlFor="floorListPark">查看园区<\/label>/u);
  assert.match(page, /changeListPark\(event\.target\.value\)/u);
});

test("floor create drawer does not default to the first building after park changes", () => {
  const page = readFileSync(resolve(__dirname, "page.tsx"), "utf8");
  const openCreate = page.slice(page.indexOf("function openCreate"), page.indexOf("function openEdit"));

  assert.match(openCreate, /buildingId: buildingId \|\| ""/u);
  assert.doesNotMatch(openCreate, /buildings\[0\]/u);
});

test("floor saves use a synchronous submit lock and report refresh partial success", () => {
  const page = readFileSync(resolve(__dirname, "page.tsx"), "utf8");
  const submit = page.slice(page.indexOf("async function submit"), page.indexOf("async function remove"));

  assert.match(page, /const floorSubmitLock = useRef\(false\)/u);
  assert.match(page, /const formParkSwitchLock = useRef\(false\)/u);
  assert.match(submit, /if \(floorSubmitLock\.current \|\| formParkSwitchLock\.current\) return/u);
  assert.match(submit, /floorSubmitLock\.current = true/u);
  assert.match(submit, /floorSubmitLock\.current = false/u);
  assert.match(submit, /保存成功，但列表刷新失败：/u);
});
