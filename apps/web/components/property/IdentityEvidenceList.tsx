"use client";

import {
  formatFileSize,
  SYSTEM_PERMISSIONS,
  type FileRecord,
  type IdentityEvidenceFileProjection
} from "@jinhu/shared";
import { useState } from "react";
import { API_PREFIX } from "../../lib/api-client";
import { useAuthUser } from "../../lib/auth-context";
import { getAccessToken } from "../../lib/authz";
import { hasPermission } from "../../lib/permissions";
import { handleUnauthorizedSessionReset } from "../../lib/session-reset";
import { FilePreview } from "../files/FilePreview";

export function IdentityEvidenceList({ files }: { files: IdentityEvidenceFileProjection[] }) {
  const user = useAuthUser();
  const canDownload = hasPermission(user, SYSTEM_PERMISSIONS.FILE_DOWNLOAD);
  const [message, setMessage] = useState("");
  const [previewFile, setPreviewFile] = useState<FileRecord | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  async function fetchFile(file: IdentityEvidenceFileProjection): Promise<Blob> {
    const token = getAccessToken();
    const response = await fetch(`${API_PREFIX}/files/${encodeURIComponent(file.fileId)}/download`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      if (response.status === 401) {
        await handleUnauthorizedSessionReset({
          path: `/files/${file.fileId}/download`,
          requestToken: token
        });
      }
      throw new Error("身份核验证据下载失败");
    }
    return response.blob();
  }

  async function preview(file: IdentityEvidenceFileProjection) {
    closePreview();
    const blob = await fetchFile(file);
    setPreviewFile(toFileRecord(file));
    setPreviewUrl(URL.createObjectURL(blob));
  }

  async function download(file: IdentityEvidenceFileProjection) {
    const blob = await fetchFile(file);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function closePreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewFile(null);
    setPreviewUrl(null);
  }

  if (!files.length) return <p>当前提交没有证据文件。</p>;
  return <>
    <ul>
      {files.map((file) => <li key={`${file.fileId}:${file.fileVersion}`}>
        <span>{file.fileName} · {formatFileSize(file.fileSize)}</span>{" "}
        {canDownload ? <>
          <button className="ds-button" onClick={() => void preview(file).catch((error: Error) => setMessage(error.message))} type="button">预览</button>{" "}
          <button className="ds-button" onClick={() => void download(file).catch((error: Error) => setMessage(error.message))} type="button">下载</button>
        </> : <span>无下载权限</span>}
      </li>)}
    </ul>
    {message ? <p aria-live="polite">{message}</p> : null}
    <FilePreview file={previewFile} objectUrl={previewUrl} onClose={closePreview} />
  </>;
}

function toFileRecord(file: IdentityEvidenceFileProjection): FileRecord {
  return {
    id: file.fileId,
    tenantId: "",
    parkId: "",
    fileCode: "",
    originalName: file.fileName,
    storedName: "",
    fileUrl: "",
    fileSize: String(file.fileSize),
    mimeType: file.mimeType,
    md5: "",
    bizType: "party_identity_evidence",
    bizId: null,
    storageType: "local",
    storageBucket: null,
    storagePath: "",
    isEncrypted: true,
    status: 1,
    remark: null,
    createTime: "",
    updateTime: ""
  };
}
