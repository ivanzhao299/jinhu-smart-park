"use client";

import { FileUp, Upload } from "lucide-react";
import type { ChangeEvent } from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  formatFileSize,
  getFileUploadLimitForMime,
  resolveFileUploadPolicy,
  type FileRecord,
  type FileUploadPolicyKey
} from "@jinhu/shared";
import { apiFormRequest, createIdempotencyKey } from "../../lib/api-client";
import { getAccessToken } from "../../lib/authz";
import {
  deletePropertyUploadQueueItem,
  capturePropertyOfflineGeneration,
  ensurePropertyOfflineScope,
  isPropertyOfflineGenerationCurrent,
  listPropertyUploadQueue,
  putPropertyUploadQueueItem
} from "../../features/property-shared/offline/property-draft-store";
import {
  createPropertyUploadQueueItem,
  preparePropertyUploadRecovery,
  propertyUploadContextKey,
  propertyUploadQueueBusy,
  type PropertyUploadContext,
  type PropertyUploadQueueItem
} from "../../features/property-shared/offline/property-upload-queue";

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
  const [offlineConsent, setOfflineConsent] = useState(false);
  const [queuedItems, setQueuedItems] = useState<PropertyUploadQueueItem[]>([]);
  const [initializedQueueContextKey, setInitializedQueueContextKey] = useState<string | null>(null);
  const selectedIdempotencyKey = useRef<string | null>(null);
  const offlineGeneration = useRef<number | null>(null);
  const queueStateCallback = useRef(onQueueStateChange);
  queueStateCallback.current = onQueueStateChange;
  const policy = useMemo(() => resolveFileUploadPolicy(policyKey ?? bizType), [bizType, policyKey]);
  const accept = policy.mimeTypes.join(",");
  const policyText = helperText ?? `${policy.mimeTypes.map((item) => item.split("/").pop()?.toUpperCase() ?? item).join(" / ")}，最大 ${formatFileSize(policy.maxSizeBytes)}`;
  const hasVersionResolver = resolveCurrentEntityVersion !== undefined;
  const queueContext = useMemo<PropertyUploadContext | null>(() => {
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
  const queueContextKey = queueContext ? propertyUploadContextKey(queueContext) : null;

  useEffect(() => {
    let active = true;
    setOfflineConsent(false);
    setQueuedItems([]);
    if (!queueContext || typeof indexedDB === "undefined") {
      return () => { active = false; };
    }
    void ensurePropertyOfflineScope({
      tenantId: queueContext.tenantId,
      parkId: queueContext.parkId,
      userId: queueContext.userId,
      module: queueContext.module,
      permissionFingerprint: queueContext.permissionFingerprint
    })
      .then((generation) => {
        offlineGeneration.current = generation;
        return listPropertyUploadQueue(queueContext);
      })
      .then((items) => {
        if (active && offlineGeneration.current !== null && isPropertyOfflineGenerationCurrent(offlineGeneration.current)) {
          setQueuedItems(items);
          setInitializedQueueContextKey(propertyUploadContextKey(queueContext));
        }
      })
      .catch(() => { if (active) setMessage("离线图片恢复区暂不可用，提交保持锁定"); });
    return () => { active = false; };
  }, [queueContext]);

  useEffect(() => {
    queueStateCallback.current?.({
      busy: propertyUploadQueueBusy(queueContextKey, initializedQueueContextKey, uploading),
      count: queuedItems.length
    });
  }, [initializedQueueContextKey, queueContextKey, queuedItems.length, uploading]);

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
    const form = new FormData();
    form.set("file", file, fileName);
    form.set("biz_type", bizType);
    if (bizId) form.set("biz_id", bizId);
    if (uploadRemark) form.set("remark", uploadRemark);
    const response = await apiFormRequest<FileRecord>(uploadPath, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey,
      body: form
    });
    return response.data;
  }

  async function queueSelectedFile(file: File, expectedGeneration: number, uploadRemark: string): Promise<void> {
    if (!queueContext) throw new Error("当前上传场景不支持离线暂存");
    const item = createPropertyUploadQueueItem({
      id: crypto.randomUUID(), context: queueContext, file, explicitConsent: offlineConsent,
      idempotencyKey: selectedIdempotencyKey.current ?? createIdempotencyKey("file-upload"), remark: uploadRemark
    });
    await putPropertyUploadQueueItem(item, expectedGeneration);
    setQueuedItems((current) => [...current, item]);
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
    const expectedGeneration = offlineGeneration.current ?? capturePropertyOfflineGeneration();
    const idempotencyKey = selectedIdempotencyKey.current ?? createIdempotencyKey("file-upload");
    const uploadRemark = remark.trim();
    selectedIdempotencyKey.current = idempotencyKey;
    try {
      if (queueContext && typeof navigator !== "undefined" && !navigator.onLine) {
        await queueSelectedFile(selectedFile, expectedGeneration, uploadRemark);
        return;
      }
      const uploaded = await uploadBlob(selectedFile, selectedFile.name, uploadRemark, idempotencyKey);
      if (queueContext && !isPropertyOfflineGenerationCurrent(expectedGeneration)) {
        setMessage("登录或权限上下文已变化，旧上传成功结果已丢弃");
        return;
      }
      onUploaded(uploaded);
      clearSelection();
      setMessage("上传成功");
    } catch (error) {
      if (queueContext && offlineConsent && selectedFile) {
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
    const expectedGeneration = offlineGeneration.current ?? capturePropertyOfflineGeneration();
    try {
      const currentVersion = await resolveCurrentEntityVersion?.();
      if (currentVersion !== queueContext.entityVersion) {
        throw new Error("关联记录版本已变化，请清除临时图片并重新选择");
      }
      const recoverable = preparePropertyUploadRecovery(item, queueContext, true);
      const uploaded = await uploadBlob(
        recoverable.blob, recoverable.fileName, recoverable.remark, recoverable.idempotencyKey
      );
      if (!isPropertyOfflineGenerationCurrent(expectedGeneration)) {
        setMessage("登录或权限上下文已变化，旧上传成功结果已丢弃");
        return;
      }
      await deletePropertyUploadQueueItem(recoverable.id);
      if (!isPropertyOfflineGenerationCurrent(expectedGeneration)) return;
      setQueuedItems((current) => current.filter((candidate) => candidate.id !== recoverable.id));
      onUploaded(uploaded);
      setMessage("临时图片已恢复上传并从本机清除");
    } catch (error) {
      if (!isPropertyOfflineGenerationCurrent(expectedGeneration)) {
        setMessage("登录或权限上下文已变化，旧上传恢复结果已丢弃");
        return;
      }
      const failed = { ...item, status: "failed" as const, failureMessage: error instanceof Error ? error.message : "恢复上传失败" };
      await putPropertyUploadQueueItem(failed, expectedGeneration).catch(() => undefined);
      if (!isPropertyOfflineGenerationCurrent(expectedGeneration)) return;
      setQueuedItems((current) => current.map((candidate) => candidate.id === item.id ? failed : candidate));
      setMessage(failed.failureMessage);
    } finally {
      setUploading(false);
      onUploadingChange?.(false);
    }
  }

  async function cancelQueuedItem(item: PropertyUploadQueueItem) {
    if (uploading) return;
    await deletePropertyUploadQueueItem(item.id);
    setQueuedItems((current) => current.filter((candidate) => candidate.id !== item.id));
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
      {queueContext ? <label>
        <input checked={offlineConsent} disabled={disabled || uploading} type="checkbox"
          onChange={(event) => setOfflineConsent(event.target.checked)} />
        我明确同意在上传失败或离线时，将现场图片临时保存在此设备（最多 2 小时）
      </label> : null}
      {queuedItems.map((item) => <div className="status-pill" key={item.id}>
        <span>{item.fileName} · 等待手动恢复</span>
        <button disabled={disabled || uploading || (typeof navigator !== "undefined" && !navigator.onLine)}
          type="button" onClick={() => void recoverQueuedItem(item)}>恢复上传</button>
        <button disabled={disabled || uploading} type="button" onClick={() => void cancelQueuedItem(item)}>清除</button>
      </div>)}
      {message ? <span className="status-pill">{message}</span> : null}
    </div>
  );
}
