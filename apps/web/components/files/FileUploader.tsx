"use client";

import { Upload } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import type { FileRecord } from "@jinhu/shared";
import { apiFormRequest, createIdempotencyKey } from "../../lib/api-client";
import { getAccessToken } from "../../lib/authz";

interface FileUploaderProps {
  bizType: string;
  bizId?: string;
  onUploaded: (file: FileRecord) => void;
}

export function FileUploader({ bizType, bizId, onUploaded }: FileUploaderProps) {
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setUploading(true);
    const form = new FormData(event.currentTarget);
    form.set("biz_type", bizType);
    if (bizId) {
      form.set("biz_id", bizId);
    }

    try {
      const response = await apiFormRequest<FileRecord>("/files", {
        method: "POST",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey("file-upload"),
        body: form
      });
      onUploaded(response.data);
      event.currentTarget.reset();
      setMessage("上传成功");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "上传失败");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form className="form-stack" onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="file">选择文件</label>
        <input id="file" name="file" required type="file" />
      </div>
      <div className="field">
        <label htmlFor="remark">备注</label>
        <input id="remark" name="remark" placeholder="可选" />
      </div>
      <button className="primary-button" disabled={uploading} type="submit">
        <Upload size={16} />
        {uploading ? "上传中" : "上传"}
      </button>
      {message ? <span className="status-pill">{message}</span> : null}
    </form>
  );
}
