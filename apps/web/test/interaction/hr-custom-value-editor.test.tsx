import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { HrCustomValueEditor } from "../../app/hr/employees/components/HrCustomValueEditor";
import { hrApi, type HrEmployeeProfile } from "../../lib/hr-api";

vi.mock("../../lib/hr-api", () => ({ hrApi: { updateCustomValue: vi.fn() } }));
vi.mock("../../lib/authz", () => ({ getAccessToken: () => "synthetic-test-token" }));
const field: NonNullable<HrEmployeeProfile["customFields"]>[number] = {
  definitionId: "definition", version: 0, code: "def1", label: "扩展资料", valueType: "text", group: null, sortOrder: 0, value: "source", sourceValid: true
};
beforeEach(() => { vi.mocked(hrApi.updateCustomValue).mockReset(); });

it("submits explicit null with the admitted field version and updates only its effective value", async () => {
  const onSaved = vi.fn();
  vi.mocked(hrApi.updateCustomValue).mockResolvedValue({ definitionId: "definition", version: 1, valueStatus: "null" });
  render(<HrCustomValueEditor employeeId="employee" fields={[field]} captureScope={() => () => true} onSaved={onSaved} onReload={vi.fn()} />);
  fireEvent.click(screen.getByRole("checkbox", { name: "清空此字段" }));
  fireEvent.click(screen.getByRole("button", { name: "保存字段" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ ...field, value: null, version: 1, sourceValid: true }));
  expect(hrApi.updateCustomValue).toHaveBeenCalledWith("employee", "definition", { expectedVersion: 0, value: null }, "synthetic-test-token");
});

it("retains the draft and blocks blind retries when the write outcome is unconfirmed", async () => {
  vi.mocked(hrApi.updateCustomValue).mockRejectedValue(new Error("synthetic timeout"));
  const onReload = vi.fn();
  render(<HrCustomValueEditor employeeId="employee" fields={[field]} captureScope={() => () => true} onSaved={vi.fn()} onReload={onReload} />);
  fireEvent.change(screen.getByRole("textbox", { name: "扩展资料" }), { target: { value: "draft" } });
  fireEvent.click(screen.getByRole("button", { name: "保存字段" }));
  await screen.findByText(/保存未确认/);
  expect(screen.getByRole("textbox", { name: "扩展资料" })).toHaveValue("draft");
  expect(screen.getByRole("button", { name: "保存字段" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "重新加载档案" }));
  expect(onReload).toHaveBeenCalledOnce();
  expect(hrApi.updateCustomValue).toHaveBeenCalledOnce();
});

it("ignores a delayed successful save after the employee request scope changes", async () => {
  let resolve!: (value: { definitionId: string; version: number; valueStatus: "valid" }) => void;
  vi.mocked(hrApi.updateCustomValue).mockReturnValue(new Promise(done => { resolve = done; }));
  let current = true;
  const onSaved = vi.fn();
  render(<HrCustomValueEditor employeeId="employee" fields={[field]} captureScope={() => () => current} onSaved={onSaved} onReload={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "保存字段" }));
  current = false;
  await act(async () => { resolve({ definitionId: "definition", version: 1, valueStatus: "valid" }); });
  await waitFor(() => expect(hrApi.updateCustomValue).toHaveBeenCalledOnce());
  expect(onSaved).not.toHaveBeenCalled();
});

it("does not admit an unversioned field for editing", () => {
  render(<HrCustomValueEditor employeeId="employee" fields={[{ ...field, version: undefined }]} captureScope={() => () => true} onSaved={vi.fn()} onReload={vi.fn()} />);
  expect(screen.getByRole("textbox", { name: "扩展资料" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "保存字段" })).toBeDisabled();
});
