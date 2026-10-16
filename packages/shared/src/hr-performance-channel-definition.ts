/** Exact, browser-safe draft definition contract. Policies describe configuration, never authorization. */
export type HrPerformanceChannelStage = 'self_review' | 'manager_review' | 'calibration';
export type HrPerformanceChannelActor = 'self' | 'manager' | 'calibrator';
export interface HrPerformanceChannelPolicy {
  businessName: string | null;
  stage: HrPerformanceChannelStage | null;
  allowedActors: HrPerformanceChannelActor[];
  required: boolean | null;
  allowExplicitNull: boolean | null;
}
export interface HrPerformanceAdjustmentPolicy extends HrPerformanceChannelPolicy { sourceSwitch: boolean | null; inputMode: 'manual_with_evidence' | null; }
export interface HrPerformanceChannelGuide { id: string; grade: string | null; description: string | null; minValue: string | null; maxValue: string | null; order: number | null; }
export interface HrPerformanceChannelItem { id: string; name: string | null; fullValue: string | null; order: number | null; sourceAssessmentRef: string | null; guides: HrPerformanceChannelGuide[]; }
export interface HrPerformanceGradeCandidate { id: string; code: string; description: string | null; sourceOrderText: string | null; sourceAssessmentRef: string | null; minValue: string | null; maxValue: string | null; }
export interface HrPerformanceChannelDefinition {
  schemaVersion: 1; displayName: string | null; departmentLabel: string | null;
  weights: Record<'sPercent' | 'mPercent' | 'tPercent' | 'xPercent' | 'cPercent', string | null>;
  channels: Record<'s' | 'm' | 't' | 'x' | 'c', HrPerformanceChannelPolicy>;
  adjustmentPolicy: Record<'master' | 'timekeep' | 'bonus', HrPerformanceAdjustmentPolicy>;
  items: HrPerformanceChannelItem[]; gradeCandidates: HrPerformanceGradeCandidate[];
}
const invalid = (): never => { throw new Error('Invalid performance channel definition'); };
const object = (v: unknown, keys: string[]): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v) || ![Object.prototype, null].includes(Object.getPrototypeOf(v))) return invalid();
  const r = v as Record<string, unknown>;
  if (Object.keys(r).length !== keys.length || keys.some(k => !Object.prototype.hasOwnProperty.call(r, k))) return invalid();
  return r;
};
const text = (v: unknown, max: number, nullable = true) => { if (!(nullable && v === null) && (typeof v !== 'string' || [...v].length > max)) invalid(); };
const bool = (v: unknown) => { if (v !== null && typeof v !== 'boolean') invalid(); };
const intString = (v: unknown) => {
  if (v === null) return;
  if (typeof v !== 'string' || !/^-?\d+$/.test(v)) return invalid();
  const n = BigInt(v); if (n < -2147483648n || n > 2147483647n) invalid();
};
const decimal = (v: unknown) => {
  if (v === null) return;
  if (typeof v !== 'string' || !/^-?\d+(?:\.\d{1,2})?$/.test(v)) return invalid();
  if (v.replace(/^-/, '').split('.')[0]!.replace(/^0+/, '').length > 16) invalid();
};
const order = (v: unknown) => { if (v !== null && (typeof v !== 'number' || !Number.isInteger(v) || v < -2147483648 || v > 2147483647)) invalid(); };
const collection = (v: unknown, visit: (row: Record<string, unknown>) => void, keys: string[]) => {
  if (!Array.isArray(v)) return invalid();
  const ids = new Set<string>();
  for (const entry of v) {
    const r = object(entry, keys); text(r.id, 128, false);
    if (r.id === '' || ids.has(r.id as string)) invalid(); ids.add(r.id as string); visit(r);
  }
};
const policy = (v: unknown, adjustment = false) => {
  const r = object(v, ['businessName', 'stage', 'allowedActors', 'required', 'allowExplicitNull', ...(adjustment ? ['sourceSwitch', 'inputMode'] : [])]);
  text(r.businessName, 120); bool(r.required); bool(r.allowExplicitNull);
  if (r.stage !== null && !['self_review', 'manager_review', 'calibration'].includes(r.stage as string)) invalid();
  if (!Array.isArray(r.allowedActors) || r.allowedActors.some(x => !['self', 'manager', 'calibrator'].includes(x)) || new Set(r.allowedActors).size !== r.allowedActors.length) invalid();
  if (adjustment) { bool(r.sourceSwitch); if (r.inputMode !== null && r.inputMode !== 'manual_with_evidence') invalid(); }
};
export function validateHrPerformanceChannelDefinition(value: unknown): asserts value is HrPerformanceChannelDefinition {
  const r = object(value, ['schemaVersion', 'displayName', 'departmentLabel', 'weights', 'channels', 'adjustmentPolicy', 'items', 'gradeCandidates']);
  if (r.schemaVersion !== 1) invalid(); text(r.displayName, 120); text(r.departmentLabel, 30);
  Object.values(object(r.weights, ['sPercent', 'mPercent', 'tPercent', 'xPercent', 'cPercent'])).forEach(intString);
  Object.values(object(r.channels, ['s', 'm', 't', 'x', 'c'])).forEach(v => policy(v));
  Object.values(object(r.adjustmentPolicy, ['master', 'timekeep', 'bonus'])).forEach(v => policy(v, true));
  collection(r.items, item => {
    text(item.name, 100); decimal(item.fullValue); order(item.order); intString(item.sourceAssessmentRef);
    collection(item.guides, guide => { text(guide.grade, 64); text(guide.description, 500); decimal(guide.minValue); decimal(guide.maxValue); order(guide.order); }, ['id', 'grade', 'description', 'minValue', 'maxValue', 'order']);
  }, ['id', 'name', 'fullValue', 'order', 'sourceAssessmentRef', 'guides']);
  collection(r.gradeCandidates, grade => { text(grade.code, 64, false); text(grade.description, 500); text(grade.sourceOrderText, 2); intString(grade.sourceAssessmentRef); decimal(grade.minValue); decimal(grade.maxValue); }, ['id', 'code', 'description', 'sourceOrderText', 'sourceAssessmentRef', 'minValue', 'maxValue']);
}
export function emptyHrPerformanceChannelDefinition(): HrPerformanceChannelDefinition {
  const p = (): HrPerformanceChannelPolicy => ({ businessName: null, stage: null, allowedActors: [], required: null, allowExplicitNull: null });
  const a = (): HrPerformanceAdjustmentPolicy => ({ ...p(), sourceSwitch: null, inputMode: null });
  return { schemaVersion: 1, displayName: null, departmentLabel: null, weights: { sPercent: null, mPercent: null, tPercent: null, xPercent: null, cPercent: null }, channels: { s: p(), m: p(), t: p(), x: p(), c: p() }, adjustmentPolicy: { master: a(), timekeep: a(), bonus: a() }, items: [], gradeCandidates: [] };
}
