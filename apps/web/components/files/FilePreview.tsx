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
    <section className="login-panel" style={{ position: "fixed", inset: 24, zIndex: 20, width: "auto", overflow: "auto" }}>
      <div className="task-item">
        <h2 className="panel-title">{file.originalName}</h2>
        <button type="button" onClick={onClose}>关闭</button>
      </div>
      {isImage ? <img alt={file.originalName} src={objectUrl} style={{ maxWidth: "100%" }} /> : null}
      {isPdf ? <iframe src={objectUrl} title={file.originalName} style={{ width: "100%", minHeight: 640, border: 0 }} /> : null}
      {isVideo ? <video controls src={objectUrl} style={{ width: "100%" }} /> : null}
      {!isImage && !isPdf && !isVideo ? <p>当前文件类型暂不支持在线预览，请下载查看。</p> : null}
    </section>
  );
}
