import type { HrLegacyArchiveRecord } from "../../../../lib/hr-api";

function isRecordedDate(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 64) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d{1,7})?(?:Z|[+-](\d{2}):(\d{2}))?)?$/u.exec(value);
  if (!match) return false;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]!
    && (match[4] === undefined || (Number(match[4]) < 24 && Number(match[5]) < 60 && Number(match[6]) < 60))
    && (match[7] === undefined || (Number(match[7]) <= 14 && Number(match[8]) < 60
      && (Number(match[7]) < 14 || Number(match[8]) === 0)));
}

/** Read only the already-authorized original fact; never derive it from a modern plan. */
export function getLegacyEmploymentDate(record: HrLegacyArchiveRecord, canReadSensitive: boolean) {
  if (!canReadSensitive || record.recordType !== "employee_profile" || record.sourceTable !== "dbo.person.core_residue") return null;
  const fields = record.projection.legacyFields;
  if (!fields || typeof fields !== "object" || Array.isArray(fields) || !Object.hasOwn(fields, "formaldate")) return null;
  const value = (fields as Record<string, unknown>).formaldate;
  return { value, missing: value === null || value === "", recorded: isRecordedDate(value) };
}

export function LegacyEmploymentDate({ record, canReadSensitive }: {
  record: HrLegacyArchiveRecord;
  canReadSensitive: boolean;
}) {
  const fact = getLegacyEmploymentDate(record, canReadSensitive);
  if (!fact) return null;
  const { value, missing, recorded } = fact;
  return <section className="ds-scene-card" aria-label="原玉舟转正日期" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 12 }}>
    <h3>原玉舟转正日期</h3>
    <p>历史来源记录，只读保留原值；当前任职以已生效业务记录为准。</p>
    <dl>
      <dt>原始日期值</dt>
      <dd style={{ overflowWrap: "anywhere" }}>{missing ? "源记录未登记" : typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : "无法展示的原日期值"}</dd>
    </dl>
    {!missing && !recorded ? <p role="status">原日期值需核对</p> : null}
  </section>;
}
