"use client";

import { DataTable } from "@jinhu/ui";
import { Camera, RefreshCw, Trash2 } from "lucide-react";
import { SYSTEM_PERMISSIONS, type PaginatedResult } from "@jinhu/shared";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { PermissionButton } from "../auth/PermissionButton";
import { apiRequest, createIdempotencyKey } from "../../lib/api-client";
import { getAccessToken } from "../../lib/authz";

type VideoEvidenceSourceType = "INSPECTION" | "HAZARD" | "MANUAL";
type VideoEvidenceType = "SNAPSHOT" | "VIDEO_CLIP" | "PREVIEW_LINK";

interface VideoEvidenceRow {
  id: string;
  cameraId: string;
  sourceType: VideoEvidenceSourceType;
  sourceId: string | null;
  evidenceType: VideoEvidenceType;
  evidenceUrl: string | null;
  snapshotUrl: string | null;
  clipStartTime: string | null;
  clipEndTime: string | null;
  capturedAt: string | null;
  capturedBy: string | null;
  description: string | null;
  status: string;
  createTime?: string | null;
  camera?: {
    cameraCode?: string | null;
    cameraName?: string | null;
  } | null;
}

interface EvidenceForm {
  cameraId: string;
  evidenceType: VideoEvidenceType;
  evidenceUrl: string;
  snapshotUrl: string;
  description: string;
}

interface VideoEvidencePanelProps {
  cameraId?: string | null;
  sourceType: VideoEvidenceSourceType;
  sourceId?: string | null;
  canCreate?: boolean;
  title?: string;
}

const emptyForm: EvidenceForm = {
  cameraId: "",
  evidenceType: "SNAPSHOT",
  evidenceUrl: "",
  snapshotUrl: "",
  description: ""
};

export function VideoEvidencePanel({
  cameraId,
  sourceType,
  sourceId,
  canCreate = true,
  title = "视频证据"
}: VideoEvidencePanelProps) {
  const [items, setItems] = useState<VideoEvidenceRow[]>([]);
  const [form, setForm] = useState<EvidenceForm>({ ...emptyForm, cameraId: cameraId ?? "" });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const endpoint = useMemo(() => buildEvidenceEndpoint(sourceType, sourceId, cameraId), [cameraId, sourceId, sourceType]);
  const canUseCreate = canCreate && Boolean(endpoint.create);

  const loadItems = useCallback(async () => {
    if (!endpoint.list) {
      setItems([]);
      return;
    }
    const token = getAccessToken();
    if (!token) return;
    setLoading(true);
    setMessage("");
    try {
      const response = await apiRequest<VideoEvidenceRow[] | PaginatedResult<VideoEvidenceRow>>(endpoint.list, { token });
      setItems(normalizeRows(response.data));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载视频证据失败");
    } finally {
      setLoading(false);
    }
  }, [endpoint.list]);

  useEffect(() => {
    setForm((current) => ({ ...current, cameraId: cameraId ?? current.cameraId }));
  }, [cameraId]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  async function submitEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!endpoint.create) {
      setMessage("当前对象不支持新增视频证据");
      return;
    }
    const token = getAccessToken();
    if (!token) return;
    const currentCameraId = form.cameraId.trim();
    if (!currentCameraId) {
      setMessage("请填写摄像头 ID");
      return;
    }
    const body = {
      camera_id: currentCameraId,
      evidence_type: form.evidenceType,
      evidence_url: form.evidenceUrl.trim() || undefined,
      snapshot_url: form.snapshotUrl.trim() || form.evidenceUrl.trim() || undefined,
      description: form.description.trim() || undefined
    };
    try {
      await apiRequest<VideoEvidenceRow>(endpoint.create, {
        method: "POST",
        token,
        idempotencyKey: createIdempotencyKey("video-evidence"),
        body
      });
      setForm({ ...emptyForm, cameraId: cameraId ?? currentCameraId });
      await loadItems();
      setMessage("视频证据已保存");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存视频证据失败");
    }
  }

  async function captureSnapshot() {
    const token = getAccessToken();
    if (!token || !cameraId) return;
    try {
      await apiRequest<VideoEvidenceRow>(`/video-security/cameras/${cameraId}/capture-snapshot`, {
        method: "POST",
        token,
        idempotencyKey: createIdempotencyKey("video-snapshot"),
        body: {
          source_type: sourceType,
          source_id: sourceId || undefined,
          description: form.description.trim() || "摄像头截图取证"
        }
      });
      await loadItems();
      setMessage("截图证据已保存");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "截图取证失败");
    }
  }

  async function deleteEvidence(id: string) {
    const token = getAccessToken();
    if (!token) return;
    try {
      await apiRequest<{ id: string }>(`/video-security/evidences/${id}`, {
        method: "DELETE",
        token,
        idempotencyKey: createIdempotencyKey("video-evidence-delete")
      });
      await loadItems();
      setMessage("视频证据已删除");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除视频证据失败");
    }
  }

  return (
    <section className="work-panel">
      <div className="task-item">
        <div>
          <h3 className="panel-title">{title}</h3>
          <p className="muted-text">关联摄像头、截图取证和历史证据，取证操作会写入审计日志。</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => void loadItems()}>
          <RefreshCw size={16} />
          刷新
        </button>
      </div>
      {message ? <p className="form-error">{message}</p> : null}
      {canUseCreate ? (
        <form className="form-stack" onSubmit={(event) => void submitEvidence(event)}>
          <div className="drawer-form-grid">
            <label className="field">
              <span>摄像头 ID</span>
              <input value={form.cameraId} disabled={Boolean(cameraId)} onChange={(event) => setFormValue(setForm, "cameraId", event.target.value)} />
            </label>
            <label className="field">
              <span>证据类型</span>
              <select value={form.evidenceType} onChange={(event) => setFormValue(setForm, "evidenceType", event.target.value as VideoEvidenceType)}>
                <option value="SNAPSHOT">截图</option>
                <option value="VIDEO_CLIP">视频片段</option>
                <option value="PREVIEW_LINK">预览链接</option>
              </select>
            </label>
          </div>
          <div className="drawer-form-grid">
            <label className="field">
              <span>证据地址</span>
              <input value={form.evidenceUrl} onChange={(event) => setFormValue(setForm, "evidenceUrl", event.target.value)} placeholder="可填写截图、视频片段或预览链接" />
            </label>
            <label className="field">
              <span>截图地址</span>
              <input value={form.snapshotUrl} onChange={(event) => setFormValue(setForm, "snapshotUrl", event.target.value)} />
            </label>
          </div>
          <label className="field">
            <span>取证说明</span>
            <textarea value={form.description} rows={2} onChange={(event) => setFormValue(setForm, "description", event.target.value)} />
          </label>
          <div className="drawer-action-bar">
            {cameraId ? (
              <PermissionButton className="drawer-action-button" permission={SYSTEM_PERMISSIONS.VIDEO_CAMERA_CAPTURE_SNAPSHOT} type="button" onClick={() => void captureSnapshot()}>
                <Camera size={16} />
                截图取证
              </PermissionButton>
            ) : null}
            <PermissionButton className="drawer-action-button" permission={SYSTEM_PERMISSIONS.VIDEO_EVIDENCE_CREATE} type="submit">
              保存证据
            </PermissionButton>
          </div>
        </form>
      ) : <p className="muted-text">当前状态不允许新增视频证据。</p>}
      <DataTable>
        <thead>
          <tr>
            <th>摄像头</th>
            <th>类型</th>
            <th>证据地址</th>
            <th>取证时间</th>
            <th>说明</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.id}>
              <td>{cameraLabel(row)}</td>
              <td>{evidenceTypeLabel(row.evidenceType)}</td>
              <td>{evidenceLink(row)}</td>
              <td>{formatDateTime(row.capturedAt ?? row.createTime)}</td>
              <td>{row.description ?? "-"}</td>
              <td>{row.status}</td>
              <td>
                <PermissionButton className="secondary-button" permission={SYSTEM_PERMISSIONS.VIDEO_EVIDENCE_DELETE} type="button" onClick={() => void deleteEvidence(row.id)}>
                  <Trash2 size={15} />
                  删除
                </PermissionButton>
              </td>
            </tr>
          ))}
          {!loading && items.length === 0 ? (
            <tr>
              <td colSpan={7}>
                <p className="muted-text">暂无视频证据</p>
              </td>
            </tr>
          ) : null}
          {loading ? (
            <tr>
              <td colSpan={7}>
                <p className="muted-text">正在加载视频证据...</p>
              </td>
            </tr>
          ) : null}
        </tbody>
      </DataTable>
    </section>
  );
}

