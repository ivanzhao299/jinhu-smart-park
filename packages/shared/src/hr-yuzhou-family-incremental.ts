/** Fixed reviewed family fields shared by the public incremental API.
 * Original evidence, scoped transaction writes and source custody are admission obligations. */
export const YUZHOU_FAMILY_SOURCE_FIELDS = ["relationship", "fullName", "contact", "birthDate", "workUnit", "jobTitle", "politicalStatus"] as const;
export type YuzhouFamilySourceField = (typeof YUZHOU_FAMILY_SOURCE_FIELDS)[number];
export type YuzhouFamilySourceFacts = {
  relationship: string; fullName: string; contact: string | null; birthDate: string | null;
  workUnit: string | null; jobTitle: string | null; politicalStatus: string | null;
};
export type YuzhouFamilyBaselineWitness = {
  version: 1; proof: "original_t5_family_set_v1"; operationId: string; bindingSha256: string;
};
const lengths: Record<YuzhouFamilySourceField, number> = {
  relationship: 32, fullName: 100, contact: 64, birthDate: 10, workUnit: 200, jobTitle: 160, politicalStatus: 64,
};
const invalid = (): never => { throw new Error("YUZHOU_FAMILY_FIELD_INVALID"); };

/** Incoming admitted fields only. Missing preserves; explicit null clears a
 * nullable field. Original historical facts are independently certified. */
export function normalizeYuzhouFamilyFields(value: unknown): Partial<YuzhouFamilySourceFacts> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return invalid();
  const result: Partial<YuzhouFamilySourceFacts> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!(YUZHOU_FAMILY_SOURCE_FIELDS as readonly string[]).includes(key)) return invalid();
    const field = key as YuzhouFamilySourceField;
    if (raw === null) {
      if (field === "relationship" || field === "fullName") return invalid();
      Object.assign(result, { [field]: null }); continue;
    }
    if (typeof raw !== "string" || raw.includes("\0") || /\p{Surrogate}/u.test(raw)) return invalid();
    const text = raw.trim();
    if (text.length > lengths[field] || (!text && (field === "relationship" || field === "fullName"))) return invalid();
    if (field === "birthDate" && text) {
      const date = new Date(`${text}T00:00:00Z`);
      if (!/^(?!0000)\d{4}-\d{2}-\d{2}$/u.test(text) || !Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== text) return invalid();
    }
    Object.assign(result, { [field]: text || null });
  }
  return result;
}

export type YuzhouFamilyFieldPlan = {
  action: "update" | "unchanged" | "conflict";
  changedFields: YuzhouFamilySourceField[];
  conflictFields: string[];
  writable: Partial<YuzhouFamilySourceFacts>;
};

/** Source/original/current comparison for a bound existing target. Ownership,
 * permissions, source authentication, locking and CAS remain API obligations. */
export function planYuzhouFamilyFields(
  incoming: unknown, sourceBaseline: Readonly<Partial<YuzhouFamilySourceFacts>>,
  current: Readonly<Partial<YuzhouFamilySourceFacts>>, targetBaseline: Readonly<Partial<YuzhouFamilySourceFacts>>,
  archived: boolean,
): YuzhouFamilyFieldPlan {
  const fields = normalizeYuzhouFamilyFields(incoming);
  const changedFields: YuzhouFamilySourceField[] = [], conflictFields: string[] = [];
  const writable: Partial<YuzhouFamilySourceFacts> = {};
  for (const field of Object.keys(fields) as YuzhouFamilySourceField[]) {
    if (!Object.hasOwn(sourceBaseline, field) || !Object.hasOwn(targetBaseline, field) || !Object.hasOwn(current, field)) {
      if (!conflictFields.includes("INITIAL_FIELD_BASELINE_UNKNOWN")) conflictFields.push("INITIAL_FIELD_BASELINE_UNKNOWN");
      conflictFields.push(field); continue;
    }
    if (fields[field] === sourceBaseline[field]) continue;
    changedFields.push(field);
    // Independently converged values accept the new source baseline without
    // rewriting the target, changing ciphertext or creating a spurious journal.
    if (fields[field] === current[field]) continue;
    if (current[field] !== targetBaseline[field]) conflictFields.push(field);
    else Object.assign(writable, { [field]: fields[field] });
  }
  if (archived && changedFields.length) conflictFields.push("FAMILY_ARCHIVED");
  return {
    action: conflictFields.length ? "conflict" : changedFields.length ? "update" : "unchanged",
    changedFields, conflictFields, writable: conflictFields.length ? {} : writable,
  };
}
