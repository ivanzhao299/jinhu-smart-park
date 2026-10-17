"use client";

import { FileUp } from "lucide-react";
import { useId, useRef } from "react";

export interface LocalFilePickerProps {
  accept: string; buttonLabel: string; description: string;
  fileName?: string; disabled?: boolean; onSelect: (file: File | null) => void;
}

/** Shared local selection surface. The owning reader validates format/size. */
export function LocalFilePicker({ accept, buttonLabel, description, fileName, disabled, onSelect }: LocalFilePickerProps) {
  const id = useId(), input = useRef<HTMLInputElement>(null);
  return <div className="form-stack">
    <label className="ds-file-picker" htmlFor={id}>
      <input id={id} ref={input} className="sr-only" type="file" accept={accept} disabled={disabled} aria-label={buttonLabel}
        onChange={event => {
          const file = event.target.files?.[0];
          if (!disabled && file) onSelect(file);
          event.target.value = "";
        }} />
      <span className="ds-file-picker-button"><FileUp size={16} />{buttonLabel}</span>
      <span className={fileName ? "ds-file-picker-name" : "ds-file-picker-name ds-file-picker-empty"}>{fileName || "未选择文件"}</span>
    </label>
    <span className="ds-field-hint">{description}</span>
    {fileName ? <button className="ds-button ds-button-secondary" type="button" disabled={disabled} onClick={() => onSelect(null)}>清除选择</button> : null}
  </div>;
}
