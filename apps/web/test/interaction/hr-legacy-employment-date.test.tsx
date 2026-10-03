import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LegacyArchivePageClient } from "../../app/hr/employees/legacy/LegacyArchivePageClient";
import { hrApi, type HrLegacyArchiveRecord } from "../../lib/hr-api";

const auth = vi.hoisted(() => ({ sensitive: true, parentDetail: true }));
vi.mock("../../lib/hr-api", () => ({ hrApi: { legacyArchive: vi.fn(), legacyArchiveDetail: vi.fn() } }));
vi.mock("../../lib/authz", () => ({ getAccessToken: () => "synthetic-test-token" }));
vi.mock("../../lib/auth-context", () => ({ useAuthUser: () => ({
  permissions: ["hr:legacy_archive", "hr:legacy_archive:read", ...(auth.parentDetail ? ["hr:legacy_archive:sensitive_read"] : [])],
  enabled_modules: [{ module_code: "hr", enabled: true }],
}) }));

const record: HrLegacyArchiveRecord = {
  id: "synthetic-archive", employeeId: "synthetic-employee", mappingStatus: "mapped",
  recordType: "employee_profile", sourceTable: "dbo.person.core_residue", occurredOn: null,
  displayTitle: "Synthetic profile", hasSensitiveSource: true,
  sourceSystem: "yuzhou-v10",
  projection: { legacyFields: { formaldate: "2021-02-29", education: "Synthetic education", oldaddr: "Synthetic native place", edulevel: "Synthetic degree" } },
};

beforeEach(() => {
  auth.sensitive = true;
  auth.parentDetail = true;
  vi.mocked(hrApi.legacyArchive).mockReset().mockResolvedValue({ items: [record], total: 1, page: 1, page_size: 20 });
  vi.mocked(hrApi.legacyArchiveDetail).mockReset().mockResolvedValue(record);
});

async function openDetail() {
  fireEvent.click((await screen.findAllByRole("button", { name: "查看安全详情" }))[0]!);
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
    auth.parentDetail = false;
    vi.mocked(hrApi.legacyArchiveDetail).mockResolvedValue({ ...record, sourceTable: undefined, projection: { probationEndDate: "2026-12-01" } });
    render(<LegacyArchivePageClient />);
    await openDetail();
    expect(await screen.findByText("2026-12-01")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "原玉舟转正日期" })).toBeNull();
    expect(screen.queryByText("2021-02-29")).toBeNull();
  });
  it("labels only the hash-bound personnel fields once under the parent detail privilege", async () => {
    render(<LegacyArchivePageClient />);
    await openDetail();
    expect(await screen.findByText("原玉舟籍贯")).toBeVisible();
    expect(screen.getByText("原玉舟学位")).toBeVisible();
    expect(screen.getByText("Synthetic native place")).toBeVisible();
    expect(screen.getByText("Synthetic degree")).toBeVisible();
    expect(screen.queryByText("legacyFields.oldaddr")).toBeNull();
    expect(screen.queryByText("legacyFields.edulevel")).toBeNull();
    expect(screen.getByRole("heading", { name: "原玉舟转正日期" })).toBeVisible();
  });
  it("keeps those source values generic when parent detail privilege is absent", async () => {
    auth.parentDetail = false;
    render(<LegacyArchivePageClient />);
    await openDetail();
    expect(await screen.findByText("legacyFields.oldaddr")).toBeVisible();
    expect(screen.getByText("legacyFields.edulevel")).toBeVisible();
    expect(screen.queryByText("原玉舟籍贯")).toBeNull();
    expect(screen.queryByText("原玉舟学位")).toBeNull();
  });
  it("clears the sensitive detail when the parent context changes", async () => {
    const view = render(<LegacyArchivePageClient />);
    await openDetail();
    expect(await screen.findByText("Synthetic native place")).toBeVisible();
    auth.parentDetail = false;
    view.rerender(<LegacyArchivePageClient />);
    expect(screen.queryByText("Synthetic native place")).toBeNull();
    expect(screen.queryByText("原玉舟籍贯")).toBeNull();
  });
  it("does not label the values for another source or record type", async () => {
    vi.mocked(hrApi.legacyArchiveDetail).mockResolvedValue({ ...record, sourceSystem: "other", recordType: "other" });
    render(<LegacyArchivePageClient />);
    await openDetail();
    expect(await screen.findByText("legacyFields.oldaddr")).toBeVisible();
    expect(screen.queryByText("原玉舟籍贯")).toBeNull();
  });
  it("clears the previous detail if the next detail request fails", async () => {
    vi.mocked(hrApi.legacyArchive).mockResolvedValue({ items: [record, { ...record, id: "second" }], total: 2, page: 1, page_size: 20 });
    vi.mocked(hrApi.legacyArchiveDetail).mockResolvedValueOnce(record).mockRejectedValueOnce(new Error("synthetic failure"));
    render(<LegacyArchivePageClient />);
    await openDetail();
    expect(await screen.findByText("Synthetic native place")).toBeVisible();
    fireEvent.click(screen.getAllByRole("button", { name: "查看安全详情" })[1]!);
    expect(await screen.findByRole("alert")).toHaveTextContent("synthetic failure");
    expect(screen.queryByText("Synthetic native place")).toBeNull();
  });
});
