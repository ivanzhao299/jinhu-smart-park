import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculatePercent,
  EngineeringDashboardService,
  getEngineeringDashboardDateWindow
} from "./engineering-dashboard.service";
import { EngineeringProjectPermission } from "./policies/engineering-project-access.policy";

class FakeBuilder {
  public readonly clauses: string[] = [];

  constructor(
    private readonly count: number = 0,
    private readonly rows: Array<Record<string, string | null>> = []
  ) {}

  andWhere(clause: string): this {
    this.clauses.push(clause);
    return this;
  }

  select(): this {
    return this;
  }

  addSelect(): this {
    return this;
  }

  setParameters(): this {
    return this;
  }

  groupBy(): this {
    return this;
  }

  orderBy(): this {
    return this;
  }

  limit(): this {
    return this;
  }

  async getCount(): Promise<number> {
    return this.count;
  }

  async getRawMany(): Promise<Array<Record<string, string | null>>> {
    return this.rows;
  }
}

function makeRepository(builders: FakeBuilder[]) {
  return {
    createScopedQueryBuilder: () => {
      const builder = builders.shift();
      assert.ok(builder, "expected fake query builder");
      return builder;
    }
  };
}

describe("EngineeringDashboardService", () => {
  it("calculates percentage and dashboard date window", () => {
    assert.equal(calculatePercent(4, 5), 80);
    assert.equal(calculatePercent(1, 3), 33.33);
    assert.equal(calculatePercent(1, 0), 0);
    assert.deepEqual(getEngineeringDashboardDateWindow(new Date("2026-06-26T10:00:00.000Z")), {
      today: "2026-06-26",
      weekStart: "2026-06-22"
    });
  });

  it("builds dashboard overview through permission and DataScope adapters", async () => {
    const projectBuilders = [
      new FakeBuilder(12),
      new FakeBuilder(4),
      new FakeBuilder(0, [{ key: "EXECUTING", count: "4" }, { key: "CLOSED", count: "2" }]),
      new FakeBuilder(0, [{ key: "REPAIR", count: "5" }])
    ];
    const planBuilders = [new FakeBuilder(0, [{ key: "IN_PROGRESS", count: "3" }])];
    const reportBuilders = [new FakeBuilder(5)];
    const inspectionBuilders = [new FakeBuilder(2)];
    const issueBuilders = [new FakeBuilder(0, [{ key: "HIGH", count: "2" }])];
    const rectificationBuilders = [
      new FakeBuilder(3),
      new FakeBuilder(1),
      new FakeBuilder(6),
      new FakeBuilder(4),
      new FakeBuilder(0, [{ key: "CLOSED", count: "4" }, { key: "OVERDUE", count: "1" }]),
      new FakeBuilder(0, [{ contractorOrgId: "contractor-1", total: "6", closed: "4", overdue: "1" }])
    ];
    const acceptanceBuilders = [
      new FakeBuilder(2),
      new FakeBuilder(5),
      new FakeBuilder(4),
      new FakeBuilder(0, [{ key: "PASSED", count: "4" }, { key: "FAILED", count: "1" }])
    ];
    const permissionCalls: string[] = [];
    const scopeCalls: string[] = [];
    const service = new EngineeringDashboardService(
      makeRepository(projectBuilders) as never,
      makeRepository(planBuilders) as never,
      makeRepository(reportBuilders) as never,
      makeRepository(inspectionBuilders) as never,
      makeRepository(issueBuilders) as never,
      makeRepository(rectificationBuilders) as never,
      makeRepository(acceptanceBuilders) as never,
      {
        assertPermission: (permission: string) => permissionCalls.push(permission)
      } as never,
      {
        applyProjectScope: () => scopeCalls.push("project"),
        applyPlanScope: () => scopeCalls.push("plan"),
        applyDailyReportScope: () => scopeCalls.push("report"),
        applyInspectionScope: () => scopeCalls.push("inspection"),
        applyIssueScope: () => scopeCalls.push("issue"),
        applyRectificationScope: () => scopeCalls.push("rectification"),
        applyAcceptanceScope: () => scopeCalls.push("acceptance")
      } as never
    );

    const overview = await service.overview(
      {
        tenantId: "tenant-1",
        parkId: "park-1",
        actor: { sub: "user-1", permissions: [EngineeringProjectPermission.DASHBOARD_VIEW], isSuper: false, dataScope: "all" } as never
      },
      new Date("2026-06-26T10:00:00.000Z")
    );

    assert.equal(permissionCalls[0], EngineeringProjectPermission.DASHBOARD_VIEW);
    assert.equal(overview.summary.project_total, 12);
    assert.equal(overview.summary.executing_project_count, 4);
    assert.equal(overview.summary.pending_rectification_count, 3);
    assert.equal(overview.summary.overdue_rectification_count, 1);
    assert.equal(overview.summary.today_inspection_count, 2);
    assert.equal(overview.summary.weekly_daily_report_count, 5);
    assert.equal(overview.summary.pending_acceptance_count, 2);
    assert.equal(overview.summary.acceptance_pass_rate, 80);
    assert.equal(overview.summary.rectification_close_rate, 66.67);
    assert.equal(overview.project_status_distribution[0]?.key, "EXECUTING");
    assert.equal(overview.contractor_rectification_ranking[0]?.close_rate, 66.67);
    assert.ok(scopeCalls.includes("project"));
    assert.ok(scopeCalls.includes("rectification"));
    assert.ok(scopeCalls.includes("acceptance"));
  });
});
