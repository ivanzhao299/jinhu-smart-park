"use client";

import type { FileRecord } from "@jinhu/shared";

interface FilePreviewProps {
  file: FileRecord | null;
  objectUrl: string | null;
  onClose: () => void;
}

export function FilePreview({ file, objectUrl, onClose }: FilePreviewProps) {
  if (!file || !objectUrl) {
    return null;
  }

  const isImage = file.mimeType.startsWith("image/");
  const isPdf = file.mimeType === "application/pdf";
  const isVideo = file.mimeType === "video/mp4";

  return (
    <section className="login-panel file-preview-modal">
      <div className="task-item">
        <h2 className="panel-title">{file.originalName}</h2>
        <button type="button" onClick={onClose}>关闭</button>
      </div>
      {isImage ? <img className="file-preview-image" alt={file.originalName} src={objectUrl} /> : null}
      {isPdf ? <iframe className="file-preview-frame" src={objectUrl} title={file.originalName} /> : null}
      {isVideo ? <video className="file-preview-video" controls src={objectUrl} /> : null}
      {!isImage && !isPdf && !isVideo ? <p>当前文件类型暂不支持在线预览，请下载查看。</p> : null}
    </section>
  );
}
