"use client";
import { useEffect, useRef, useState } from "react";
import { ApiError } from "../../../../lib/api-client";
import { getAccessToken } from "../../../../lib/authz";
import { hrApi, type HrEmployeeProfile } from "../../../../lib/hr-api";
import styles from "./hr-employee-profile-summary.module.css";
import editorStyles from "./hr-custom-value-editor.module.css";

type Field = NonNullable<HrEmployeeProfile["customFields"]>[number];
type Props = { employeeId: string; fields: Field[]; captureScope: () => () => boolean;
  onSaved: (field: Field) => void; onReload: () => void };

function CustomValueForm({ employeeId, field, captureScope, onSaved, onReload }: Omit<Props, "fields"> & { field: Field }) {
  const [value, setValue] = useState(field.value ?? "");
  const [clear, setClear] = useState(field.value === null);
  const [busy, setBusy] = useState(false), [conflict, setConflict] = useState(false), [message, setMessage] = useState("");
  const mounted = useRef(true), saving = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const admitted = Boolean(field.definitionId) && Number.isInteger(field.version) && field.version! >= 0;
  const label = field.label || field.code;
  async function save() {
    if (!admitted || busy || saving.current || conflict) return;
    const current = captureScope(); saving.current = true; setBusy(true); setMessage("");
    const submitted = clear ? null : value;
    try {
      const result = await hrApi.updateCustomValue(employeeId, field.definitionId!, { expectedVersion: field.version!, value: submitted }, getAccessToken());
      if (!mounted.current || !current()) return;
      if (result.definitionId !== field.definitionId || result.version !== field.version! + 1 || result.valueStatus !== (submitted === null ? "null" : "valid")) throw new Error("扩展字段保存响应无效");
      onSaved({ ...field, value: submitted, sourceValid: true, version: result.version });
      setMessage("已保存");
    } catch (error) {
      if (!mounted.current || !current()) return;
      if (error instanceof ApiError && error.status === 409) { setConflict(true); setMessage("此字段已被其他操作更新，草稿已保留。请重新加载档案后核对。"); }
      else { setConflict(true); setMessage("保存未确认，草稿已保留。请重新加载档案核对后再操作。"); }
    } finally { saving.current = false; if (mounted.current && current()) setBusy(false); }
  }
  return <form className={`ds-mobile-record ${styles.group}`} aria-label={`维护${label}`} onSubmit={event => { event.preventDefault(); void save(); }}>
    <label className="form-field"><span>{label}</span>
      {field.valueType === "boolean" ? <select value={value} disabled={!admitted || clear || busy || conflict} onChange={event => setValue(event.target.value)}>
        <option value="">请选择</option><option value="true">是</option><option value="false">否</option>
      </select> : <input value={value} type={field.valueType === "date" ? "date" : field.valueType === "numeric" ? "number" : "text"}
        step={field.valueType === "numeric" ? "0.00000001" : undefined} maxLength={field.valueType === "text" ? 4000 : undefined}
        disabled={!admitted || clear || busy || conflict} onChange={event => setValue(event.target.value)} />}
    </label>
    <label className={editorStyles.clearOption}><input type="checkbox" checked={clear} disabled={!admitted || busy || conflict} onChange={event => setClear(event.target.checked)} />清空此字段</label>
    {!field.sourceValid ? <p>原值类型待校正，请核对后修改。</p> : null}
    {!admitted ? <p>字段维护信息尚未加载，请重新加载档案。</p> : null}
    <button className="ds-button ds-button-primary" disabled={!admitted || busy || conflict} type="submit">{busy ? "保存中…" : "保存字段"}</button>
    {message ? <p role="status">{message}</p> : null}
    {message && message !== "已保存" ? <button className="ds-button ds-button-secondary" type="button" onClick={onReload}>重新加载档案</button> : null}
  </form>;
}

export function HrCustomValueEditor(props: Props) {
  if (!props.fields.length) return null;
  return <section className={`ds-panel ${editorStyles.panel}`} aria-label="维护扩展档案"><h3>维护扩展档案</h3>
    <p>按字段类型维护资料；勾选清空并保存后，该字段不再显示原值。</p>
    <div className={`ds-mobile-record-list ${styles.groups}`}>{props.fields.map(field => <CustomValueForm key={`${field.definitionId ?? field.code}:${field.version ?? "unknown"}`} employeeId={props.employeeId} field={field} captureScope={props.captureScope} onSaved={props.onSaved} onReload={props.onReload} />)}</div>
  </section>;
}
