"use client";

import { Camera } from "lucide-react";
import { useState } from "react";
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

  async function upload(file: File | null) {
    if (!file) return;
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
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "上传失败");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className={styles.inlineUploader}>
      <label className="secondary-button">
        <Camera size={16} />
        {uploading ? "上传中" : "上传照片"}
        <input className={styles.fileInput} accept="image/*" type="file" onChange={(event) => void upload(event.target.files?.[0] ?? null)} />
      </label>
      {message ? <span className="status-pill">{message}</span> : null}
    </div>
  );
}
