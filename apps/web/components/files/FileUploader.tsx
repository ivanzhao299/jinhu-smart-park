"use client";

import { FileUp, Upload } from "lucide-react";
import type { ChangeEvent } from "react";
import { useId, useMemo, useRef, useState } from "react";
import {
  formatFileSize,
  getFileUploadLimitForMime,
  resolveFileUploadPolicy,
  type FileRecord,
  type FileUploadPolicyKey
} from "@jinhu/shared";
import { apiFormRequest, createIdempotencyKey } from "../../lib/api-client";
import { getAccessToken } from "../../lib/authz";
import { buildFileUploadFormData } from "./file-uploader.logic";
import {
  createPropertyUploadQueueItem,
  executePropertyUploadAttempt,
  preparePropertyUploadRecovery,
  type PropertyUploadContext,
  type PropertyUploadQueueItem
} from "../../features/property-shared/offline/property-upload-queue";
import { usePropertyUploadQueue } from "../../features/property-shared/offline/use-property-upload-queue";

export interface FileUploaderOfflineContext {
  tenantId: string;
  parkId: string;
  userId: string;
  entityVersion: string;
  module: string;
  permissionFingerprint: string;
}

interface FileUploaderProps {
  bizType: string;
  bizId?: string;
  uploadPath?: string;
  policyKey?: FileUploadPolicyKey;
  label?: string;
  helperText?: string;
  safeErrorMessage?: string;
  compact?: boolean;
  disabled?: boolean;
  onUploadingChange?: (uploading: boolean) => void;
  onUploaded: (file: FileRecord) => void;
  offlineQueueContext?: FileUploaderOfflineContext;
  offlineQueueUnavailableReason?: string;
  resolveCurrentEntityVersion?: () => Promise<string>;
  onQueueStateChange?: (state: { busy: boolean; count: number }) => void;
}

