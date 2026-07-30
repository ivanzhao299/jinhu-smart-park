"use client";

import {
  SYSTEM_PERMISSIONS,
  type FileRecord,
  type PropertyWorkbenchFileRef
} from "@jinhu/shared";
import { useState } from "react";
import { FilePreview } from "../../../components/files/FilePreview";
import { API_PREFIX, apiRequest } from "../../../lib/api-client";
import { getAccessToken } from "../../../lib/authz";

interface HousingEvidenceListProps {
  canDownload: boolean;
  canRead: boolean;
  files: readonly PropertyWorkbenchFileRef[];
  label: string;
}

async function fetchBlob(fileId: string): Promise<Blob> {
  const response = await fetch(`${API_PREFIX}/files/${encodeURIComponent(fileId)}/download`, {
    headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` }
  });
  if (!response.ok) throw new Error("文件下载失败");
  return response.blob();
}

export function HousingEvidenceList({
  canDownload,
  canRead,
  files,
  label
}: HousingEvidenceListProps) {
  const [previewFile, setPreviewFile] = useState<FileRecord | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  if (!canRead) return null;

  async function preview(file: PropertyWorkbenchFileRef) {
    if (!canDownload) return;
    const [record, blob] = await Promise.all([
      apiRequest<FileRecord>(`/files/${encodeURIComponent(file.id)}`, {
        token: getAccessToken()
      }),
      fetchBlob(file.id)
    ]);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewFile(record.data);
    setPreviewUrl(URL.createObjectURL(blob));
  }

  async function download(file: PropertyWorkbenchFileRef) {
    if (!canDownload) return;
    const blob = await fetchBlob(file.id);
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

  return (
    <section aria-label={label}>
      {files.map((file) => (
        <article className="ds-mobile-record" key={file.id}>
          <strong>{file.originalName}</strong>
          <span>{file.mimeType} · {file.fileSize} B</span>
          {canDownload ? (
            <span>
              <button className="ds-button" onClick={() => void preview(file).catch(
                (error: Error) => setMessage(error.message)
              )} type="button">预览</button>
              <button className="ds-button" onClick={() => void download(file).catch(
                (error: Error) => setMessage(error.message)
              )} type="button">下载</button>
            </span>
          ) : (
            <span>缺少 {SYSTEM_PERMISSIONS.FILE_DOWNLOAD} 权限</span>
          )}
        </article>
      ))}
      {!files.length ? <p>暂无证据附件。</p> : null}
      {message ? <p aria-live="polite">{message}</p> : null}
      <FilePreview file={previewFile} objectUrl={previewUrl} onClose={closePreview} />
    </section>
  );
}
