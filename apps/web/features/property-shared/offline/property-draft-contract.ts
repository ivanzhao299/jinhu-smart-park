export const PROPERTY_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

export interface PropertyDraftContext {
  tenantId: string;
  parkId: string;
  userId: string;
  route: string;
  entityId: string;
}

export interface PropertyOfflineScope {
  tenantId: string;
  parkId: string;
  userId: string;
  module: string;
  permissionFingerprint: string;
}

export interface PropertyDraftEnvelope<T extends Record<string, unknown>> {
  key: string;
  context: PropertyDraftContext;
  value: T;
  entityVersion: number | null;
  savedAt: number;
  expiresAt: number;
}

const sensitiveKey = /(?:identity|idcard|id_card|passport|credential|password|payment|bank|card_number|cvv|secret|token|file|blob)/iu;

function normalizedPart(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.includes("\u0000")) throw new Error(`invalid draft ${label}`);
  return encodeURIComponent(normalized);
}

export function propertyDraftKey(context: PropertyDraftContext): string {
  return [context.tenantId, context.parkId, context.userId, context.route, context.entityId]
    .map((value, index) => normalizedPart(value, ["tenant", "park", "user", "route", "entity"][index]!))
    .join("|");
}

export function propertyOfflineScopeKey(scope: PropertyOfflineScope): string {
  return [scope.tenantId, scope.parkId, scope.userId, scope.module, scope.permissionFingerprint]
    .map((value, index) => normalizedPart(value, ["tenant", "park", "user", "module", "permissions"][index]!))
    .join("|");
}

export function assertSafePropertyDraft(value: unknown, path = "draft"): void {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSafePropertyDraft(item, `${path}[${index}]`));
    return;
  }
  if (typeof value !== "object" || (typeof Blob !== "undefined" && value instanceof Blob) || value instanceof Date) {
    throw new Error(`unsupported offline draft value at ${path}`);
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (sensitiveKey.test(key)) throw new Error(`sensitive offline draft field at ${path}.${key}`);
    assertSafePropertyDraft(child, `${path}.${key}`);
  }
}

export function createPropertyDraftEnvelope<T extends Record<string, unknown>>(
  context: PropertyDraftContext,
  value: T,
  options: { now?: number; entityVersion?: number | null } = {}
): PropertyDraftEnvelope<T> {
  assertSafePropertyDraft(value);
  const savedAt = options.now ?? Date.now();
  return {
    key: propertyDraftKey(context),
    context: { ...context },
    value: structuredClone(value),
    entityVersion: options.entityVersion ?? null,
    savedAt,
    expiresAt: savedAt + PROPERTY_DRAFT_TTL_MS
  };
}

export function isPropertyDraftUsable(
  envelope: PropertyDraftEnvelope<Record<string, unknown>>,
  context: PropertyDraftContext,
  now = Date.now()
): boolean {
  return envelope.key === propertyDraftKey(context) && envelope.expiresAt > now;
}
