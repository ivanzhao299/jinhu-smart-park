"use client";

import { FileUp, Upload } from "lucide-react";
import type { ChangeEvent } from "react";
import { useId, useMemo, useRef, useState } from "react";
import {
  formatFileSize,
  getFileUploadLimitForMime,
  resolveFileUploadPolicy,
  type FileRecord,
  type FileUploadPolicyKey
} from "@jinhu/shared";
import { apiFormRequest, createIdempotencyKey } from "../../lib/api-client";
import { getAccessToken } from "../../lib/authz";

interface FileUploaderProps {
  bizType: string;
  bizId?: string;
  uploadPath?: string;
  policyKey?: FileUploadPolicyKey;
  label?: string;
  helperText?: string;
  compact?: boolean;
  onUploaded: (file: FileRecord) => void;
}

export function FileUploader({
  bizType,
  bizId,
  uploadPath = "/files",
  policyKey,
  label,
  helperText,
  compact = false,
  onUploaded
}: FileUploaderProps) {
  const fileInputId = useId();
  const remarkInputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [message, setMessage] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [selectedFileMeta, setSelectedFileMeta] = useState("");
  const [remark, setRemark] = useState("");
  const [uploading, setUploading] = useState(false);
  const policy = useMemo(() => resolveFileUploadPolicy(policyKey ?? bizType), [bizType, policyKey]);
  const accept = policy.mimeTypes.join(",");
  const policyText = helperText ?? `${policy.mimeTypes.map((item) => item.split("/").pop()?.toUpperCase() ?? item).join(" / ")}，最大 ${formatFileSize(policy.maxSizeBytes)}`;

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setMessage("");
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      setSelectedFileName("");
      setSelectedFileMeta("");
      setSelectedFile(null);
      return;
    }

    if (!policy.mimeTypes.includes(file.type)) {
      event.target.value = "";
      setSelectedFileName("");
      setSelectedFileMeta("");
      setSelectedFile(null);
      setMessage(`${policy.label}不支持该文件类型`);
      return;
    }

    const sizeLimit = getFileUploadLimitForMime(policy, file.type);
    if (file.size > sizeLimit) {
      event.target.value = "";
      setSelectedFileName("");
      setSelectedFileMeta("");
      setSelectedFile(null);
      setMessage(`${policy.label}大小不能超过 ${formatFileSize(sizeLimit)}`);
      return;
    }

    setSelectedFile(file);
    setSelectedFileName(file.name);
    setSelectedFileMeta(`${file.type || "未知类型"} · ${formatFileSize(file.size)}`);
  }

  async function handleUpload() {
    setMessage("");
    if (!selectedFile) {
      setMessage("请先选择文件");
      return;
    }
    setUploading(true);
    const form = new FormData();
    form.set("file", selectedFile);
    form.set("biz_type", bizType);
    if (bizId) {
      form.set("biz_id", bizId);
    }
    if (remark.trim()) {
      form.set("remark", remark.trim());
    }

    try {
      const response = await apiFormRequest<FileRecord>(uploadPath, {
        method: "POST",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey("file-upload"),
        body: form
      });
      onUploaded(response.data);
      setSelectedFile(null);
      setSelectedFileName("");
      setSelectedFileMeta("");
      setRemark("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setMessage("上传成功");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "上传失败");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className={compact ? "file-uploader file-uploader-compact" : "form-stack"}>
      <div className="field">
        <span>{label ?? (compact ? policy.label : "选择文件")}</span>
        <label className="ds-file-picker" htmlFor={fileInputId}>
          <input ref={fileInputRef} className="sr-only" accept={accept} id={fileInputId} name="file" required type="file" onChange={handleFileChange} />
          <span className="ds-file-picker-button">
            <FileUp size={16} />
            选择文件
          </span>
          <span className={selectedFileName ? "ds-file-picker-name" : "ds-file-picker-name ds-file-picker-empty"}>
            {selectedFileName || "未选择文件"}
          </span>
        </label>
        <span className="ds-field-hint">{selectedFileMeta || policyText}</span>
      </div>
      <div className="field">
        <label htmlFor={remarkInputId}>备注</label>
        <input id={remarkInputId} name="remark" placeholder="可选" value={remark} onChange={(event) => setRemark(event.target.value)} />
      </div>
      <button className="primary-button" disabled={uploading} type="button" onClick={() => void handleUpload()}>
        <Upload size={16} />
        {uploading ? "上传中" : "上传"}
      </button>
      {message ? <span className="status-pill">{message}</span> : null}
    </div>
  );
}
