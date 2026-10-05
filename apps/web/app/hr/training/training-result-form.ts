export type TrainingResultMode = "complete" | "correct";
export type TrainingResultPayload = {
  expectedRevision?: number;
  reason?: string;
  completedHours?: string;
  correctedHours?: string;
  score?: string | null;
  correctedScore?: string | null;
  evaluation?: string | null;
  correctedEvaluation?: string | null;
  actualCost?: string | null;
  correctedActualCost?: string | null;
  memo?: string | null;
  correctedMemo?: string | null;
  certificateFileId?: string | null;
};

export function trainingResultPayload(form: FormData, mode: TrainingResultMode, revision: number, canCost: boolean, canCertificate: boolean): TrainingResultPayload {
  const result: TrainingResultPayload = {};
  const fields = ["hours", "score", "evaluation", "memo", ...(canCost ? ["actualCost"] : []), ...(canCertificate ? ["certificateFileId"] : [])];
  for (const field of fields) {
    const action = form.get(`${field}Action`);
    if (action !== "write" && action !== "clear") continue;
    if (field === "hours" && action === "clear") throw new Error("学时不能清空");
    const value = action === "clear" ? null : String(form.get(field) ?? "");
    if (action === "write" && !["memo", "evaluation"].includes(field) && !value?.trim()) throw new Error("请填写选择修改的字段");
    const key = field === "certificateFileId" ? field : mode === "complete" ? (field === "hours" ? "completedHours" : field) : `corrected${field.charAt(0).toUpperCase()}${field.slice(1)}`;
    Object.assign(result, { [key]: value });
  }
  if (mode === "complete" && result.completedHours === undefined) throw new Error("请填写完成学时");
  if (mode === "correct") {
    if (!Object.keys(result).length) throw new Error("请先选择需要修改或清空的字段");
    const reason = String(form.get("reason") ?? "").trim();
    if (!reason) throw new Error("请填写更正原因");
    result.expectedRevision = revision;
    result.reason = reason;
  }
  return result;
}
