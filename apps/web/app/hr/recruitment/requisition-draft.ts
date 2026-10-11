export const requisitionStatusLabels = {
  draft: "草稿", open: "招聘中", paused: "已暂停", closed: "已结束", cancelled: "已取消",
} as const;
export type RequisitionStatus = keyof typeof requisitionStatusLabels;

// Presentation only: the locked backend row remains authoritative for transitions.
const transitions: Record<RequisitionStatus, readonly RequisitionStatus[]> = {
  draft: ["open", "cancelled"], open: ["paused", "closed", "cancelled"],
  paused: ["open", "closed", "cancelled"], closed: ["open"], cancelled: [],
};
export function requisitionStatusChoices(status: RequisitionStatus, hiredCount: number, headcount: number) {
  return [status, ...transitions[status].filter(next =>
    (next !== "cancelled" || hiredCount === 0) && (next !== "open" || headcount > hiredCount))];
}

export type RequisitionEditable = {
  requisitionCode: string; title: string; orgId: string; positionId: string | null;
  ownerUserId: string; headcount: number; plannedOnboardDate: string | null;
  approvalNote: string | null; status: RequisitionStatus;
};
export type RequisitionDraft = Omit<RequisitionEditable, "headcount" | "positionId" | "plannedOnboardDate" | "approvalNote"> & {
  headcount: string; positionId: string; plannedOnboardDate: string; approvalNote: string;
};
const fields = ["requisitionCode", "title", "orgId", "positionId", "ownerUserId", "headcount", "plannedOnboardDate", "approvalNote", "status"] as const;
function validDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match || match[1] === "0000") return false;
  const date = new Date(0);
  date.setFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3]);
}

export function requisitionDraft(row: RequisitionEditable): RequisitionDraft {
  return { requisitionCode: row.requisitionCode, title: row.title, orgId: row.orgId,
    positionId: row.positionId ?? "", ownerUserId: row.ownerUserId, headcount: String(row.headcount),
    plannedOnboardDate: row.plannedOnboardDate ?? "", approvalNote: row.approvalNote ?? "", status: row.status };
}

export function requisitionChanges(original: RequisitionEditable, draft: RequisitionDraft): Partial<RequisitionEditable> {
  if (!/^\d+$/u.test(draft.headcount) || !Number.isSafeInteger(Number(draft.headcount)) || Number(draft.headcount) < 1 || Number(draft.headcount) > 1000) {
    throw new Error("招聘人数须为 1 至 1000 的整数。");
  }
  const normalized: RequisitionEditable = { ...draft, requisitionCode: draft.requisitionCode.trim(),
    title: draft.title.trim(), headcount: Number(draft.headcount), positionId: draft.positionId || null,
    plannedOnboardDate: draft.plannedOnboardDate || null, approvalNote: draft.approvalNote.trim() || null };
  if (!normalized.requisitionCode || !normalized.title || !normalized.orgId || !normalized.ownerUserId) {
    throw new Error("请完整填写需求编号、标题、部门和负责人。");
  }
  if (normalized.plannedOnboardDate !== null && !validDate(normalized.plannedOnboardDate)) {
    throw new Error("计划到岗日无效。");
  }
  return Object.fromEntries(fields.filter(field => normalized[field] !== original[field]).map(field => [field, normalized[field]]));
}

/** Explicit rebase keeps only the user's changed fields; untouched server changes survive. */
export function rebaseRequisitionDraft(original: RequisitionEditable, draft: RequisitionDraft, current: RequisitionEditable): RequisitionDraft {
  return requisitionDraft({ ...current, ...requisitionChanges(original, draft) });
}