export function FileUploader({
  bizType,
  bizId,
  uploadPath = "/files",
  policyKey,
  label,
  helperText,
  safeErrorMessage,
  compact = false,
  disabled = false,
  onUploadingChange,
  onUploaded,
  offlineQueueContext,
  offlineQueueUnavailableReason,
  resolveCurrentEntityVersion,
  onQueueStateChange
}: FileUploaderProps) {
  const fileInputId = useId();
  const remarkInputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [message, setMessage] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [selectedFileMeta, setSelectedFileMeta] = useState("");
  const [remark, setRemark] = useState("");
  const [uploading, setUploading] = useState(false);
  const selectedIdempotencyKey = useRef<string | null>(null);
  const policy = useMemo(() => resolveFileUploadPolicy(policyKey ?? bizType), [bizType, policyKey]);
  const accept = policy.mimeTypes.join(",");
  const policyText = helperText ?? `${policy.mimeTypes.map(formatAcceptedMimeLabel).join(" / ")}，最大 ${formatFileSize(policy.maxSizeBytes)}`;
  const hasVersionResolver = resolveCurrentEntityVersion !== undefined;
  const configuredQueueContext = useMemo<PropertyUploadContext | null>(() => {
    if (!offlineQueueContext || !bizId || !hasVersionResolver) return null;
    return { ...offlineQueueContext, bizType, bizId };
  }, [
    bizId,
    bizType,
    offlineQueueContext?.entityVersion,
    offlineQueueContext?.module,
    offlineQueueContext?.parkId,
    offlineQueueContext?.permissionFingerprint,
    offlineQueueContext?.tenantId,
    offlineQueueContext?.userId,
    hasVersionResolver
  ]);
  const offlineQueue = usePropertyUploadQueue({
    context: configuredQueueContext,
    onMessage: setMessage,
    onQueueStateChange,
    uploading
  });
  const queueContext = offlineQueue.context;

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setMessage("");
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      setSelectedFileName("");
      setSelectedFileMeta("");
      setSelectedFile(null);
      return;
    }

    if (!policy.mimeTypes.includes(file.type)) {
      event.target.value = "";
      setSelectedFileName("");
      setSelectedFileMeta("");
      setSelectedFile(null);
      setMessage(`${policy.label}不支持该文件类型`);
      return;
    }

    const sizeLimit = getFileUploadLimitForMime(policy, file.type);
    if (file.size > sizeLimit) {
      event.target.value = "";
      setSelectedFileName("");
      setSelectedFileMeta("");
      setSelectedFile(null);
      setMessage(`${policy.label}大小不能超过 ${formatFileSize(sizeLimit)}`);
      return;
    }

    setSelectedFile(file);
    selectedIdempotencyKey.current = createIdempotencyKey("file-upload");
    setSelectedFileName(file.name);
    setSelectedFileMeta(`${file.type || "未知类型"} · ${formatFileSize(file.size)}`);
  }

  async function uploadBlob(file: Blob, fileName: string, uploadRemark: string, idempotencyKey: string): Promise<FileRecord> {
    const form = buildFileUploadFormData({
      file,
      fileName,
      bizType,
      bizId,
      remark: uploadRemark,
      uploadPath
    });
    const response = await apiFormRequest<FileRecord>(uploadPath, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey,
      body: form
    });
    return response.data;
  }

  async function queueSelectedFile(file: File, expectedGeneration: number, uploadRemark: string): Promise<void> {
    if (!offlineQueue.enabled || !queueContext) throw new Error("当前上传场景不支持离线暂存");
    const item = createPropertyUploadQueueItem({
      id: crypto.randomUUID(), context: queueContext, file, explicitConsent: offlineQueue.consent,
      idempotencyKey: selectedIdempotencyKey.current ?? createIdempotencyKey("file-upload"), remark: uploadRemark
    });
    await offlineQueue.enqueue(item, expectedGeneration);
    clearSelection();
    setMessage("图片已临时保存在此设备，需联网后手动恢复上传；最多保留 2 小时。");
  }

  function clearSelection() {
    setSelectedFile(null);
    setSelectedFileName("");
    setSelectedFileMeta("");
    setRemark("");
    selectedIdempotencyKey.current = null;
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleUpload() {
    if (disabled || uploading) return;
    setMessage("");
    if (!selectedFile) {
      setMessage("请先选择文件");
      return;
    }
    setUploading(true);
    onUploadingChange?.(true);
    const expectedGeneration = offlineQueue.captureGeneration();
    const idempotencyKey = selectedIdempotencyKey.current ?? createIdempotencyKey("file-upload");
    const uploadRemark = remark.trim();
    selectedIdempotencyKey.current = idempotencyKey;
    try {
      const result = await executePropertyUploadAttempt({
        contextAvailable: queueContext !== null,
        online: typeof navigator === "undefined" || navigator.onLine,
        queueEnabled: offlineQueue.enabled,
        queueOffline: () => queueSelectedFile(selectedFile, expectedGeneration, uploadRemark),
        uploadOnline: () => uploadBlob(selectedFile, selectedFile.name, uploadRemark, idempotencyKey)
      });
      if (result.kind === "queued") return;
      const uploaded = result.value;
      if (queueContext && !offlineQueue.generationIsCurrent(expectedGeneration)) {
        setMessage("登录或权限上下文已变化，旧上传成功结果已丢弃");
        return;
      }
      onUploaded(uploaded);
      clearSelection();
      setMessage("上传成功");
    } catch (error) {
      if (safeErrorMessage) {
        setMessage(safeErrorMessage);
        return;
      }
      if (queueContext && offlineQueue.consent && selectedFile) {
        try {
          await queueSelectedFile(selectedFile, expectedGeneration, uploadRemark);
          return;
        } catch (queueError) {
          setMessage(queueError instanceof Error ? queueError.message : "离线图片暂存失败");
        }
      } else {
        const detail = error instanceof Error ? error.message : "上传失败";
        setMessage(queueContext
          ? `${detail}；如需临时保存在此设备，请先勾选明确同意。`
          : offlineQueueUnavailableReason ? `${detail}；${offlineQueueUnavailableReason}` : detail);
      }
    } finally {
      setUploading(false);
      onUploadingChange?.(false);
    }
  }

  async function recoverQueuedItem(item: PropertyUploadQueueItem) {
    if (!queueContext || uploading) return;
    setUploading(true);
    onUploadingChange?.(true);
    setMessage("");
    const expectedGeneration = offlineQueue.captureGeneration();
    try {
      const currentVersion = await resolveCurrentEntityVersion?.();
      if (currentVersion !== queueContext.entityVersion) {
        throw new Error("关联记录版本已变化，请清除临时图片并重新选择");
      }
      const recoverable = preparePropertyUploadRecovery(item, queueContext, true);
      const uploaded = await uploadBlob(
        recoverable.blob, recoverable.fileName, recoverable.remark, recoverable.idempotencyKey
      );
      if (!offlineQueue.generationIsCurrent(expectedGeneration)) {
        setMessage("登录或权限上下文已变化，旧上传成功结果已丢弃");
        return;
      }
      await offlineQueue.remove(recoverable);
      if (!offlineQueue.generationIsCurrent(expectedGeneration)) return;
      onUploaded(uploaded);
      setMessage("临时图片已恢复上传并从本机清除");
    } catch (error) {
      if (!offlineQueue.generationIsCurrent(expectedGeneration)) {
        setMessage("登录或权限上下文已变化，旧上传恢复结果已丢弃");
        return;
      }
      const failed = { ...item, status: "failed" as const, failureMessage: error instanceof Error ? error.message : "恢复上传失败" };
      await offlineQueue.recordFailure(failed, expectedGeneration);
      if (!offlineQueue.generationIsCurrent(expectedGeneration)) return;
      setMessage(failed.failureMessage);
    } finally {
      setUploading(false);
      onUploadingChange?.(false);
    }
  }

  async function cancelQueuedItem(item: PropertyUploadQueueItem) {
    if (uploading) return;
    await offlineQueue.remove(item);
    setMessage("本机临时图片已清除");
  }

  return (
    <div className={compact ? "file-uploader file-uploader-compact" : "form-stack"}>
      <div className="field">
        <span>{label ?? (compact ? policy.label : "选择文件")}</span>
        <label className="ds-file-picker" htmlFor={fileInputId}>
          <input ref={fileInputRef} className="sr-only" accept={accept} disabled={disabled || uploading} id={fileInputId} name="file" type="file" onChange={handleFileChange} />
          <span className="ds-file-picker-button">
            <FileUp size={16} />
            选择文件
          </span>
          <span className={selectedFileName ? "ds-file-picker-name" : "ds-file-picker-name ds-file-picker-empty"}>
            {selectedFileName || "未选择文件"}
          </span>
        </label>
        <span className="ds-field-hint">{selectedFileMeta || policyText}</span>
      </div>
      <div className="field">
        <label htmlFor={remarkInputId}>备注</label>
        <input disabled={disabled || uploading} id={remarkInputId} maxLength={500} name="remark" placeholder="可选" value={remark} onChange={(event) => setRemark(event.target.value)} />
      </div>
      <button className="primary-button" disabled={disabled || uploading} type="button" onClick={() => void handleUpload()}>
        <Upload size={16} />
        {uploading ? "上传中" : "上传"}
      </button>
      {offlineQueue.uiState.visible && queueContext ? <label>
        <input checked={offlineQueue.consent} disabled={disabled || uploading} name="offline_queue_consent" type="checkbox"
          onChange={(event) => offlineQueue.setConsent(event.target.checked)} />
        我明确同意在上传失败或离线时，将现场图片临时保存在此设备（最多 2 小时）
      </label> : null}
      {offlineQueue.uiState.visible ? offlineQueue.items.map((item) => <div className="status-pill" key={item.id}>
        <span>{item.fileName} · 等待手动恢复</span>
        <button disabled={disabled || uploading || (typeof navigator !== "undefined" && !navigator.onLine)}
          type="button" onClick={() => void recoverQueuedItem(item)}>恢复上传</button>
        <button disabled={disabled || uploading} type="button" onClick={() => void cancelQueuedItem(item)}>清除</button>
      </div>) : null}
      {message ? <span className="status-pill">{message}</span> : null}
    </div>
  );
}

function formatAcceptedMimeLabel(mimeType: string): string {
  return ({
    "image/jpeg": "JPG",
    "image/png": "PNG",
    "image/webp": "WEBP",
    "application/pdf": "PDF",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
    "application/vnd.ms-excel": "XLS",
    "video/mp4": "MP4"
  } as Record<string, string>)[mimeType] ?? (mimeType.split("/").pop()?.toUpperCase() ?? mimeType);
}
