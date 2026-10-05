import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { HR_PERMISSIONS, SYSTEM_PERMISSIONS } from "@jinhu/shared";
import { TrainingResultForm } from "../../app/hr/training/TrainingResultForm";
const state = vi.hoisted(() => ({ user: { permissions: [] as string[] } }));
vi.mock("../../lib/auth-context", () => ({ useAuthUser: () => state.user }));
vi.mock("../../components/files/FileUploader", () => ({ FileUploader: (props: { disabled: boolean; onUploadingChange: (value: boolean) => void; onUploaded: (file: unknown) => void }) => <>
  <button type="button" disabled={props.disabled} onClick={() => props.onUploadingChange(true)}>开始合成上传</button>
  <button type="button" onClick={() => { props.onUploadingChange(false); props.onUploaded({ id: "uploaded-file", originalName: "合成上传.pdf" }); }}>完成合成上传</button>
</> }));
vi.mock("../../components/files/AttachmentList", () => ({ AttachmentList: (props: { bizId: string; mutationDisabled: boolean; onSelected?: (file: unknown) => void }) => <section aria-label="合成关联附件"><span>{props.bizId}</span>{props.onSelected ? <button type="button" disabled={props.mutationDisabled} onClick={() => props.onSelected?.({ id: "recovered-file", originalName: "恢复证书.pdf" })}>选用恢复证书</button> : null}</section> }));
const participant = { id: "participant", employeeName: "Synthetic", status: "completed", checkedInAt: null, completedHours: "8", score: "84", memo: null, correctionVersion: 7, canAct: true };
beforeEach(() => { state.user.permissions = []; });

it.each([
  [[], false, false],
  [[HR_PERMISSIONS.HR_TRAINING_DOCUMENT_MANAGE, HR_PERMISSIONS.HR_TRAINING_DOCUMENT_READ], false, false],
  [[SYSTEM_PERMISSIONS.FILE_UPLOAD, SYSTEM_PERMISSIONS.FILE_READ], false, false],
  [[HR_PERMISSIONS.HR_TRAINING_DOCUMENT_MANAGE, HR_PERMISSIONS.HR_TRAINING_DOCUMENT_READ, SYSTEM_PERMISSIONS.FILE_UPLOAD, SYSTEM_PERMISSIONS.FILE_READ], true, true],
] as const)("file capabilities require their domain and generic permissions: %j", (permissions, upload, read) => {
  state.user.permissions = [...permissions];
  render(<TrainingResultForm participant={participant} mode="correct" busy={false} onSubmit={vi.fn()}/>);
  expect(Boolean(screen.queryByRole("button", { name: "开始合成上传" }))).toBe(upload);
  expect(Boolean(screen.queryByRole("region", { name: "合成关联附件" }))).toBe(read);
  expect(screen.queryByRole("combobox", { name: "实际费用操作" })).toBeNull();
});

it("blocks submission through upload, recovers certificate selection and retains failed drafts", async () => {
  state.user.permissions = [HR_PERMISSIONS.HR_TRAINING_DOCUMENT_MANAGE, HR_PERMISSIONS.HR_TRAINING_DOCUMENT_READ, SYSTEM_PERMISSIONS.FILE_UPLOAD, SYSTEM_PERMISSIONS.FILE_READ];
  const submit = vi.fn().mockResolvedValue(false);
  render(<TrainingResultForm participant={participant} mode="correct" busy={false} onSubmit={submit}/>);
  fireEvent.change(screen.getByRole("textbox", { name: "更正原因" }), { target: { value: "Synthetic reason" } });
  fireEvent.click(screen.getByRole("button", { name: "开始合成上传" }));
  expect(screen.getByRole("button", { name: "保存培训结果更正" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "选用恢复证书" })).toBeDisabled();
  fireEvent.submit(screen.getByRole("button", { name: "保存培训结果更正" }).closest("form")!);
  expect(submit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "完成合成上传" }));
  fireEvent.click(screen.getByRole("button", { name: "选用恢复证书" }));
  fireEvent.click(screen.getByRole("button", { name: "保存培训结果更正" }));
  await waitFor(() => expect(submit).toHaveBeenCalledWith({ certificateFileId: "recovered-file", expectedRevision: 7, reason: "Synthetic reason" }));
  expect(screen.getByRole("textbox", { name: "更正原因" })).toHaveValue("Synthetic reason");
  expect(screen.getByRole("combobox", { name: "证书操作" })).toHaveValue("write");
});

it("ordinary fields submit explicit zero and clear without inventing costs or certificates", async () => {
  const submit = vi.fn().mockResolvedValue(true);
  render(<TrainingResultForm participant={participant} mode="correct" busy={false} onSubmit={submit}/>);
  fireEvent.change(screen.getByRole("combobox", { name: "成绩操作" }), { target: { value: "write" } });
  fireEvent.change(screen.getByRole("spinbutton", { name: "成绩" }), { target: { value: "0" } });
  fireEvent.change(screen.getByRole("combobox", { name: "评价操作" }), { target: { value: "clear" } });
  fireEvent.change(screen.getByRole("textbox", { name: "更正原因" }), { target: { value: "Synthetic zero" } });
  fireEvent.click(screen.getByRole("button", { name: "保存培训结果更正" }));
  await waitFor(() => expect(submit).toHaveBeenCalledWith({ correctedScore: "0", correctedEvaluation: null, expectedRevision: 7, reason: "Synthetic zero" }));
});
