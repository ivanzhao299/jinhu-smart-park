import type { HrFeedback360Configuration } from "../../../lib/hr-api";
const record = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === "object" && !Array.isArray(v));
const text = (v: unknown, minimum = 1) => typeof v === "string" && v.trim().length >= minimum;
const decimal = (v: unknown, precision: number, min: number, max: number) => typeof v === "string" && new RegExp(`^\\d+(?:\\.\\d{1,${precision}})?$`).test(v) && Number(v) >= min && Number(v) <= max;
const version = (v: unknown): v is Record<string, unknown> => record(v) && text(v.id) && text(v.versionId) && text(v.versionName, 2) && ["draft", "published", "retired"].includes(String(v.status)) && ["draft", "published", "retired"].includes(String(v.versionStatus)) && Number.isSafeInteger(v.currentVersionNo) && Number(v.currentVersionNo) >= 1 && Number.isSafeInteger(v.versionNo) && Number(v.versionNo) >= 1;

export function feedbackConfigurationData(value: unknown): HrFeedback360Configuration {
  const invalid = () => { throw new Error("360配置响应不完整，请重新加载。"); };
  if (!record(value) || !Array.isArray(value.models) || !Array.isArray(value.questionnaires)) return invalid();
  for (const m of value.models) {
    if (!version(m) || !text(m.modelCode) || !text(m.modelName, 2) || !decimal(m.scaleMin, 2, 0, 100) || !decimal(m.scaleMax, 2, .01, 100) || Number(m.scaleMin) >= Number(m.scaleMax) || !Array.isArray(m.dimensions) || m.dimensions.length < 1 || m.dimensions.length > 30) return invalid();
    const codes = new Set<string>(); let total = 0;
    for (const d of m.dimensions) {
      if (!record(d) || !text(d.code) || codes.has(String(d.code)) || !text(d.name, 2) || !(d.description === null || typeof d.description === "string") || !decimal(d.weight, 4, .0001, 1) || !Array.isArray(d.anchors) || d.anchors.length < 2 || d.anchors.length > 20) return invalid();
      codes.add(String(d.code)); total += Number(d.weight);
      const levels = new Set<number>();
      for (const a of d.anchors) {
        if (!record(a) || !decimal(a.level, 2, Number(m.scaleMin), Number(m.scaleMax)) || levels.has(Number(a.level)) || !text(a.text, 2)) return invalid();
        levels.add(Number(a.level));
      }
    }
    if (Math.abs(total - 1) > .000001) return invalid();
  }
  const models = value.models as HrFeedback360Configuration["models"];
  if (new Set(models.map(m => m.versionId)).size !== models.length) return invalid();
  for (const q of value.questionnaires) {
    if (!version(q) || !text(q.questionnaireCode) || !text(q.questionnaireName, 2) || !text(q.modelName, 2) || !text(q.modelVersionName, 2) || !text(q.modelVersionId) || !Array.isArray(q.questions) || q.questions.length < 1 || q.questions.length > 100) return invalid();
    const model = models.find(m => m.versionId === q.modelVersionId); if (!model) return invalid();
    const codes = new Set<string>();
    for (const question of q.questions) {
      if (!record(question) || !text(question.code) || codes.has(String(question.code)) || !text(question.text, 2) || !model.dimensions.some(d => d.code === question.dimensionCode) || !["rating", "text"].includes(String(question.type)) || typeof question.required !== "boolean") return invalid();
      codes.add(String(question.code));
    }
  }
  const questionnaires = value.questionnaires as HrFeedback360Configuration["questionnaires"];
  if (new Set(questionnaires.map(q => q.versionId)).size !== questionnaires.length) return invalid();
  return { models, questionnaires };
}
