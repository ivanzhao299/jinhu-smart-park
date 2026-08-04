export const PROPERTY_UPLOAD_BLOB_TTL_MS = 2 * 60 * 60 * 1000;

export interface PropertyUploadContext {
  tenantId: string;
  parkId: string;
  userId: string;
  bizType: string;
  bizId: string;
  entityVersion: number;
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
}

const prohibitedBizType = /(?:identity|credential|payment|bank|invoice|signature)/iu;

function part(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`invalid upload ${label}`);
  return encodeURIComponent(normalized);
}

export function propertyUploadContextKey(context: PropertyUploadContext): string {
  return [context.tenantId, context.parkId, context.userId, context.bizType, context.bizId, String(context.entityVersion)]
    .map((value, index) => part(value, ["tenant", "park", "user", "biz type", "biz id", "version"][index]!))
    .join("|");
}

export function createPropertyUploadQueueItem(input: {
  id: string;
  context: PropertyUploadContext;
  file: Blob & { name?: string };
  explicitConsent: boolean;
  now?: number;
}): PropertyUploadQueueItem {
  if (!input.explicitConsent) throw new Error("offline upload storage requires explicit consent");
  if (prohibitedBizType.test(input.context.bizType)) throw new Error("sensitive evidence cannot be queued offline");
  if (!input.file.type.startsWith("image/")) throw new Error("offline upload queue only accepts field images");
  const createdAt = input.now ?? Date.now();
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
    failureMessage: null
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
