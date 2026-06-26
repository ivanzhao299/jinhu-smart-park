import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { engineeringDailyReportsApi, toSearchParams } from "./engineering-daily-reports-api";
import { engineeringDailyReportStatusLabels, engineeringWeatherTypeLabels } from "./engineering-daily-reports-display";
import { hasEngineeringDailyReportPermission } from "./engineering-daily-reports-permissions";
import {
  isDailyReportEditable,
  isDailyReportReviewable,
  isDailyReportSubmittable,
  validateDailyReportPeopleCount,
  validateDailyReportProgress
} from "./engineering-daily-reports-utils";

test("engineeringDailyReportsApi exposes all Task 009 methods", () => {
  assert.equal(typeof engineeringDailyReportsApi.createDailyReport, "function");
  assert.equal(typeof engineeringDailyReportsApi.listDailyReports, "function");
  assert.equal(typeof engineeringDailyReportsApi.getDailyReport, "function");
  assert.equal(typeof engineeringDailyReportsApi.updateDailyReport, "function");
  assert.equal(typeof engineeringDailyReportsApi.deleteDailyReport, "function");
  assert.equal(typeof engineeringDailyReportsApi.submitDailyReport, "function");
  assert.equal(typeof engineeringDailyReportsApi.reviewDailyReport, "function");
  assert.equal(typeof engineeringDailyReportsApi.getProjectDailyReports, "function");
});

test("engineering daily report query search params omit empty values", () => {
  const params = toSearchParams({
    keyword: "消防",
    report_status: "DRAFT",
    weather: "",
    project_id: "project-id",
    page: 2,
    page_size: 20
  });
  assert.equal(params.toString(), "keyword=%E6%B6%88%E9%98%B2&report_status=DRAFT&project_id=project-id&page=2&page_size=20");
});

test("engineering daily report enum Chinese mappings cover required values", () => {
  assert.equal(engineeringDailyReportStatusLabels.DRAFT, "草稿");
  assert.equal(engineeringDailyReportStatusLabels.SUBMITTED, "已提交");
  assert.equal(engineeringDailyReportStatusLabels.REVIEWED, "已审核");
  assert.equal(engineeringDailyReportStatusLabels.REJECTED, "已驳回");
  assert.equal(engineeringDailyReportStatusLabels.ARCHIVED, "已归档");
  assert.equal(engineeringWeatherTypeLabels.SUNNY, "晴");
  assert.equal(engineeringWeatherTypeLabels.CLOUDY, "多云");
  assert.equal(engineeringWeatherTypeLabels.OVERCAST, "阴");
  assert.equal(engineeringWeatherTypeLabels.RAIN, "雨");
  assert.equal(engineeringWeatherTypeLabels.SNOW, "雪");
  assert.equal(engineeringWeatherTypeLabels.WINDY, "大风");
  assert.equal(engineeringWeatherTypeLabels.FOG, "雾");
  assert.equal(engineeringWeatherTypeLabels.OTHER, "其他");
});

test("engineering daily report validators and status guards match backend rules", () => {
  assert.equal(validateDailyReportPeopleCount(-1, "现场工人人数"), "现场工人人数不能为负数");
  assert.equal(validateDailyReportPeopleCount(0, "现场工人人数"), "");
  assert.equal(validateDailyReportProgress(101), "日报进度必须在 0 到 100 之间");
  assert.equal(validateDailyReportProgress(80), "");
  assert.equal(isDailyReportEditable("DRAFT"), true);
  assert.equal(isDailyReportEditable("REJECTED"), true);
  assert.equal(isDailyReportEditable("SUBMITTED"), false);
  assert.equal(isDailyReportSubmittable("DRAFT"), true);
  assert.equal(isDailyReportSubmittable("REJECTED"), true);
  assert.equal(isDailyReportReviewable("SUBMITTED"), true);
  assert.equal(isDailyReportReviewable("DRAFT"), false);
});

test("engineering daily report route files and project detail entry are wired", () => {
  const listPage = readFileSync(resolve(__dirname, "../app/engineering/daily-reports/page.tsx"), "utf8");
  const newPage = readFileSync(resolve(__dirname, "../app/engineering/daily-reports/new/page.tsx"), "utf8");
  const detailPage = readFileSync(resolve(__dirname, "../app/engineering/daily-reports/[id]/page.tsx"), "utf8");
  const editPage = readFileSync(resolve(__dirname, "../app/engineering/daily-reports/[id]/edit/page.tsx"), "utf8");
  const projectDetail = readFileSync(resolve(__dirname, "../app/engineering/projects/components/EngineeringProjectDetailClient.tsx"), "utf8");

  assert.match(listPage, /EngineeringDailyReportsListClient/);
  assert.match(newPage, /EngineeringDailyReportFormClient/);
  assert.match(detailPage, /EngineeringDailyReportDetailClient/);
  assert.match(editPage, /reportId/);
  assert.match(projectDetail, /engineeringDailyReportsApi\.getProjectDailyReports/);
  assert.match(projectDetail, /施工日报/);
});

test("engineering daily report list and detail expose submit, review, and delete controls", () => {
  const listSource = readFileSync(resolve(__dirname, "../app/engineering/daily-reports/components/EngineeringDailyReportsListClient.tsx"), "utf8");
  const detailSource = readFileSync(resolve(__dirname, "../app/engineering/daily-reports/components/EngineeringDailyReportDetailClient.tsx"), "utf8");
  const reviewDrawerSource = readFileSync(resolve(__dirname, "../app/engineering/daily-reports/components/EngineeringDailyReportShared.tsx"), "utf8");

  assert.match(listSource, /isDailyReportSubmittable/);
  assert.match(listSource, /isDailyReportReviewable/);
  assert.match(listSource, /window\.confirm/);
  assert.match(detailSource, /submitDailyReport/);
  assert.match(detailSource, /reviewDailyReport/);
  assert.match(reviewDrawerSource, /驳回时建议填写审核意见/);
});

test("engineering daily report edit form does not send reportStatus through update payload", () => {
  const formSource = readFileSync(resolve(__dirname, "../app/engineering/daily-reports/components/EngineeringDailyReportFormClient.tsx"), "utf8");
  const updateFunction = formSource.slice(formSource.indexOf("function toUpdateInput"));
  assert.equal(/report_status\s*:/.test(updateFunction), false);
  assert.equal(/reportStatus\s*:/.test(updateFunction), false);
});

test("engineering daily report permission helper requires seeded engineering permissions", () => {
  assert.equal(hasEngineeringDailyReportPermission(null, "ENGINEERING_DAILY_REPORT_VIEW"), false);
  assert.equal(hasEngineeringDailyReportPermission({ permissions: ["module:read"], is_super: false }, "ENGINEERING_DAILY_REPORT_VIEW"), false);
  assert.equal(hasEngineeringDailyReportPermission({ permissions: ["ENGINEERING_DAILY_REPORT_VIEW"], is_super: false }, "ENGINEERING_DAILY_REPORT_VIEW"), true);
  assert.equal(hasEngineeringDailyReportPermission({ permissions: ["ENGINEERING_DAILY_REPORT_VIEW"], is_super: false }, "ENGINEERING_DAILY_REPORT_UPDATE"), false);
  assert.equal(hasEngineeringDailyReportPermission({ permissions: ["ENGINEERING_DAILY_REPORT_UPDATE"], is_super: false }, "ENGINEERING_DAILY_REPORT_SUBMIT"), true);
  assert.equal(hasEngineeringDailyReportPermission({ permissions: ["*"], is_super: false }, "ENGINEERING_DAILY_REPORT_REVIEW"), true);
});
