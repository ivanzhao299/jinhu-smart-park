import { StrictMode, useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { BusinessTripDatesPanel } from "../../app/hr/attendance/BusinessTripDatesPanel";
import type { HrAttendanceRequest } from "../../lib/hr-api";
import { ApiError } from "../../lib/api-client";

let token = "scope-a";
const api = vi.hoisted(() => ({ amendBusinessTripDates: vi.fn(), businessTripDatesHistory: vi.fn() }));
vi.mock("../../lib/hr-api", () => ({ hrApi: api }));
vi.mock("../../lib/authz", () => ({ getAccessToken: () => token }));
const row: HrAttendanceRequest = {
  id: "trip-1", requestNo: "ATT-DATE", requestType: "business_trip", status: "approved", amendVersion: 2,
  declaredDays: 2, legacyDeclaredDays: 2, startAt: "2026-07-12T00:00:00.000Z", endAt: "2026-07-12T09:00:00.000Z",
  attendanceDate: null, durationMinutes: 540, leavePlannedMinutes: 0, leaveEffectiveMinutes: 0, leaveDayCount: 0,
  reason: "合成", submittedAt: null, reviewedAt: null, reviewComment: null, isSelf: false, organizationName: null,
};
const saved = vi.fn();
function Harness({ request = row }: { request?: HrAttendanceRequest }) {
  const [busy, setBusy] = useState(false);
  return <BusinessTripDatesPanel row={request} busy={busy} onBusyChange={setBusy} onSaved={saved} />;
}
const receipt = { id: row.id, startAt: "2026-07-31T15:00:00.000Z", endAt: "2026-07-31T17:00:00.000Z", durationMinutes: 120, amendVersion: 3 };
const entry = (version: number) => ({ id: `history-${version}`, requestVersion: version, beforeStartAt: null, beforeEndAt: null, startAt: receipt.startAt, endAt: receipt.endAt, reason: "合成历史", createdAt: "2026-10-12T00:00:00.000Z" });
function fill() {
  fireEvent.click(screen.getByRole("button", { name: "更正出差日期" }));
  fireEvent.change(screen.getByLabelText("出差开始时间"), { target: { value: "2026-07-31T23:00" } });
  fireEvent.change(screen.getByLabelText("出差结束时间"), { target: { value: "2026-08-01T01:00" } });
  fireEvent.change(screen.getByLabelText("日期更正原因"), { target: { value: "合成日期更正" } });
}
const form = () => screen.getByRole("form", { name: "更正出差日期" });
beforeEach(() => {
  token = "scope-a"; vi.resetAllMocks(); saved.mockResolvedValue(undefined);
  api.amendBusinessTripDates.mockResolvedValue(receipt);
  api.businessTripDatesHistory.mockResolvedValue({ items: [entry(3)], total: 1, page: 1, page_size: 20 });
});

it("exposes correction only for an approved trip with an operation version", () => {
  const { rerender } = render(<Harness request={{ ...row, amendVersion: undefined }} />);
  expect(screen.queryByRole("button", { name: "更正出差日期" })).toBeNull();
  rerender(<Harness request={{ ...row, status: "draft" }} />);
  expect(screen.queryByRole("button", { name: "更正出差日期" })).toBeNull();
  rerender(<Harness />); expect(screen.getByRole("button", { name: "更正出差日期" })).toBeInTheDocument();
});
it("submits Shanghai instants, protects rapid duplicate clicks, and retries the identical request", async () => {
  api.amendBusinessTripDates.mockRejectedValueOnce(new Error("合成网络中断"));
  render(<StrictMode><Harness /></StrictMode>); fill();
  act(() => { fireEvent.submit(form()); fireEvent.submit(form()); });
  await screen.findByText("合成网络中断"); expect(api.amendBusinessTripDates).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText("出差开始时间")).toBeDisabled();
  const original = api.amendBusinessTripDates.mock.calls[0];
  expect(original?.slice(0, 3)).toEqual([row.id, { startAt: receipt.startAt, endAt: receipt.endAt, expectedVersion: 2, reason: "合成日期更正" }, "scope-a"]);
  fireEvent.submit(form()); await screen.findByText(/出差日期已更正/);
  expect(api.amendBusinessTripDates.mock.calls[1]).toEqual(original);
  expect(saved).toHaveBeenCalledWith(receipt);
});
it("does not treat a foreign or wrong-date receipt as committed success", async () => {
  api.amendBusinessTripDates.mockResolvedValueOnce({ ...receipt, endAt: "2026-07-31T18:00:00.000Z" });
  render(<Harness />); fill(); fireEvent.submit(form()); await screen.findByText(/日期更正回执不匹配/);
  expect(saved).not.toHaveBeenCalled(); const key = api.amendBusinessTripDates.mock.calls[0]?.[3];
  fireEvent.submit(form()); await screen.findByText(/出差日期已更正/);
  expect(api.amendBusinessTripDates.mock.calls[1]?.[3]).toBe(key);
});
it("publishes success even when the parent refresh fails", async () => {
  saved.mockRejectedValueOnce(new Error("合成刷新失败"));
  render(<Harness />); fill(); fireEvent.submit(form()); await screen.findByText("合成刷新失败");
  expect(screen.getByText(/出差日期已更正/)).toBeInTheDocument(); expect(screen.queryByRole("form")).toBeNull();
});
it("requires refresh after a version conflict and never resubmits the stale draft", async () => {
  api.amendBusinessTripDates.mockRejectedValueOnce(new ApiError("stale", 409));
  render(<Harness />); fill(); fireEvent.submit(form()); await screen.findByText(/申请或考勤期间已变化/);
  expect(screen.queryByRole("form")).toBeNull(); expect(api.amendBusinessTripDates).toHaveBeenCalledTimes(1);
});
it("allows editing after a definite field rejection with a fresh request key", async () => {
  api.amendBusinessTripDates.mockRejectedValueOnce(new ApiError("合成字段错误", 422));
  render(<Harness />); fill(); fireEvent.submit(form()); await screen.findByText("合成字段错误");
  expect(screen.getByLabelText("日期更正原因")).toBeEnabled(); const key = api.amendBusinessTripDates.mock.calls[0]?.[3];
  fireEvent.change(screen.getByLabelText("日期更正原因"), { target: { value: "已核对" } });
  fireEvent.submit(form()); await screen.findByText(/出差日期已更正/);
  expect(api.amendBusinessTripDates.mock.calls[1]?.[3]).not.toBe(key);
});
it("blocks changed identity or request version before a write", async () => {
  const { rerender } = render(<Harness />); fill(); token = "scope-b"; fireEvent.submit(form());
  await screen.findByText(/当前身份或出差版本已变化/); expect(api.amendBusinessTripDates).not.toHaveBeenCalled();
  token = "scope-a"; rerender(<Harness request={{ ...row, amendVersion: 3 }} />); fireEvent.submit(form());
  expect(api.amendBusinessTripDates).not.toHaveBeenCalled();
});
it("keeps an uncertain in-flight write attached to its original identity", async () => {
  let fail: (value: Error) => void = () => {};
  api.amendBusinessTripDates.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
  render(<Harness />); fill(); fireEvent.submit(form()); token = "scope-b";
  await act(async () => fail(new Error("合成中断"))); await screen.findByText(/身份范围已变化/);
  expect(screen.getByLabelText("日期更正原因")).toBeDisabled();
  token = "scope-a"; fireEvent.submit(form()); await screen.findByText(/出差日期已更正/);
  expect(api.amendBusinessTripDates.mock.calls[1]).toEqual(api.amendBusinessTripDates.mock.calls[0]);
});
it("reaches every history page and rejects malformed history without a partial list", async () => {
  api.businessTripDatesHistory.mockResolvedValueOnce({ items: [entry(23)], total: 21, page: 1, page_size: 20 });
  api.businessTripDatesHistory.mockResolvedValueOnce({ items: [entry(3)], total: 21, page: 2, page_size: 20 });
  render(<Harness />); fireEvent.click(screen.getByRole("button", { name: "查看日期更正历史" }));
  await screen.findByText("第 1 / 2 页 · 共 21 条"); fireEvent.click(screen.getByRole("button", { name: "日期历史下一页" }));
  await screen.findByText("日期更正版本 3"); expect(api.businessTripDatesHistory.mock.calls[1]?.slice(0, 4)).toEqual([row.id, "scope-a", 2, 20]);
  api.businessTripDatesHistory.mockResolvedValueOnce({ items: [{ ...entry(23), startAt: "bad" }], total: 21, page: 1, page_size: 20 });
  fireEvent.click(screen.getByRole("button", { name: "日期历史上一页" })); await screen.findByText(/日期历史返回不完整/);
  expect(screen.queryByText("日期更正版本 23")).toBeNull();
});
it("ignores a late history response after an identity change", async () => {
  let finish: (value: unknown) => void = () => {};
  api.businessTripDatesHistory.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  render(<Harness />); fireEvent.click(screen.getByRole("button", { name: "查看日期更正历史" })); token = "scope-b";
  await act(async () => finish({ items: [entry(3)], total: 1, page: 1, page_size: 20 }));
  expect(screen.queryByText("日期更正版本 3")).toBeNull();
});
it("releases busy ownership on unmount and ignores a late receipt", async () => {
  let finish: (value: unknown) => void = () => {};
  api.amendBusinessTripDates.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })); const busy = vi.fn();
  const { unmount } = render(<BusinessTripDatesPanel row={row} busy={false} onBusyChange={busy} onSaved={saved} />); fill(); fireEvent.submit(form());
  await waitFor(() => expect(api.amendBusinessTripDates).toHaveBeenCalledTimes(1)); unmount();
  expect(busy).toHaveBeenLastCalledWith(false); await act(async () => finish(receipt)); expect(saved).not.toHaveBeenCalled();
});
it("accepts repairing missing old dates, rejects equal new times and reconciles end bounds", async () => {
  render(<Harness request={{ ...row, startAt: null, endAt: null }} />); fill();
  expect(screen.getByLabelText("出差结束时间")).toHaveAttribute("min", "2026-07-31T23:01");
  fireEvent.change(screen.getByLabelText("出差结束时间"), { target: { value: "2026-07-31T23:00" } }); fireEvent.submit(form());
  await screen.findByText(/结束须晚于开始/); expect(api.amendBusinessTripDates).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("出差开始时间"), { target: { value: "2026-08-02T09:00" } });
  expect(screen.getByLabelText("出差结束时间")).toHaveValue("");
});
