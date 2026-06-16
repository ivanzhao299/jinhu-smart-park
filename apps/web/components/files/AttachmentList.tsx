"use client";

import { Download, Eye, Search, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { SYSTEM_PERMISSIONS, type FileRecord, type PaginatedResult } from "@jinhu/shared";
import { API_PREFIX, apiRequest, createIdempotencyKey } from "../../lib/api-client";
import { clearSession } from "../../lib/auth";
import { getAccessToken } from "../../lib/authz";
import { PermissionButton } from "../permission-button";
import { FilePreview } from "./FilePreview";

interface AttachmentListProps {
  bizType: string;
  bizId?: string;
  refreshKey?: number;
}

const emptyPage: PaginatedResult<FileRecord> = { items: [], page: 1, page_size: 20, total: 0 };

export function AttachmentList({ bizType, bizId, refreshKey = 0 }: AttachmentListProps) {
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
    const response = await fetch(`${API_PREFIX}/files/${file.id}/download`, {
      headers: { Authorization: `Bearer ${getAccessToken()}` }
    });
    if (!response.ok) {
      if (response.status === 401) {
        clearSession();
        window.location.href = "/login";
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
    <section className="work-panel">
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
      <div className="task-item"><span>共 {data.total} 条，第 {data.page} 页</span><span><button type="button" onClick={() => void load(Math.max(1, data.page - 1))}>上一页</button><button type="button" onClick={() => void load(data.page + 1)}>下一页</button></span></div>
      {message ? <p className="status-pill">{message}</p> : null}
      <FilePreview file={previewFile} objectUrl={previewUrl} onClose={closePreview} />
    </section>
  );
}
