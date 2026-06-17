"use client";

import { Camera } from "lucide-react";
import type { ChangeEvent } from "react";
import { useMemo, useState } from "react";
import { formatFileSize, getFileUploadLimitForMime, resolveFileUploadPolicy } from "@jinhu/shared";
import type { UploadedFile } from "./terminal-types";
import { apiFormRequest, createIdempotencyKey } from "../../lib/api-client";
import { getAccessToken } from "../../lib/authz";
import styles from "./OperationsTerminal.module.css";

export function OperationPhotoUploader({
  bizType,
  bizId,
  onUploaded
}: {
  bizType: string;
  bizId?: string;
  onUploaded: (file: UploadedFile) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const policy = useMemo(() => resolveFileUploadPolicy("image"), []);

  async function upload(file: File | null, input?: HTMLInputElement) {
    if (!file) return;
    if (!policy.mimeTypes.includes(file.type)) {
      setMessage("照片不支持该文件类型");
      if (input) input.value = "";
      return;
    }
    const sizeLimit = getFileUploadLimitForMime(policy, file.type);
    if (file.size > sizeLimit) {
      setMessage(`照片大小不能超过 ${formatFileSize(sizeLimit)}`);
      if (input) input.value = "";
      return;
    }
    setUploading(true);
    setMessage("");
    const form = new FormData();
    form.set("file", file);
    form.set("biz_type", bizType);
    if (bizId) {
      form.set("biz_id", bizId);
    }
    try {
      const response = await apiFormRequest<UploadedFile>("/files", {
        method: "POST",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey("terminal-file-upload"),
        body: form
      });
      onUploaded(response.data);
      setMessage("上传成功");
      if (input) input.value = "";
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "上传失败");
    } finally {
      setUploading(false);
    }
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    void upload(event.target.files?.[0] ?? null, event.target);
  }

  return (
    <div className={styles.inlineUploader}>
      <label className="secondary-button">
        <Camera size={16} />
        {uploading ? "上传中" : "上传照片"}
        <input className={styles.fileInput} accept={policy.mimeTypes.join(",")} type="file" onChange={handleChange} />
      </label>
      {message ? <span className="status-pill">{message}</span> : null}
    </div>
  );
}
