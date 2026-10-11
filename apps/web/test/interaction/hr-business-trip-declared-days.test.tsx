import { StrictMode, useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { BusinessTripDeclaredDaysPanel } from "../../app/hr/attendance/BusinessTripDeclaredDaysPanel";
import type { HrAttendanceRequest } from "../../lib/hr-api";
import { ApiError } from "../../lib/api-client";

let token = "scope-a";
const api = vi.hoisted(() => ({ amendBusinessTripDeclaredDays: vi.fn(), businessTripDeclaredDaysHistory: vi.fn() }));
vi.mock("../../lib/hr-api", () => ({ hrApi: api }));
vi.mock("../../lib/authz", () => ({ getAccessToken: () => token }));
const row: HrAttendanceRequest = {
  id: "trip-1", requestNo: "ATT-TRIP", requestType: "business_trip", status: "approved", amendVersion: 2,
  declaredDays: -2, legacyDeclaredDays: -2, startAt: "2026-07-12T00:00:00.000Z", endAt: "2026-07-12T09:00:00.000Z",
  attendanceDate: null, durationMinutes: 540, leavePlannedMinutes: 0, leaveEffectiveMinutes: 0, leaveDayCount: 0,
  reason: "合成", submittedAt: null, reviewedAt: null, reviewComment: null, isSelf: false, organizationName: null,
};
const saved = vi.fn();
function Harness({ request = row }: { request?: HrAttendanceRequest }) {
  const [busy, setBusy] = useState(false);
  return <BusinessTripDeclaredDaysPanel key={request.id} row={request} busy={busy} onBusyChange={setBusy} onSaved={saved} />;
}
function fill(days = "0") {
  fireEvent.click(screen.getByRole("button", { name: "更正申报天数" }));
  fireEvent.change(screen.getByLabelText("申报天数"), { target: { value: days } });
  fireEvent.change(screen.getByLabelText("更正原因"), { target: { value: "合成更正原因" } });
}
const form = () => screen.getByRole("form", { name: "更正出差申报天数" });
const entry = (version: number) => ({ id: `history-${version}`, requestVersion: version, beforeDeclaredDays: -2, declaredDays: 0, reason: "合成历史", createdAt: "2026-10-12T00:00:00.000Z" });
beforeEach(() => {
  token = "scope-a"; vi.resetAllMocks(); saved.mockResolvedValue(undefined);
  api.amendBusinessTripDeclaredDays.mockResolvedValue({ id: row.id, declaredDays: 0, amendVersion: 3 });
  api.businessTripDeclaredDaysHistory.mockResolvedValue({ items: [entry(2)], total: 1, page: 1, page_size: 20 });
});

it("only approved trips with an operation version expose the correction controls", () => {
  const { rerender } = render(<Harness request={{ ...row, amendVersion: undefined }} />);
  expect(screen.queryByRole("button", { name: "更正申报天数" })).toBeNull();
  rerender(<Harness request={{ ...row, status: "draft" }} />);
  expect(screen.queryByRole("button", { name: "更正申报天数" })).toBeNull();
  rerender(<Harness />);
  expect(screen.getByRole("button", { name: "更正申报天数" })).toBeInTheDocument();
});

it("retains a failed draft and exact retry key; synchronous duplicate submissions issue one write", async () => {
  api.amendBusinessTripDeclaredDays.mockRejectedValueOnce(new Error("合成网络中断"));
  render(<StrictMode><Harness /></StrictMode>); fill();
  act(() => { fireEvent.submit(form()); fireEvent.submit(form()); });
  await screen.findByText("合成网络中断");
  expect(api.amendBusinessTripDeclaredDays).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText("更正原因")).toHaveValue("合成更正原因");
  expect(screen.getByLabelText("申报天数")).toBeDisabled();
  const first = api.amendBusinessTripDeclaredDays.mock.calls[0];
  fireEvent.submit(form());
  await screen.findByText(/出差申报天数已更正/);
  expect(api.amendBusinessTripDeclaredDays.mock.calls[1]).toEqual(first);
  expect(first?.slice(0, 3)).toEqual([row.id, { declaredDays: 0, expectedVersion: 2, reason: "合成更正原因" }, "scope-a"]);
  expect(screen.queryByRole("form")).toBeNull();
});

it("clears nullable days explicitly and preserves committed success after a refresh error", async () => {
  api.amendBusinessTripDeclaredDays.mockResolvedValue({ id: row.id, declaredDays: null, amendVersion: 3 });
  saved.mockRejectedValueOnce(new Error("合成刷新失败"));
  render(<Harness />); fill(""); fireEvent.submit(form());
  await screen.findByText("合成刷新失败");
  expect(screen.getByText(/出差申报天数已更正/)).toBeInTheDocument();
  expect(screen.queryByRole("form")).toBeNull();
  expect(api.amendBusinessTripDeclaredDays.mock.calls[0]?.[1].declaredDays).toBeNull();
  expect(saved).toHaveBeenCalledTimes(1);
});

