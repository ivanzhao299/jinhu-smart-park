import type { HrPerformanceTemplateDetailV2 } from "../../../lib/hr-api";

export function performanceTemplateDetail(value: unknown, requestedId: string): HrPerformanceTemplateDetailV2 {
  const fail = () => { throw new Error("评价模板响应无效，请重新加载。"); };
  if (!value || typeof value !== "object") return fail();
  const data = value as HrPerformanceTemplateDetailV2;
  if (data.templateId !== requestedId || typeof data.versionId !== "string" || !data.versionId.trim() || !Number.isSafeInteger(data.versionNo) || data.versionNo < 1 || !["draft", "published"].includes(data.status)) return fail();
  if ([data.templateCode, data.templateName, data.versionName].some(text => typeof text !== "string" || !text.trim())) return fail();
  if (!Array.isArray(data.dimensions) || data.dimensions.length < 1 || data.dimensions.length > 30 || !Array.isArray(data.levels) || data.levels.length < 1 || data.levels.length > 20) return fail();
  const numeric = (value: unknown, min: number, max: number) => (typeof value === "number" || (typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value))) && Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max;
  const dimensions = data.dimensions.map(row => {
    if (!row || typeof row.code !== "string" || !row.code.trim() || typeof row.name !== "string" || !row.name.trim() || !numeric(row.weight, .0001, 1) || !numeric(row.scoreMin, 0, 100) || !numeric(row.scoreMax, 0, 100) || Number(row.scoreMax) <= Number(row.scoreMin)) return fail();
    if (row.scoringGuide != null && (typeof row.scoringGuide !== "object" || Array.isArray(row.scoringGuide))) return fail();
    return { code: row.code, name: row.name, weight: String(row.weight), scoreMin: String(row.scoreMin), scoreMax: String(row.scoreMax), scoringGuide: row.scoringGuide ?? {} };
  });
  const levels = data.levels.map(row => {
    if (!row || typeof row.code !== "string" || !row.code.trim() || typeof row.name !== "string" || !row.name.trim() || !numeric(row.scoreMin, 0, 100) || !numeric(row.scoreMax, 0, 100) || Number(row.scoreMax) < Number(row.scoreMin)) return fail();
    return { code: row.code, name: row.name, scoreMin: String(row.scoreMin), scoreMax: String(row.scoreMax) };
  });
  if (new Set(dimensions.map(row => row.code.trim())).size !== dimensions.length || new Set(levels.map(row => row.code.trim())).size !== levels.length || Math.abs(dimensions.reduce((sum, row) => sum + Number(row.weight), 0) - 1) > .000001) return fail();
  const sorted = [...levels].sort((a, b) => Number(a.scoreMin) - Number(b.scoreMin));
  if (Number(sorted[0]!.scoreMin) !== 0 || Number(sorted.at(-1)!.scoreMax) !== 100 || sorted.some((row, index) => index > 0 && Math.abs(Number(row.scoreMin) - Number(sorted[index - 1]!.scoreMax) - .01) > .000001)) return fail();
  return { templateId: data.templateId, templateCode: data.templateCode, templateName: data.templateName, versionId: data.versionId, versionNo: data.versionNo, versionName: data.versionName, status: data.status, dimensions, levels };
}
