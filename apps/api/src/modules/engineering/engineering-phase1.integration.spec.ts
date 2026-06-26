import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const ROOT = __dirname;
const WEB_ENGINEERING_ROOT = resolve(ROOT, "../../../../web/app/engineering");

function read(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

function assertContains(source: string, values: string[]): void {
  for (const value of values) {
    assert.ok(source.includes(value), `Expected source to include ${value}`);
  }
}

test("EPDR Phase 1 API controllers expose the required runtime routes", () => {
  const projectController = read("engineering-projects.controller.ts");
  const planController = read("engineering-plans.controller.ts");
  const reportController = read("engineering-daily-reports.controller.ts");
  const inspectionController = read("engineering-inspections.controller.ts");
  const rectificationController = read("engineering-rectifications.controller.ts");
  const acceptanceController = read("engineering-acceptances.controller.ts");

  assertContains(projectController, [
    '@Controller("engineering/projects")',
    "@Post()",
    "@Get()",
    '@Get(":id/actions")',
    '@Get(":id/status-logs")',
    '@Post(":id/actions/:action")'
  ]);
  assertContains(planController, [
    '@Post("plans")',
    '@Get("projects/:projectId/plans")',
    '@Patch("plans/:id/progress")',
    '@Patch("plans/:id/status")'
  ]);
  assertContains(reportController, [
    '@Post("daily-reports")',
    '@Get("projects/:projectId/daily-reports")',
    '@Post("daily-reports/:id/submit")',
    '@Post("daily-reports/:id/review")'
  ]);
  assertContains(inspectionController, [
    '@Post("inspections")',
    '@Post("inspections/:id/submit")',
    '@Post("inspections/:id/issues")',
    '@Post("issues/:id/generate-rectification")'
  ]);
  assertContains(rectificationController, [
    '@Post("rectifications")',
    '@Post("rectifications/overdue-scan")',
    '@Post("rectifications/:id/actions")'
  ]);
  assertContains(acceptanceController, ['@Post("acceptances")', '@Post("acceptances/:id/submit")', '@Post("acceptances/:id/review")', '@Post("acceptances/:id/close")']);
});

test("EPDR Phase 1 module registers runtime services and shared governance boundaries", () => {
  const moduleSource = read("engineering.module.ts");

  assertContains(moduleSource, [
    "EngineeringProjectService",
    "EngineeringPlanService",
    "EngineeringDailyReportService",
    "EngineeringInspectionService",
    "EngineeringRectificationService",
    "EngineeringAcceptanceService",
    "EngineeringDashboardService",
    "EngineeringAttachmentService",
    "EngineeringNotificationService",
    "EngineeringAuditLogger",
    "EngineeringEventPublisher",
    "EngineeringDataScopeAdapter"
  ]);
});

test("EPDR Phase 1 frontend routes exist for every MVP runtime", () => {
  for (const relativePath of [
    "page.tsx",
    "dashboard/page.tsx",
    "projects/page.tsx",
    "projects/new/page.tsx",
    "projects/[id]/page.tsx",
    "plans/page.tsx",
    "plans/new/page.tsx",
    "plans/[id]/page.tsx",
    "daily-reports/page.tsx",
    "daily-reports/new/page.tsx",
    "daily-reports/[id]/page.tsx",
    "inspections/page.tsx",
    "inspections/new/page.tsx",
    "inspections/[id]/page.tsx",
    "rectifications/page.tsx",
    "rectifications/[id]/page.tsx",
    "acceptances/page.tsx",
    "acceptances/new/page.tsx",
    "acceptances/[id]/page.tsx"
  ]) {
    assert.equal(existsSync(resolve(WEB_ENGINEERING_ROOT, relativePath)), true, `Missing engineering frontend route ${relativePath}`);
  }
});

test("EPDR Phase 1 service layer keeps audit, event, data scope and notification boundaries centralized", () => {
  assertContains(read("engineering-project.service.ts"), ["EngineeringAuditLogger", "EngineeringDataScopeAdapter"]);
  assertContains(read("engineering-plan.service.ts"), ["EngineeringAuditLogger", "EngineeringEventPublisher", "notificationRecipients"]);
  assertContains(read("engineering-inspection.service.ts"), ["EngineeringAuditLogger", "EngineeringEventPublisher", "notificationRecipients"]);
  assertContains(read("engineering-rectification.service.ts"), ["EngineeringRectificationStateMachine", "EngineeringEventPublisher", "notificationRecipients"]);
  assertContains(read("engineering-acceptance.service.ts"), ["EngineeringAuditLogger", "EngineeringEventPublisher", "notificationRecipients"]);
  assertContains(read("events/engineering-event.publisher.ts"), ["EngineeringEventLogEntity", "EngineeringNotificationService"]);
});
