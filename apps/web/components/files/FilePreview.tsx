"use client";

import { Drawer, DrawerFooter, DrawerHeader } from "@jinhu/ui";
import { Download, X } from "lucide-react";
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
    <Drawer size="xl" onClose={onClose} aria-label={file.originalName}>
      <DrawerHeader
        eyebrow="文件中心"
        title={file.originalName}
        description="在线预览文件内容，支持图片、PDF 与视频。"
        onClose={onClose}
        closeIcon={<X size={18} />}
      />
      <div className="file-preview-body">
        {isImage ? <img className="file-preview-image" alt={file.originalName} src={objectUrl} /> : null}
        {isPdf ? <iframe className="file-preview-frame" src={objectUrl} title={file.originalName} /> : null}
        {isVideo ? <video className="file-preview-video" controls src={objectUrl} /> : null}
        {!isImage && !isPdf && !isVideo ? <p className="muted-text">当前文件类型暂不支持在线预览，请下载查看。</p> : null}
      </div>
      <DrawerFooter>
        <button className="secondary-button" type="button" onClick={onClose}>关闭</button>
        <a className="primary-button" href={objectUrl} download={file.originalName}>
          <Download size={16} />
          下载
        </a>
      </DrawerFooter>
    </Drawer>
  );
}
