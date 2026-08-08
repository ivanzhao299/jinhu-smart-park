"use client";

import type { FileRecord } from "@jinhu/shared";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { FileUploader } from "../../../components/files/FileUploader";
import { PendingAttachmentList } from "../../../components/files/PendingAttachmentList";
import {
  PropertyPanelSurface,
  RemoteEntityPicker,
  type PropertyCapabilityProjection,
  type RemoteEntityOption
} from "../../../features/property-shared";
import { apiRequest } from "../../../lib/api-client";
import { getAccessToken } from "../../../lib/authz";
import { businessDate } from "../../../lib/business-date";
import {
  MoneyField,
  MutationFeedback
} from "./HousingFormPrimitives";
import styles from "./HousingWorkbench.module.css";
import { loadHousingUnits } from "./housing-picker-loaders";
import {
  deletePendingFile,
  loadPendingFiles
} from "./housing-pending-files";
import { useStableIdempotency } from "./use-stable-idempotency";

export function HousingPurchaseCreatePanel({
  capabilities,
  onCreated
}: {
  capabilities: PropertyCapabilityProjection;
  onCreated(): void;
}) {
  const [unit, setUnit] = useState<RemoteEntityOption | null>(null);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  const removeLock = useRef(false);
  const idempotency = useStableIdempotency();
  const fileCapability = capabilities.fileCapability("housing_purchase");

  useEffect(() => {
    if (!fileCapability.canRead) return;
    void loadPendingFiles("housing_purchase").then(setFiles)
      .catch((error: Error) => setMessage(error.message));
  }, [capabilities.invalidationKey, fileCapability.canRead]);

  async function removeFile(fileId: string) {
    if (removeLock.current) return;
    removeLock.current = true;
    const operation = `housing-purchase-file-delete-${fileId}`;
    setRemoving(true);
    try {
      await deletePendingFile(fileId, idempotency.keyFor(operation, { fileId }));
      idempotency.complete(operation);
      setFiles((current) => current.filter((file) => file.id !== fileId));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "票据移除失败");
    } finally {
      removeLock.current = false; setRemoving(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (uploading || removing || lock.current) return;
    const form = new FormData(event.currentTarget);
    const body = purchaseBody(form, unit?.id, files);
    lock.current = true; setSubmitting(true);
    try {
      await apiRequest("/housing/purchases", {
        method: "POST", token: getAccessToken(),
        idempotencyKey: idempotency.keyFor("housing-purchase-create", body), body
      });
      idempotency.complete("housing-purchase-create");
      setMessage("采购草稿已创建。");
      setUnit(null); setFiles([]); event.currentTarget.reset(); onCreated();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "采购草稿创建失败");
    } finally {
      lock.current = false; setSubmitting(false);
    }
  }

  return <PurchaseCreateView capabilities={capabilities} fileCapability={fileCapability} files={files}
    message={message} onFiles={setFiles} onRemove={removeFile} onSubmit={submit} onUnit={setUnit}
    onUploading={setUploading} removing={removing} submitting={submitting} unit={unit} uploading={uploading} />;
}

function PurchaseCreateView(props: {
  capabilities: PropertyCapabilityProjection;
  fileCapability: ReturnType<PropertyCapabilityProjection["fileCapability"]>; files: FileRecord[];
  message: string; onFiles(value: FileRecord[]): void; onRemove(id: string): Promise<void>;
  onSubmit(event: FormEvent<HTMLFormElement>): void; onUnit(value: RemoteEntityOption | null): void;
  onUploading(value: boolean): void; removing: boolean; submitting: boolean;
  unit: RemoteEntityOption | null; uploading: boolean;
}) {
  const locked = props.uploading || props.submitting || props.removing;
  return <PropertyPanelSurface title="创建采购草稿">
    <form className={styles.stack} onSubmit={props.onSubmit}>
      <fieldset className={styles.fieldset} disabled={props.submitting || props.removing}>
        <RemoteEntityPicker authorized={props.capabilities.actionAllowed("housing.purchases.create")}
          contextValid={props.capabilities.moduleAvailable} invalidationKey={props.capabilities.invalidationKey}
          label="关联住房房源（可选）" loadOptions={loadHousingUnits} onChange={props.onUnit} value={props.unit} />
        <PurchaseFields />
        {props.fileCapability.canUpload ? <FileUploader bizType="housing_purchase" compact disabled={locked}
          label="上传采购票据" onUploaded={(file) => props.onFiles([...props.files, file])}
          onUploadingChange={props.onUploading} policyKey="receipt" /> : null}
        {props.files.length ? <PendingAttachmentList files={props.files} mutationDisabled={locked}
          onRemove={props.fileCapability.canDelete ? (id) => void props.onRemove(id) : undefined} /> : null}
        {props.removing ? <p aria-live="polite">正在移除票据…</p> : null}
        <button className="ds-button ds-button-primary" disabled={locked} type="submit">{props.submitting ? "创建中…" : "创建草稿"}</button>
      </fieldset>
    </form>
    <MutationFeedback message={props.message} />
  </PropertyPanelSurface>;
}

function PurchaseFields() {
  const [purchaseDate, setPurchaseDate] = useState("");
  useEffect(() => setPurchaseDate(businessDate()), []);
  return (
    <div className={styles.formGrid}>
      <label>供应商<input maxLength={200} name="vendor_name" required /></label>
      <label>采购日期<input name="purchase_date" onChange={(event) => setPurchaseDate(event.target.value)}
        required type="date" value={purchaseDate} /></label>
      <label>成本分类<input maxLength={64} name="cost_category" required /></label>
      <label>物品名称<input maxLength={200} name="item_name" required /></label>
      <label>数量<input min="0.001" name="quantity" required step="0.001" type="number" /></label>
      <label>单位<input maxLength={20} name="unit" /></label>
      <MoneyField label="单价" name="unit_price" />
      <label>备注<textarea maxLength={500} name="remark" /></label>
    </div>
  );
}

function purchaseBody(form: FormData, unitId: string | undefined, files: FileRecord[]) {
  return {
    unit_id: unitId,
    vendor_name: String(form.get("vendor_name")),
    purchase_date: String(form.get("purchase_date")),
    cost_category: String(form.get("cost_category")),
    items: [{
      item_name: String(form.get("item_name")),
      quantity: String(form.get("quantity")),
      unit: String(form.get("unit") ?? ""),
      unit_price: String(form.get("unit_price"))
    }],
    receipt_file_ids: files.map((file) => file.id),
    remark: String(form.get("remark") ?? "")
  };
}