function buildEvidenceEndpoint(sourceType: VideoEvidenceSourceType, sourceId?: string | null, cameraId?: string | null) {
  if (sourceType === "HAZARD" && sourceId) {
    return {
      list: `/safety/hazards/${sourceId}/video-evidences`,
      create: `/safety/hazards/${sourceId}/video-evidences`
    };
  }
  if (sourceType === "INSPECTION" && sourceId) {
    return {
      list: `/safety/inspect-tasks/${sourceId}/video-evidences`,
      create: `/safety/inspect-tasks/${sourceId}/video-evidences`
    };
  }
  if (cameraId) {
    return {
      list: `/video-security/evidences?camera_id=${encodeURIComponent(cameraId)}&page_size=100`,
      create: "/video-security/evidences"
    };
  }
  return { list: "", create: "" };
}

function normalizeRows(data: VideoEvidenceRow[] | PaginatedResult<VideoEvidenceRow>): VideoEvidenceRow[] {
  if (Array.isArray(data)) return data;
  return data.items ?? [];
}

function setFormValue<K extends keyof EvidenceForm>(
  setForm: (updater: (current: EvidenceForm) => EvidenceForm) => void,
  key: K,
  value: EvidenceForm[K]
) {
  setForm((current) => ({ ...current, [key]: value }));
}

function cameraLabel(row: VideoEvidenceRow): string {
  const cameraName = row.camera?.cameraName ?? row.camera?.cameraCode;
  return cameraName ?? row.cameraId;
}

function evidenceTypeLabel(type: VideoEvidenceType): string {
  const labels: Record<VideoEvidenceType, string> = {
    SNAPSHOT: "截图",
    VIDEO_CLIP: "视频片段",
    PREVIEW_LINK: "预览链接"
  };
  return labels[type] ?? type;
}

function evidenceLink(row: VideoEvidenceRow) {
  const url = row.snapshotUrl ?? row.evidenceUrl;
  if (!url) return "-";
  return <a className="drawer-link" href={url} target="_blank" rel="noreferrer">查看证据</a>;
}

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}
