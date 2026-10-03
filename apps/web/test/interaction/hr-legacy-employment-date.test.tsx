import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LegacyArchivePageClient } from "../../app/hr/employees/legacy/LegacyArchivePageClient";
import { hrApi, type HrLegacyArchiveRecord } from "../../lib/hr-api";

const auth = vi.hoisted(() => ({ sensitive: true }));
vi.mock("../../lib/hr-api", () => ({ hrApi: { legacyArchive: vi.fn(), legacyArchiveDetail: vi.fn() } }));
vi.mock("../../lib/authz", () => ({ getAccessToken: () => "synthetic-test-token" }));
vi.mock("../../lib/auth-context", () => ({ useAuthUser: () => ({
  permissions: ["hr:legacy_archive", "hr:legacy_archive:read", ...(auth.sensitive ? ["hr:legacy_archive:sensitive_read"] : [])],
  enabled_modules: [{ module_code: "hr", enabled: true }],
}) }));

const record: HrLegacyArchiveRecord = {
  id: "synthetic-archive", employeeId: "synthetic-employee", mappingStatus: "mapped",
  recordType: "employee_profile", sourceTable: "dbo.person.core_residue", occurredOn: null,
  displayTitle: "Synthetic profile", hasSensitiveSource: true,
  projection: { legacyFields: { formaldate: "2021-02-29", education: "Synthetic education" } },
};

beforeEach(() => {
  auth.sensitive = true;
  vi.mocked(hrApi.legacyArchive).mockReset().mockResolvedValue({ items: [record], total: 1, page: 1, page_size: 20 });
  vi.mocked(hrApi.legacyArchiveDetail).mockReset().mockResolvedValue(record);
});

async function openDetail() {
  fireEvent.click(await screen.findByRole("button", { name: "查看安全详情" }));
}

describe("original confirmation date in the complete archive page", () => {
  it("keeps the invalid source value once with its warning and retains other fields", async () => {
    render(<LegacyArchivePageClient />);
    await openDetail();
    expect(await screen.findByRole("heading", { name: "原玉舟转正日期" })).toBeVisible();
    expect(screen.getAllByText("2021-02-29")).toHaveLength(1);
    expect(screen.getByText("原日期值需核对")).toBeVisible();
    expect(screen.queryByText("legacyFields.formaldate")).toBeNull();
    expect(screen.getByText("legacyFields.education")).toBeVisible();
    expect(screen.getByText("Synthetic education")).toBeVisible();
  });
  it("leaves a foreign source field in generic details without labeling it a confirmation date", async () => {
    vi.mocked(hrApi.legacyArchiveDetail).mockResolvedValue({ ...record, sourceTable: "other_source" });
    render(<LegacyArchivePageClient />);
    await openDetail();
    expect(await screen.findByText("legacyFields.formaldate")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "原玉舟转正日期" })).toBeNull();
  });
  it("does not infer a historical date from a modern plan or a restricted projection", async () => {
    auth.sensitive = false;
    vi.mocked(hrApi.legacyArchiveDetail).mockResolvedValue({ ...record, sourceTable: undefined, projection: { probationEndDate: "2026-12-01" } });
    render(<LegacyArchivePageClient />);
    await openDetail();
    expect(await screen.findByText("2026-12-01")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "原玉舟转正日期" })).toBeNull();
    expect(screen.queryByText("2021-02-29")).toBeNull();
  });
});
