import type { ReactNode } from "react";
import type { DictMap } from "./terminal-types";
import styles from "./OperationsTerminal.module.css";

export function TerminalField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function TerminalDictSelect({
  label,
  value,
  dictCode,
  dicts,
  required = false,
  onChange
}: {
  label: string;
  value: string;
  dictCode: string;
  dicts: DictMap;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  const items = dicts[dictCode] ?? [];
  return (
    <TerminalField label={label}>
      <select required={required} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{required ? "请选择" : "不指定"}</option>
        {items.map((item) => <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>)}
      </select>
    </TerminalField>
  );
}

export function TerminalSelectField({
  label,
  value,
  options,
  onChange,
  required = false
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <TerminalField label={label}>
      <select required={required} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{required ? "请选择" : "不指定"}</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </TerminalField>
  );
}

export function AttachmentCounter({ count }: { count: number }) {
  return <span className="status-pill">{count > 0 ? `已上传 ${count} 个附件` : "未上传附件"}</span>;
}
