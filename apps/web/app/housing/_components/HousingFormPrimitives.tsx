import type { ReactNode } from "react";
import styles from "./HousingWorkbench.module.css";

export function ActionDetails({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details>
      <summary className="ds-button">{label}</summary>
      <div className={styles.inlineAction}>{children}</div>
    </details>
  );
}

export function MutationFeedback({ message }: { message: string }) {
  return message ? <p aria-live="polite">{message}</p> : null;
}

export function MoneyField({
  label,
  name,
  max,
  positive = false,
  required = true
}: {
  label: string;
  name: string;
  max?: string;
  positive?: boolean;
  required?: boolean;
}) {
  return (
    <label>{label}
      <input inputMode="decimal" max={max} min={positive ? "0.01" : "0"} name={name} onFocus={(event) => event.target.select()} required={required} step="0.01" type="number" />
    </label>
  );
}

export function ReadingField({ label, name }: { label: string; name: string }) {
  return (
    <label>{label}
      <input inputMode="decimal" min="0" name={name} onFocus={(event) => event.target.select()} required step="0.000001" type="number" />
    </label>
  );
}