it("rejects a foreign receipt without dismissing the original draft or minting another key", async () => {
  api.amendBusinessTripDeclaredDays.mockResolvedValueOnce({ id: "foreign", declaredDays: 0, amendVersion: 3 });
  render(<Harness />); fill(); fireEvent.submit(form());
  await screen.findByText(/更正回执不匹配/);
  expect(saved).not.toHaveBeenCalled();
  const key = api.amendBusinessTripDeclaredDays.mock.calls[0]?.[3];
  fireEvent.submit(form()); await screen.findByText(/出差申报天数已更正/);
  expect(api.amendBusinessTripDeclaredDays.mock.calls[1]?.[3]).toBe(key);
});

it("rejects a changed identity before sending and a changed version without discarding draft text", async () => {
  const { rerender } = render(<Harness />); fill(); token = "scope-b"; fireEvent.submit(form());
  await screen.findByText(/当前身份或出差版本已变化/); expect(api.amendBusinessTripDeclaredDays).not.toHaveBeenCalled();
  token = "scope-a"; rerender(<Harness request={{ ...row, amendVersion: 3 }} />); fireEvent.submit(form());
  expect(api.amendBusinessTripDeclaredDays).not.toHaveBeenCalled();
  expect(screen.getByLabelText("更正原因")).toHaveValue("合成更正原因");
});

it("uses complete server pagination and ignores a history response after identity changes", async () => {
  api.businessTripDeclaredDaysHistory.mockResolvedValueOnce({ items: [entry(22)], total: 21, page: 1, page_size: 20 });
  let finish: (value: unknown) => void = () => {};
  api.businessTripDeclaredDaysHistory.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  render(<Harness />); fireEvent.click(screen.getByRole("button", { name: "查看更正历史" }));
  await screen.findByText("第 1 / 2 页 · 共 21 条");
  fireEvent.click(screen.getByRole("button", { name: "更正历史下一页" }));
  token = "scope-b";
  await act(async () => finish({ items: [entry(2)], total: 21, page: 2, page_size: 20 }));
  expect(screen.queryByText("更正版本 2")).toBeNull();
  expect(api.businessTripDeclaredDaysHistory.mock.calls[1]?.slice(0, 4)).toEqual([row.id, "scope-a", 2, 20]);
});

it("unmounting releases the busy owner without publishing the late write receipt", async () => {
  let finish: (value: unknown) => void = () => {};
  api.amendBusinessTripDeclaredDays.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const busy = vi.fn();
  const { unmount } = render(<BusinessTripDeclaredDaysPanel row={row} busy={false} onBusyChange={busy} onSaved={saved} />);
  fill(); fireEvent.submit(form()); await waitFor(() => expect(api.amendBusinessTripDeclaredDays).toHaveBeenCalledTimes(1));
  unmount(); expect(busy).toHaveBeenLastCalledWith(false);
  await act(async () => finish({ id: row.id, declaredDays: 0, amendVersion: 3 }));
  expect(saved).not.toHaveBeenCalled();
});

it("a rejected in-flight result after an identity switch stays locked to the original request", async () => {
  let reject: (cause: Error) => void = () => {};
  api.amendBusinessTripDeclaredDays.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
  render(<Harness />); fill(); fireEvent.submit(form());
  token = "scope-b";
  await act(async () => reject(new Error("合成中断")));
  await screen.findByText(/身份范围已变化，请回到原范围核对办理结果/);
  expect(screen.getByLabelText("更正原因")).toBeDisabled();
  token = "scope-a"; fireEvent.submit(form()); await screen.findByText(/出差申报天数已更正/);
  expect(api.amendBusinessTripDeclaredDays.mock.calls[1]).toEqual(api.amendBusinessTripDeclaredDays.mock.calls[0]);
});

it("a definite validation rejection permits correcting the draft and starts a new request", async () => {
  api.amendBusinessTripDeclaredDays.mockRejectedValueOnce(new ApiError("合成字段校验失败", 422));
  render(<Harness />); fill(); fireEvent.submit(form()); await screen.findByText("合成字段校验失败");
  const previousKey = api.amendBusinessTripDeclaredDays.mock.calls[0]?.[3];
  expect(screen.getByLabelText("申报天数")).toBeEnabled();
  fireEvent.change(screen.getByLabelText("申报天数"), { target: { value: "1" } });
  api.amendBusinessTripDeclaredDays.mockResolvedValue({ id: row.id, declaredDays: 1, amendVersion: 3 });
  fireEvent.submit(form()); await screen.findByText(/出差申报天数已更正/);
  expect(api.amendBusinessTripDeclaredDays.mock.calls[1]?.[3]).not.toBe(previousKey);
  expect(api.amendBusinessTripDeclaredDays.mock.calls[1]?.[1].declaredDays).toBe(1);
});
