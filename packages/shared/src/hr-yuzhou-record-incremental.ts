/** Reviewed source fields only; exports do not admit a public import domain. */
export const YUZHOU_RECORD_SOURCE_FIELDS = {
  skill: ["skillName", "legacyGrade", "note"],
  credential: ["credentialType", "credentialName", "credentialNumber", "issuingAuthority", "acquiredDate", "validTo", "note"],
} as const;
export type YuzhouRecordSourceKind = keyof typeof YUZHOU_RECORD_SOURCE_FIELDS;
export type YuzhouRecordSourceField = (typeof YUZHOU_RECORD_SOURCE_FIELDS)[YuzhouRecordSourceKind][number];
export type YuzhouRecordSourceFacts = Partial<Record<YuzhouRecordSourceField, string | null>>;
const limits: Record<YuzhouRecordSourceField, number> = {
  skillName: 160, legacyGrade: 64, note: 2000, credentialType: 64, credentialName: 160,
  credentialNumber: 64, issuingAuthority: 200, acquiredDate: 10, validTo: 10,
};
const invalid = (): never => { throw new Error("YUZHOU_RECORD_FIELD_INVALID"); };
export function normalizeYuzhouRecordFields(kind: YuzhouRecordSourceKind, value: unknown): YuzhouRecordSourceFacts {
  if (!Object.hasOwn(YUZHOU_RECORD_SOURCE_FIELDS, kind) || value === null || typeof value !== "object" || Array.isArray(value)) return invalid();
  const result: YuzhouRecordSourceFacts = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!(YUZHOU_RECORD_SOURCE_FIELDS[kind] as readonly string[]).includes(key)) return invalid();
    const field = key as YuzhouRecordSourceField, required = ["skillName", "credentialType", "credentialName"].includes(field);
    if (raw === null) { if (required) return invalid(); result[field] = null; continue; }
    if (typeof raw !== "string" || raw.includes("\0") || /\p{Surrogate}/u.test(raw)) return invalid();
    const text = raw.trim();
    if (text.length > limits[field] || (required && !text) || (field === "credentialNumber" && text.includes("*"))) return invalid();
    if (["acquiredDate", "validTo"].includes(field) && text) {
      const date = new Date(`${text}T00:00:00Z`);
      if (!/^(?!0000)\d{4}-\d{2}-\d{2}$/u.test(text) || !Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== text) return invalid();
    }
    result[field] = text || null;
  }
  if (result.acquiredDate && result.validTo && result.validTo < result.acquiredDate) return invalid();
  return result;
}
export type YuzhouRecordFieldPlan = {
  action: "update" | "unchanged" | "conflict"; changedFields: YuzhouRecordSourceField[];
  conflictFields: string[]; writable: YuzhouRecordSourceFacts;
};
/** Per-field three-way comparison. Source custody, original proof, owner scope,
 * transaction locks and target CAS remain execution obligations. */
export function planYuzhouRecordFields(
  kind: YuzhouRecordSourceKind, incoming: unknown, sourceBaseline: Readonly<YuzhouRecordSourceFacts>,
  current: Readonly<YuzhouRecordSourceFacts>, targetBaseline: Readonly<YuzhouRecordSourceFacts>, archived: boolean,
): YuzhouRecordFieldPlan {
  const fields = normalizeYuzhouRecordFields(kind, incoming), changedFields: YuzhouRecordSourceField[] = [], conflictFields: string[] = [], writable: YuzhouRecordSourceFacts = {};
  for (const field of Object.keys(fields) as YuzhouRecordSourceField[]) {
    if (![sourceBaseline, current, targetBaseline].every(v => Object.hasOwn(v, field))) {
      if (!conflictFields.includes("INITIAL_FIELD_BASELINE_UNKNOWN")) conflictFields.push("INITIAL_FIELD_BASELINE_UNKNOWN");
      conflictFields.push(field); continue;
    }
    if (fields[field] === sourceBaseline[field]) continue;
    changedFields.push(field);
    if (fields[field] === current[field]) continue; // Convergence advances only the source baseline.
    if (current[field] !== targetBaseline[field]) conflictFields.push(field);
    else writable[field] = fields[field];
  }
  if (archived && changedFields.length) conflictFields.push("RECORD_ARCHIVED");
  const merged = { ...current, ...writable };
  if (kind === "credential" && Object.keys(writable).length && merged.acquiredDate && merged.validTo && merged.validTo < merged.acquiredDate) conflictFields.push("RECORD_DATE_RANGE_INVALID");
  return { action: conflictFields.length ? "conflict" : changedFields.length ? "update" : "unchanged", changedFields, conflictFields, writable: conflictFields.length ? {} : writable };
}
