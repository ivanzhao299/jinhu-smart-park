import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HousingLeaseCreatePanel } from "@/app/housing/_components/HousingLeaseCreatePanel";
import type { PropertyCapabilityProjection } from "@/features/property-shared";
import type { RemoteEntityLoadInput } from "@/features/property-shared/picker/types";

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  loadHousingTenants: vi.fn(),
  loadHousingUnits: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  apiRequest: mocks.apiRequest,
  createIdempotencyKey: () => "housing-lease-create-test-key",
}));
vi.mock("@/lib/authz", () => ({ getAccessToken: () => "test-token" }));
vi.mock("@/app/housing/_components/housing-picker-loaders", () => ({
  loadHousingTenants: mocks.loadHousingTenants,
  loadHousingUnits: mocks.loadHousingUnits,
}));

const capabilities = {
  moduleAvailable: true,
  invalidationKey: "tenant:park",
} as PropertyCapabilityProjection;

describe("HousingLeaseCreatePanel picker submission", () => {
  beforeEach(() => {
    mocks.apiRequest.mockResolvedValue({ success: true, data: {} });
    mocks.loadHousingUnits.mockImplementation(async ({ page, pageSize }: RemoteEntityLoadInput) => ({
      items: [{ id: "unit-stable-id", label: "A-101 · 湖景房" }], page, pageSize, total: 1,
    }));
    mocks.loadHousingTenants.mockImplementation(async ({ page, pageSize }: RemoteEntityLoadInput) => ({
      items: [{ id: "tenant-stable-id", label: "张三 · 13800000000" }], page, pageSize, total: 1,
    }));
  });

  it("submits stable picker ids after mounted keyboard selection", async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    render(<HousingLeaseCreatePanel capabilities={capabilities} onCreated={onCreated} />);

    const unit = screen.getByRole("combobox", { name: "住房房源" });
    await user.type(unit, "湖景");
    await screen.findByRole("option", { name: /A-101/ });
    await user.keyboard("{Enter}");

    const tenant = screen.getByRole("combobox", { name: "租客" });
    await user.type(tenant, "张三");
    await screen.findByRole("option", { name: /张三/ });
    await user.keyboard("{Enter}");

    fireEvent.change(screen.getByLabelText("开始日期"), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText("结束日期"), { target: { value: "2027-09-30" } });
    fireEvent.change(screen.getByLabelText("首期到期日"), { target: { value: "2026-10-05" } });
    fireEvent.change(screen.getByLabelText("月租"), { target: { value: "5200.00" } });
    fireEvent.change(screen.getByLabelText("押金"), { target: { value: "10400.00" } });
    await user.click(screen.getByRole("button", { name: "创建草稿" }));

    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledTimes(1));
    expect(mocks.apiRequest).toHaveBeenCalledWith("/housing/leases", expect.objectContaining({
      method: "POST",
      token: "test-token",
      idempotencyKey: "housing-lease-create-test-key",
      body: expect.objectContaining({
        unit_id: "unit-stable-id",
        tenant_party_id: "tenant-stable-id",
        monthly_rent: "5200.00",
        deposit_amount: "10400.00",
      }),
    }));
    expect(onCreated).toHaveBeenCalledTimes(1);
  });
});
