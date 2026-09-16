import type { HrEmployee } from "../../../lib/hr-api";

type LegacyState = Pick<HrEmployee, "legacyJobstateCode" | "legacyJobstateName">;

/** Read-only source facts from the already-authorized employee projection. */
export function EmployeeLegacyState({ employee }: { employee: LegacyState }) {
  const code = employee.legacyJobstateCode?.trim() || null;
  const name = employee.legacyJobstateName?.trim() || null;
  return <section className="ds-panel" aria-label="玉舟原任职状态">
    <h3>玉舟原任职状态</h3>
    <p>保留迁移来源中的历史状态，不代表当前任职状态；此处只读。</p>
    <dl className="ds-mobile-record" style={{ overflowWrap: "anywhere" }}>
      <dt>旧状态代码</dt><dd>{code ?? "未保留"}</dd>
      <dt>旧状态名称</dt><dd>{name ?? (code ? "未识别名称，保留原代码" : "未保留")}</dd>
    </dl>
  </section>;
}
