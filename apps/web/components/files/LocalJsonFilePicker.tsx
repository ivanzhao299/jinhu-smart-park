"use client";

import { FileUp } from "lucide-react";
import { useId, useRef } from "react";
import type { LocalJsonFilePolicy } from "./local-json-file";

interface LocalJsonFilePickerProps {
  policy: LocalJsonFilePolicy;
  fileName?: string;
  disabled?: boolean;
  onSelect: (file: File | null) => void;
}

/** Local selection only: no upload endpoint, attachment record or storage. */
export function LocalJsonFilePicker({ policy, fileName, disabled, onSelect }: LocalJsonFilePickerProps) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  return <div className="form-stack">
    <label className="ds-file-picker" htmlFor={id}>
      <input id={id} ref={input} className="sr-only" type="file" accept=".json,application/json,text/json" disabled={disabled}
        onChange={event => {
          const file = event.target.files?.[0];
          if (file) onSelect(file);
          event.target.value = "";
        }} />
      <span className="ds-file-picker-button"><FileUp size={16} />选择数据包</span>
      <span className={fileName ? "ds-file-picker-name" : "ds-file-picker-name ds-file-picker-empty"}>{fileName || "未选择文件"}</span>
    </label>
    <span className="ds-field-hint">JSON · 最大 {policy.maxBytes / 1024 / 1024} MiB · 选择文件后需手动预览</span>
    {fileName ? <button className="ds-button" type="button" disabled={disabled} onClick={() => onSelect(null)}>清除选择</button> : null}
  </div>;
}
