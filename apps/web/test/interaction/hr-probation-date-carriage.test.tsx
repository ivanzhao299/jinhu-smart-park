import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProbationApplicationsPanel } from "../../app/hr/lifecycle/ProbationApplicationsPanel";
import { hrApi, type HrProbationApplication } from "../../lib/hr-api";

const auth = vi.hoisted(() => ({ canRead: true }));
vi.mock("../../lib/hr-api", () => ({ hrApi: { probationApplications: vi.fn(), employees: vi.fn(), confirmProbationApplication: vi.fn() } }));
vi.mock("../../lib/authz", () => ({ getAccessToken: () => "synthetic-test-token" }));
vi.mock("../../lib/auth-context", () => ({ useAuthUser: () => ({ permissions: auth.canRead ? ["hr:lifecycle:read"] : [] }) }));

const application: HrProbationApplication = {
  version: 1, id: "synthetic-application", applicationNo: "SYN-1", applicationName: "Synthetic probation",
  applicationDate: "2026-09-01", reason: "Synthetic reason", status: "approved", reviewComment: null,
  reviewedAt: null, confirmedAt: null,
  participants: [{ id: "synthetic-participant", employeeId: "synthetic-employee", employeeCode: "SYN-A",
    employeeName: "Synthetic employee", plannedConfirmationDate: "2026-10-01", confirmedDate: null, status: "pending" }],
};

beforeEach(() => {
  auth.canRead = true;
  vi.mocked(hrApi.probationApplications).mockReset().mockResolvedValue({ items: [application], total: 1, page: 1, page_size: 20 });
  vi.mocked(hrApi.employees).mockReset();
  vi.mocked(hrApi.confirmProbationApplication).mockReset();
});

describe("probation dates use the authorized workflow facts", () => {
  it("does not present an approved plan as a confirmed date or enable confirmation for a reader", async () => {
    render(<ProbationApplicationsPanel />);
    const participant = await screen.findByRole("region", { name: "Synthetic employee · 转正日期" });
    expect(within(participant).getByText("计划转正日期").nextElementSibling).toHaveTextContent("2026-10-01");
    expect(within(participant).getByText("已确认转正日期").nextElementSibling).toHaveTextContent("未登记");
    expect(within(participant).getByText("待确认")).toBeVisible();
    expect(screen.queryByRole("button", { name: "确认转正" })).toBeNull();
    expect(hrApi.employees).not.toHaveBeenCalled();
    expect(hrApi.confirmProbationApplication).not.toHaveBeenCalled();
  });
  it("retains each participant's plan, confirmation date and the separate processing timestamp", async () => {
    vi.mocked(hrApi.probationApplications).mockResolvedValue({ items: [{ ...application, status: "confirmed", confirmedAt: "2026-10-03T01:00:00.000Z",
      participants: [{ ...application.participants[0]!, confirmedDate: "2026-10-01", status: "confirmed" },
        { ...application.participants[0]!, id: "other-participant", employeeId: "other-employee", employeeName: "Other employee", plannedConfirmationDate: "2026-10-02", confirmedDate: "2026-10-02", status: "confirmed" }] }], total: 1, page: 1, page_size: 20 });
    render(<ProbationApplicationsPanel />);
    const first = await screen.findByRole("region", { name: "Synthetic employee · 转正日期" });
    expect(within(first).getByText("已确认转正日期").nextElementSibling).toHaveTextContent("2026-10-01");
    const second = screen.getByRole("region", { name: "Other employee · 转正日期" });
    expect(within(second).getByText("已确认转正日期").nextElementSibling).toHaveTextContent("2026-10-02");
    expect(screen.getByText("确认办理时间：2026-10-03T01:00:00.000Z")).toBeVisible();
  });
  it("keeps unknown participant state explicit without inferring confirmation from a plan", async () => {
    vi.mocked(hrApi.probationApplications).mockResolvedValue({ items: [{ ...application, participants: [{ ...application.participants[0]!, status: "unknown" }] }], total: 1, page: 1, page_size: 20 });
    render(<ProbationApplicationsPanel />);
    expect(await screen.findByText("状态待核对")).toBeVisible();
    expect(screen.getByText("已确认转正日期").nextElementSibling).toHaveTextContent("未登记");
  });
  it("does not load or display dates without lifecycle read permission", () => {
    auth.canRead = false;
    render(<ProbationApplicationsPanel />);
    expect(screen.queryByText("员工转正申请")).toBeNull();
    expect(hrApi.probationApplications).not.toHaveBeenCalled();
  });
  it("shows a read failure without manufacturing date facts", async () => {
    vi.mocked(hrApi.probationApplications).mockRejectedValue(new Error("Synthetic unavailable"));
    render(<ProbationApplicationsPanel />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Synthetic unavailable");
    expect(screen.queryByText("2026-10-01")).toBeNull();
    expect(hrApi.confirmProbationApplication).not.toHaveBeenCalled();
  });
});
