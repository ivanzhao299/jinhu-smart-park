import type { HrCandidate, HrRequisition } from "../../../lib/hr-api";
import { csvDocument } from "../../../lib/scoped-csv-export";
import { requisitionStatusLabels } from "./requisition-draft";

export const candidateStageLabels: Record<string, string> = { talent_pool: "人才库", screening: "筛选", interview: "面试", offer: "Offer", hired: "已录用", rejected: "未通过", withdrawn: "已退出" };
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const nullableText = (value: unknown) => value === null || typeof value === "string";
function calendar(value: unknown) {
  if (value === null) return true;
  if (typeof value !== "string" || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function validRow(value: unknown, kind: "requisition" | "candidate") {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  if (!text(row.id)) return false;
  if (kind === "requisition") return ["requisitionCode", "title", "orgId", "orgName", "ownerUserId"].every(key => text(row[key])) &&
    ["positionId", "positionName", "ownerName"].every(key => nullableText(row[key])) && calendar(row.plannedOnboardDate) &&
    typeof row.status === "string" && Object.hasOwn(requisitionStatusLabels, row.status) &&
    Number.isSafeInteger(row.headcount) && Number(row.headcount) >= 1 && Number.isSafeInteger(row.hiredCount) && Number(row.hiredCount) >= 0 && Number(row.hiredCount) <= Number(row.headcount);
  return ["candidateNo", "fullName", "requisitionId", "requisitionTitle"].every(key => text(row[key])) &&
    ["source", "latestEvaluation", "mobileMasked", "emailMasked", "identityMasked", "convertedEmployeeId"].every(key => nullableText(row[key])) &&
    calendar(row.expectedOnboardDate) && typeof row.stage === "string" && Object.hasOwn(candidateStageLabels, row.stage);
}
export function recruitmentLedgerExportCsv(result: unknown, kind: "requisition" | "candidate"): { csv: string; total: number } {
  const error = () => new Error("招聘台账导出响应无法核对，请重新导出。");
  if (!result || typeof result !== "object") throw error();
  const { items, total, snapshotAt } = result as { items?: unknown; total?: unknown; snapshotAt?: unknown };
  if (!Array.isArray(items) || typeof total !== "number" || !Number.isSafeInteger(total) || total < 0 || total > 5000 || items.length !== total ||
    !items.every(row => validRow(row, kind)) || new Set(items.map(row => row.id)).size !== total ||
    typeof snapshotAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(snapshotAt) ||
    !Number.isFinite(Date.parse(snapshotAt)) || new Date(snapshotAt).toISOString() !== snapshotAt) throw error();
  if (kind === "requisition") return { total, csv: csvDocument([
    ["需求编号", "岗位名称", "部门", "岗位", "招聘人数", "已录用人数", "负责人", "计划到岗日", "状态"],
    ...(items as HrRequisition[]).map(row => [row.requisitionCode, row.title, row.orgName, row.positionName, row.headcount, row.hiredCount, row.ownerName, row.plannedOnboardDate, requisitionStatusLabels[row.status as keyof typeof requisitionStatusLabels]])
  ]) };
  return { total, csv: csvDocument([
    ["候选人编号", "姓名", "招聘需求", "阶段", "来源", "预计到岗日", "最近评价", "电话（脱敏）", "邮箱（脱敏）", "证件（脱敏）"],
    ...(items as HrCandidate[]).map(row => [row.candidateNo, row.fullName, row.requisitionTitle, candidateStageLabels[row.stage], row.source, row.expectedOnboardDate, row.latestEvaluation, row.mobileMasked, row.emailMasked, row.identityMasked])
  ]) };
}
