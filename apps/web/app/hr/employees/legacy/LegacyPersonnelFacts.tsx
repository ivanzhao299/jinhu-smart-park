import type { HrLegacyArchiveRecord } from "../../../../lib/hr-api";
import styles from "./legacy-archive.module.css";

const sourceLabels = { oldaddr: "原玉舟籍贯", edulevel: "原玉舟学位" } as const;
type SourceKey = keyof typeof sourceLabels;

/** Read only the already-projected original source facts under the sensitive archive grant. */
export function getLegacyPersonnelFacts(record: HrLegacyArchiveRecord, canReadSensitive: boolean) {
  if (!canReadSensitive || record.sourceSystem !== "yuzhou-v10" || record.recordType !== "employee_profile"
    || record.sourceTable !== "dbo.person.core_residue") return [];

  const fields = record.projection.legacyFields;
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return [];
  return (Object.keys(sourceLabels) as SourceKey[]).flatMap((key) => {
    if (!Object.hasOwn(fields, key)) return [];
    const value = (fields as Record<string, unknown>)[key];
    return [{ key, label: sourceLabels[key], value, missing: value === null || value === "", scalar: ["string", "number", "boolean"].includes(typeof value) }];
  });
}

export function LegacyPersonnelFacts({ record, canReadSensitive }: {
  record: HrLegacyArchiveRecord;
  canReadSensitive: boolean;
}) {
  const facts = getLegacyPersonnelFacts(record, canReadSensitive);
  if (!facts.length) return null;
  return <section className={`${styles.personnelFacts} ds-scene-card`} aria-label="原玉舟人员资料">
    <div className={styles.personnelFactsIntro}>
    <h3>原玉舟人员资料</h3>
    <p>历史来源记录，只读保留原值；不会补入现代员工主档。</p>
    </div>
    <dl className="ds-kpi-grid">
      {facts.map(({ key, label, value, missing, scalar }) => <div className="ds-kpi-card" key={key}>
      <dt>{label}</dt>
      <dd style={{ overflowWrap: "anywhere" }}>{missing ? "源记录未登记" : scalar ? String(value) : "原值无法展示"}</dd>
      </div>)}
    </dl>
  </section>;
}
