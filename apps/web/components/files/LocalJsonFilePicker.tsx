"use client";

import { LocalFilePicker } from "./LocalFilePicker";
import type { LocalJsonFilePolicy } from "./local-json-file";

interface LocalJsonFilePickerProps {
  policy: LocalJsonFilePolicy;
  fileName?: string;
  disabled?: boolean;
  onSelect: (file: File | null) => void;
}

/** Local selection only: no upload endpoint, attachment record or storage. */
export function LocalJsonFilePicker({ policy, fileName, disabled, onSelect }: LocalJsonFilePickerProps) {
  return <LocalFilePicker accept=".json,application/json,text/json" buttonLabel="选择数据包"
    description={`JSON · 最大 ${policy.maxBytes / 1024 / 1024} MiB · 选择文件后需手动预览`}
    fileName={fileName} disabled={disabled} onSelect={onSelect} />;
}
