"use client";

import { Download, Eye, X } from "lucide-react";
import { formatFileSize, SYSTEM_PERMISSIONS, type FileRecord } from "@jinhu/shared";
import { useEffect, useState } from "react";
import { API_PREFIX } from "../../lib/api-client";
import { getAccessToken } from "../../lib/authz";
import { handleUnauthorizedSessionReset } from "../../lib/session-reset";
import { PermissionButton } from "../permission-button";
import { FilePreview } from "./FilePreview";

interface PendingAttachmentListProps {
  files: FileRecord[];
  onRemove?(fileId: string): void;
}

export function PendingAttachmentList({ files, onRemove }: PendingAttachmentListProps) {
  const [message, setMessage] = useState("");
  const [previewFile, setPreviewFile] = useState<FileRecord | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  async function fetchFileBlob(file: FileRecord): Promise<Blob> {
    const token = getAccessToken();
    const response = await fetch(`${API_PREFIX}/files/${file.id}/download`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      if (response.status === 401) {
        await handleUnauthorizedSessionReset({
          path: `/files/${file.id}/download`,
          requestToken: token
        });
      }
      throw new Error("文件下载失败");
    }
    return response.blob();
  }

  async function preview(file: FileRecord) {
    const blob = await fetchFileBlob(file);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewFile(file);
    setPreviewUrl(URL.createObjectURL(blob));
  }

  async function download(file: FileRecord) {
    const blob = await fetchFileBlob(file);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.originalName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function closePreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewFile(null);
    setPreviewUrl(null);
  }

  if (!files.length) return null;

  return (
    <div className="attachment-compact-list">
      {files.map((file) => (
        <article className="attachment-compact-item" key={file.id}>
          <div className="attachment-compact-main">
            <strong>{file.originalName}</strong>
            <span>{file.mimeType} · {formatFileSize(Number(file.fileSize))}</span>
          </div>
          <span className="attachment-compact-actions">
            <PermissionButton permission={SYSTEM_PERMISSIONS.FILE_DOWNLOAD} type="button" title="预览" onClick={() => void preview(file).catch((error: Error) => setMessage(error.message))}><Eye size={16} /></PermissionButton>
            <PermissionButton permission={SYSTEM_PERMISSIONS.FILE_DOWNLOAD} type="button" title="下载" onClick={() => void download(file).catch((error: Error) => setMessage(error.message))}><Download size={16} /></PermissionButton>
            {onRemove ? <button type="button" title="从本次提交移除" onClick={() => onRemove(file.id)}><X size={16} /></button> : null}
          </span>
        </article>
      ))}
      {message ? <p className="status-pill">{message}</p> : null}
      <FilePreview file={previewFile} objectUrl={previewUrl} onClose={closePreview} />
    </div>
  );
}
