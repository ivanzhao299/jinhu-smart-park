import { render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { HrInsuranceClient } from "../../app/hr/insurance/HrInsuranceClient";
import { hrApi } from "../../lib/hr-api";

const state = vi.hoisted(() => ({ user: { id: "synthetic-actor", permissions: ["*"] } }));
vi.mock("../../lib/auth-context", () => ({ useAuthUser: () => state.user }));
vi.mock("../../lib/authz", () => ({ getAccessToken: () => "synthetic-token" }));
vi.mock("../../components/auth/PermissionGuard", () => ({ PermissionGuard: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("../../lib/hr-api", () => ({ hrApi: { insurancePeriods: vi.fn(), insurancePeriod: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  state.user = { id: "synthetic-actor", permissions: ["*"] };
  vi.mocked(hrApi.insurancePeriods).mockImplementation(async (_token, page = 1, size = 30) => ({
    page, page_size: size, total: 2,
    items: ["90071992547409.91", "19.99"].map((employeeAmount, i) => ({
      id: `synthetic-period-${i}`, periodYear: 2026, periodMonth: 7, needsReview: false,
      reviewReasonCode: null, itemCount: 1, employeeAmount, supplementAmount: "0.00",
    })),
  }));
});
it("actual insurance page renders the exact loaded-page total", async () => {
  render(<HrInsuranceClient />);
  const overview = screen.getByLabelText("社保台账概览");
  expect(await within(overview).findByText("¥ 90071992547429.90")).toBeVisible();
  expect(within(overview).getByText("本页个人缴费")).toBeVisible();
});
it("amount-hidden role cannot see the aggregate even when the response contains amounts", async () => {
  state.user = { id: "synthetic-team-reader", permissions: ["hr:insurance:team_read"] };
  render(<HrInsuranceClient />);
  await screen.findByText("本页 2 条 · 共 2 条");
  expect(screen.queryByText("本页个人缴费")).toBeNull();
  expect(screen.queryByText(/900719925474/)).toBeNull();
});
