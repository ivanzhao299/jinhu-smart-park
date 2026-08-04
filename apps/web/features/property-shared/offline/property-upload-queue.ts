export const PROPERTY_UPLOAD_BLOB_TTL_MS = 2 * 60 * 60 * 1000;
export const PROPERTY_UPLOAD_REMARK_MAX_LENGTH = 500;

export interface PropertyUploadContext {
  tenantId: string;
  parkId: string;
  userId: string;
  module: string;
  permissionFingerprint: string;
  bizType: string;
  bizId: string;
  entityVersion: string;
}

export interface PropertyUploadQueueItem {
  id: string;
  contextKey: string;
  context: PropertyUploadContext;
  fileName: string;
  mimeType: string;
  size: number;
  blob: Blob;
  explicitConsentAt: number;
  createdAt: number;
  expiresAt: number;
  status: "queued" | "failed";
  failureMessage: string | null;
  idempotencyKey: string;
  remark: string;
}

const prohibitedBizType = /(?:identity|credential|payment|bank|invoice|signature)/iu;

function part(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`invalid upload ${label}`);
  return encodeURIComponent(normalized);
}

export function propertyUploadContextKey(context: PropertyUploadContext): string {
  return [
    context.tenantId, context.parkId, context.userId, context.module,
    context.permissionFingerprint, context.bizType, context.bizId, String(context.entityVersion)
  ]
    .map((value, index) => part(value, [
      "tenant", "park", "user", "module", "permissions", "biz type", "biz id", "version"
    ][index]!))
    .join("|");
}

export function propertyUploadQueueBusy(
  contextKey: string | null,
  initializedContextKey: string | null,
  uploading: boolean
): boolean {
  return uploading || (contextKey !== null && initializedContextKey !== contextKey);
}

export function createPropertyUploadQueueItem(input: {
  id: string;
  context: PropertyUploadContext;
  file: Blob & { name?: string };
  explicitConsent: boolean;
  idempotencyKey?: string;
  remark?: string;
  now?: number;
}): PropertyUploadQueueItem {
  if (!input.explicitConsent) throw new Error("offline upload storage requires explicit consent");
  if (prohibitedBizType.test(input.context.bizType)) throw new Error("sensitive evidence cannot be queued offline");
  if (!input.file.type.startsWith("image/")) throw new Error("offline upload queue only accepts field images");
  const createdAt = input.now ?? Date.now();
  const remark = input.remark?.trim() ?? "";
  if (remark.length > PROPERTY_UPLOAD_REMARK_MAX_LENGTH) {
    throw new Error(`offline upload remark exceeds ${PROPERTY_UPLOAD_REMARK_MAX_LENGTH} characters`);
  }
  return {
    id: part(input.id, "id"),
    contextKey: propertyUploadContextKey(input.context),
    context: { ...input.context },
    fileName: input.file.name?.trim() || "field-image",
    mimeType: input.file.type,
    size: input.file.size,
    blob: input.file,
    explicitConsentAt: createdAt,
    createdAt,
    expiresAt: createdAt + PROPERTY_UPLOAD_BLOB_TTL_MS,
    status: "queued",
    failureMessage: null,
    idempotencyKey: input.idempotencyKey?.trim() || `file-upload-${part(input.id, "id")}`,
    remark
  };
}

export function isPropertyUploadQueueItemUsable(
  item: PropertyUploadQueueItem,
  context: PropertyUploadContext,
  now = Date.now()
): boolean {
  return item.contextKey === propertyUploadContextKey(context) && item.expiresAt > now;
}

export function assertPropertyUploadSubmissionContext(
  item: PropertyUploadQueueItem,
  context: PropertyUploadContext,
  now = Date.now()
): void {
  if (!isPropertyUploadQueueItemUsable(item, context, now)) {
    throw new Error("offline upload context changed or blob expired; manual review required");
  }
}

export function preparePropertyUploadRecovery(
  item: PropertyUploadQueueItem,
  context: PropertyUploadContext,
  explicitManualRequest: boolean,
  now = Date.now()
): PropertyUploadQueueItem {
  if (!explicitManualRequest) {
    throw new Error("offline upload recovery requires an explicit manual request");
  }
  assertPropertyUploadSubmissionContext(item, context, now);
  return item;
}
