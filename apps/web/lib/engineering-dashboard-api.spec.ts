import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const repoRoot = join(__dirname, "../../..");

describe("engineering dashboard frontend wiring", () => {
  it("declares dashboard api client and route", () => {
    const apiFile = readFileSync(join(repoRoot, "apps/web/lib/engineering-dashboard-api.ts"), "utf8");
    assert.match(apiFile, /getOverview/);
    assert.equal(apiFile.includes("/engineering/dashboard"), true);
    assert.equal(existsSync(join(repoRoot, "apps/web/app/engineering/dashboard/page.tsx")), true);
  });

  it("renders required Phase 1 dashboard metrics", () => {
    const pageFile = readFileSync(join(repoRoot, "apps/web/app/engineering/dashboard/page.tsx"), "utf8");
    for (const label of ["项目总数", "施工中项目", "待整改", "逾期整改", "今日巡检", "本周日报", "待验收", "验收通过率", "整改关闭率"]) {
      assert.match(pageFile, new RegExp(label));
    }
    for (const section of ["项目状态分布", "项目类型分布", "计划状态分布", "问题等级分布", "整改状态分布", "验收状态分布", "施工单位整改排名"]) {
      assert.match(pageFile, new RegExp(section));
    }
  });

  it("exposes dashboard from engineering runtime entry", () => {
    const entryFile = readFileSync(join(repoRoot, "apps/web/app/engineering/page.tsx"), "utf8");
    assert.match(entryFile, /工程 Dashboard/);
    assert.equal(entryFile.includes("/engineering/dashboard"), true);
  });
});
