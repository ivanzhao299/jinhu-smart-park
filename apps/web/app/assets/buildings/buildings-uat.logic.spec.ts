import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("blocked building deletion is localized and shown in an immediate dialog", () => {
  const page = readFileSync(resolve(__dirname, "page.tsx"), "utf8");
  const service = readFileSync(
    resolve(__dirname, "../../../../api/src/modules/buildings/buildings.service.ts"),
    "utf8"
  );

  assert.match(page, /window\.alert\(failureMessage\)/);
  assert.match(page, /removeCommittedItem\(current, row\.id\)/);
  assert.match(page, /getCommittedDeleteRefreshError\(\(\) => load\(pageData\.page\)\)/);
  assert.match(service, /该楼栋下仍有未删除楼层，无法删除/);
  assert.doesNotMatch(service, /Building has undeleted floors and cannot be deleted/);
});

test("cross-park building creation does not use auth context switching", () => {
  const page = readFileSync(resolve(__dirname, "page.tsx"), "utf8");
  const submit = page.slice(page.indexOf("async function submit"), page.indexOf("async function remove"));

  assert.doesNotMatch(page, /switchParkContext/u);
  assert.match(submit, /parkId: form\.parkId/u);
  assert.match(page, /保存成功，已切换到所选园区列表/u);
  assert.match(page, /const savedParkId = response\.data\.parkId \|\| form\.parkId \|\| currentListQuery\.parkId/u);
  assert.match(page, /setListParkId\(nextQuery\.parkId\)/u);
  assert.match(page, /await load\(editingId \? pageData\.page : 1, nextQuery\)/u);
  assert.doesNotMatch(submit, /window\.location\.reload/u);
});

test("building list queries the selected park explicitly", () => {
  const page = readFileSync(resolve(__dirname, "page.tsx"), "utf8");
  const load = page.slice(page.indexOf("const load = useCallback"), page.indexOf("useEffect(() => {"));

  assert.match(page, /const \[listParkId, setListParkId\] = useState\(""\)/u);
  assert.match(page, /const latestBuildingListRequest = useRef\(0\)/u);
  assert.match(load, /const requestId = latestBuildingListRequest\.current \+ 1/u);
  assert.match(load, /if \(requestId !== latestBuildingListRequest\.current\) return/u);
  assert.match(page, /<label htmlFor="buildingListPark">查看园区<\/label>/u);
  assert.match(load, /if \(query\.parkId\) params\.set\("parkId", query\.parkId\)/u);
  assert.match(page, /changeListPark\(event\.target\.value\)/u);
  assert.match(page, /new URLSearchParams\(\{ parkId: row\.parkId \}\)/u);
});

test("park switch failures are visible inside the building drawer", () => {
  const page = readFileSync(resolve(__dirname, "page.tsx"), "utf8");
  const submit = page.slice(page.indexOf("async function submit"), page.indexOf("async function remove"));

  assert.match(page, /setFormMessage\(error instanceof Error \? error\.message : "楼栋保存失败"\)/u);
  assert.match(page, /formMessage \? <p className="status-pill" role="alert">\{formMessage\}<\/p>/u);
  assert.doesNotMatch(submit, /catch \(error\) \{[\s\S]*window\.location\.href = "\/login";[\s\S]*setFormMessage/u);
});

test("a committed save reports a later list refresh failure as partial success", () => {
  const page = readFileSync(resolve(__dirname, "page.tsx"), "utf8");

  assert.match(page, /保存成功，但列表刷新失败：/u);
});
