const text = value => value === null || value === undefined ? null : String(value).trim() || null;

export class LegacyProfessionalTitleMaterializationError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyProfessionalTitleMaterializationError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new LegacyProfessionalTitleMaterializationError(code, detail); };

export function buildLegacyProfessionalTitleDictionary(rows) {
  if (!Array.isArray(rows)) fail("LEGACY_PROFESSIONAL_TITLE_DICTIONARY_INVALID", "dictionary must be an array");
  const dictionary = new Map();
  for (const row of rows) {
    if (row === null || typeof row !== "object" || Array.isArray(row) || JSON.stringify(Object.keys(row).sort()) !== JSON.stringify(["assignment", "assignmentname"])) {
      fail("LEGACY_PROFESSIONAL_TITLE_DICTIONARY_INVALID", "dictionary columns differ");
    }
    const code = text(row.assignment);
    const label = text(row.assignmentname);
    if (!code || code.length > 2 || !label || label.length > 30) fail("LEGACY_PROFESSIONAL_TITLE_DICTIONARY_INVALID", "dictionary code or label invalid");
    if (dictionary.has(code)) fail("LEGACY_PROFESSIONAL_TITLE_DICTIONARY_DUPLICATE", "dictionary code is not unique");
    dictionary.set(code, label);
  }
  return dictionary;
}

export function materializeLegacyProfessionalTitle(value, dictionary) {
  if (!(dictionary instanceof Map)) fail("LEGACY_PROFESSIONAL_TITLE_DICTIONARY_INVALID", "dictionary is unavailable");
  const code = text(value);
  if (code === null) return { legacyProfessionalTitleCode: null, technicalTitle: null };
  if (code.length > 2 || !dictionary.has(code)) fail("LEGACY_PROFESSIONAL_TITLE_UNKNOWN_CODE", "person assignment is absent from the reviewed dictionary");
  return { legacyProfessionalTitleCode: code, technicalTitle: dictionary.get(code) };
}
