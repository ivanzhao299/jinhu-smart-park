import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { AttachmentList } from "../../components/files/AttachmentList";
import { apiRequest } from "../../lib/api-client";
vi.mock("../../lib/auth-context", () => ({ useAuthUser: () => ({ permissions: ["file:read"] }) }));
vi.mock("../../lib/authz", () => ({ getAccessToken: () => undefined }));
vi.mock("../../lib/api-client", () => ({ apiRequest: vi.fn(), API_PREFIX: "/synthetic-api", createIdempotencyKey: () => "synthetic-key" }));
const file = { id: "file-1", originalName: "合成证书.pdf", mimeType: "application/pdf", fileSize: "100", status: 1 };
beforeEach(() => { vi.clearAllMocks(); vi.mocked(apiRequest).mockResolvedValue({ data: { items: [file], page: 1, page_size: 20, total: 21 } } as never); });

it("recovers associated certificate files, selects metadata and paginates without download or deletion", async () => {
  const selected = vi.fn();
  render(<AttachmentList bizType="hr_training_certificate" bizId="participant-1" compact allowDelete={false} onSelected={selected}/>);
  await screen.findByText("合成证书.pdf");
  expect(apiRequest).toHaveBeenCalledWith(expect.stringContaining("biz_id=participant-1"), expect.anything());
  fireEvent.click(screen.getByRole("button", { name: "选用此文件" }));
  expect(selected).toHaveBeenCalledWith(file);
  expect(screen.queryByRole("button", { name: "预览" })).toBeNull();
  expect(screen.queryByRole("button", { name: "删除" })).toBeNull();
  vi.mocked(apiRequest).mockResolvedValue({ data: { items: [{ ...file, id: "file-21", originalName: "恢复第二页证书.pdf" }], page: 2, page_size: 20, total: 21 } } as never);
  fireEvent.click(screen.getByRole("button", { name: "下一页附件" }));
  await screen.findByText("恢复第二页证书.pdf");
  fireEvent.click(screen.getByRole("button", { name: "选用此文件" }));
  expect(selected).toHaveBeenLastCalledWith(expect.objectContaining({ id: "file-21" }));
  expect(screen.getByRole("button", { name: "下一页附件" })).toBeDisabled();
});

it("disables certificate selection and paging throughout owning workflow mutations", async () => {
  const selected = vi.fn();
  render(<AttachmentList bizType="hr_training_certificate" bizId="participant-1" compact mutationDisabled onSelected={selected}/>);
  await screen.findByText("合成证书.pdf");
  expect(screen.getByRole("button", { name: "选用此文件" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "下一页附件" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "选用此文件" }));
  await waitFor(() => expect(selected).not.toHaveBeenCalled());
});
