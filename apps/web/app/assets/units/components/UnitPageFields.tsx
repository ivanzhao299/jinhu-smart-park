import type { ReactNode } from "react";
import { dictStatusClass } from "../lib/unit-page-utils";
import type { DictItemRow, EnabledStatus } from "../types";

export function TextField({
  label,
  value,
  required,
  placeholder,
  onChange
}: {
  label: string;
  value: string;
  required?: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input value={value} required={required} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

export function NumberField({
  label,
  value,
  required,
  step,
  onChange
}: {
  label: string;
  value: string;
  required?: boolean;
  step: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input
        type="number"
        step={step}
        value={value}
        required={required}
        onFocus={(event) => event.target.select()}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

export function SelectField({
  label,
  value,
  required,
  onChange,
  children
}: {
  label: string;
  value: string;
  required?: boolean;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <select value={value} required={required} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </div>
  );
}

export function DictSelect({
  label,
  value,
  required,
  items = [],
  onChange
}: {
  label: string;
  value: string;
  required?: boolean;
  items?: DictItemRow[];
  onChange: (value: string) => void;
}) {
  return (
    <SelectField label={label} value={value} required={required} onChange={onChange}>
      <option value="">{required ? "请选择" : "全部"}</option>
      {items.map((item) => (
        <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>
      ))}
    </SelectField>
  );
}

export function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="task-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function DictBadge({ items = [], value }: { items?: DictItemRow[]; value: number }) {
  const item = items.find((option) => Number(option.itemValue) === value);
  return <span className="status-pill">{item?.itemLabel ?? value}</span>;
}

export function StringDictBadge({ items = [], value }: { items?: DictItemRow[]; value: string | null }) {
  const item = items.find((option) => option.itemValue === value);
  return <span className={`status-pill ${dictStatusClass(item?.tagType)}`}>{item?.itemLabel ?? value ?? "-"}</span>;
}

export function StatusBadge({ status }: { status: EnabledStatus }) {
  const option = status === 1
    ? { label: "启用", className: "status-success" }
    : { label: "停用", className: "status-danger" };
  return <span className={`status-pill ${option.className}`}>{option.label}</span>;
}
