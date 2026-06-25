"use client";

import { Download, Eye, Search, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { formatFileSize, SYSTEM_PERMISSIONS, type FileRecord, type PaginatedResult } from "@jinhu/shared";
import { API_PREFIX, apiRequest, createIdempotencyKey } from "../../lib/api-client";
import { getAccessToken } from "../../lib/authz";
import { handleUnauthorizedSessionReset } from "../../lib/session-reset";
import { PermissionButton } from "../permission-button";
import { FilePreview } from "./FilePreview";

interface AttachmentListProps {
  bizType: string;
  bizId?: string;
  compact?: boolean;
  refreshKey?: number;
}

const emptyPage: PaginatedResult<FileRecord> = { items: [], page: 1, page_size: 20, total: 0 };

export function AttachmentList({ bizType, bizId, compact = false, refreshKey = 0 }: AttachmentListProps) {
  const [data, setData] = useState(emptyPage);
  const [keyword, setKeyword] = useState("");
  const [message, setMessage] = useState("");
  const [previewFile, setPreviewFile] = useState<FileRecord | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  async function load(page = 1) {
    const params = new URLSearchParams({ page: String(page), page_size: "20", biz_type: bizType });
    if (bizId) params.set("biz_id", bizId);
    if (keyword) params.set("keyword", keyword);
    const response = await apiRequest<PaginatedResult<FileRecord>>(`/files?${params.toString()}`, {
      token: getAccessToken()
    });
    setData(response.data);
  }

  useEffect(() => {
    void load().catch((error: Error) => setMessage(error.message));
  }, [bizType, bizId, refreshKey]);

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
      setMessage("文件下载失败");
      throw new Error("文件下载失败");
    }
    return response.blob();
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

  async function preview(file: FileRecord) {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    const blob = await fetchFileBlob(file);
    setPreviewFile(file);
    setPreviewUrl(URL.createObjectURL(blob));
  }

  async function remove(file: FileRecord) {
    if (!window.confirm(`确认删除附件：${file.originalName}？`)) {
      return;
    }
    await apiRequest<{ id: string }>(`/files/${file.id}`, {
      method: "DELETE",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("file-delete")
    });
    await load(data.page);
  }

  function closePreview() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewFile(null);
    setPreviewUrl(null);
  }

  return (
    <section className={compact ? "attachment-list attachment-list-compact" : "work-panel"}>
      {compact ? (
        <>
          <div className="attachment-list-summary">
            <strong>已上传平面图</strong>
            <span>{data.total} 个文件</span>
          </div>
          {data.items.length > 0 ? (
            <div className="attachment-compact-list">
              {data.items.map((item) => (
                <article className="attachment-compact-item" key={item.id}>
                  <CompactAttachmentThumb file={item} fetchFileBlob={fetchFileBlob} onPreview={() => void preview(item).catch((error: Error) => setMessage(error.message))} />
                  <div className="attachment-compact-main">
                    <strong>{item.originalName}</strong>
                    <span>{item.mimeType} · {formatFileSize(Number(item.fileSize))}</span>
                  </div>
                  <span className="attachment-compact-actions">
                    <PermissionButton permission={SYSTEM_PERMISSIONS.FILE_DOWNLOAD} type="button" onClick={() => void preview(item).catch((error: Error) => setMessage(error.message))}>预览</PermissionButton>
                    <PermissionButton permission={SYSTEM_PERMISSIONS.FILE_DOWNLOAD} type="button" onClick={() => void download(item).catch((error: Error) => setMessage(error.message))}>下载</PermissionButton>
                    <PermissionButton permission={SYSTEM_PERMISSIONS.FILE_DELETE} type="button" onClick={() => void remove(item).catch((error: Error) => setMessage(error.message))}>删除</PermissionButton>
                  </span>
                </article>
              ))}
            </div>
          ) : (
            <p className="attachment-empty">暂无平面图文件</p>
          )}
          {message ? <p className="status-pill">{message}</p> : null}
          <FilePreview file={previewFile} objectUrl={previewUrl} onClose={closePreview} />
        </>
      ) : (
        <>
      <form className="form-stack" onSubmit={(event) => { event.preventDefault(); void load(); }}>
        <div className="field">
          <label htmlFor="fileKeyword">附件关键词</label>
          <input id="fileKeyword" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="文件名" />
        </div>
        <button className="primary-button" type="submit"><Search size={16} />查询附件</button>
      </form>
      <h2 className="panel-title">附件列表</h2>
      <table className="attachment-table ds-data-table">
        <thead><tr><th>文件编号</th><th>原始文件名</th><th>类型</th><th>大小</th><th>状态</th><th>操作</th></tr></thead>
        <tbody>
          {data.items.map((item) => (
            <tr key={item.id}>
              <td data-label="文件编号">{item.fileCode}</td>
              <td data-label="原始文件名">{item.originalName}</td>
              <td data-label="类型">{item.mimeType}</td>
              <td data-label="大小">{item.fileSize} B</td>
              <td data-label="状态"><span className="status-pill">{item.status === 1 ? "正常" : "停用"}</span></td>
              <td data-label="操作">
                <span className="data-table-actions">
                  <PermissionButton permission={SYSTEM_PERMISSIONS.FILE_DOWNLOAD} type="button" title="预览" onClick={() => void preview(item).catch((error: Error) => setMessage(error.message))}><Eye size={16} /></PermissionButton>
                  <PermissionButton permission={SYSTEM_PERMISSIONS.FILE_DOWNLOAD} type="button" title="下载" onClick={() => void download(item).catch((error: Error) => setMessage(error.message))}><Download size={16} /></PermissionButton>
                  <PermissionButton permission={SYSTEM_PERMISSIONS.FILE_DELETE} type="button" title="删除" onClick={() => void remove(item).catch((error: Error) => setMessage(error.message))}><Trash2 size={16} /></PermissionButton>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="task-item"><span>共 {data.total} 条，第 {data.page} 页</span><span className="pagination-actions"><button className="pagination-button" type="button" onClick={() => void load(Math.max(1, data.page - 1))}>上一页</button><button className="pagination-button" type="button" onClick={() => void load(data.page + 1)}>下一页</button></span></div>
      {message ? <p className="status-pill">{message}</p> : null}
      <FilePreview file={previewFile} objectUrl={previewUrl} onClose={closePreview} />
        </>
      )}
    </section>
  );
}

function CompactAttachmentThumb({
  file,
  fetchFileBlob,
  onPreview
}: {
  file: FileRecord;
  fetchFileBlob: (file: FileRecord) => Promise<Blob>;
  onPreview: () => void;
}) {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const isImage = file.mimeType.startsWith("image/");

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    if (!isImage) {
      setThumbnailUrl(null);
      return undefined;
    }

    void fetchFileBlob(file)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setThumbnailUrl(objectUrl);
      })
      .catch(() => {
        if (active) setThumbnailUrl(null);
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file.id, isImage]);

  const suffix = file.originalName.includes(".") ? file.originalName.split(".").pop()?.slice(0, 4).toUpperCase() : "FILE";

  if (thumbnailUrl) {
    return (
      <button className="attachment-thumb attachment-thumb-image" aria-label={`预览 ${file.originalName}`} type="button" onClick={onPreview}>
        <img alt={file.originalName} src={thumbnailUrl} />
      </button>
    );
  }

  return (
    <button className="attachment-thumb" aria-label={`预览 ${file.originalName}`} type="button" onClick={onPreview}>
      {suffix}
    </button>
  );
}
