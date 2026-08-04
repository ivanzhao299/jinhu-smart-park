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

interface PropertyModuleAssignmentSubject {
  module_code: string;
  enabled: boolean;
  expire_time?: string | null;
}

export interface PropertyDraftEnvelope<T extends Record<string, unknown>> {
  key: string;
  context: PropertyDraftContext;
  value: T;
  entityVersion: number | null;
  savedAt: number;
  expiresAt: number;
}

export type PropertyDraftLeafType = "string" | "number" | "boolean" | "null";
export type PropertyDraftSchema = { readonly [key: string]: PropertyDraftLeafType | PropertyDraftSchema };

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

export function propertyModuleAssignmentFingerprint(
  modules: readonly PropertyModuleAssignmentSubject[] | undefined
): string {
  return JSON.stringify((modules ?? [])
    .map((module) => [module.module_code, module.enabled, module.expire_time ?? null] as const)
    .sort((left, right) => {
      const leftKey = JSON.stringify(left);
      const rightKey = JSON.stringify(right);
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    }));
}

export function propertyOfflinePermissionFingerprint(input: {
  dataScope: string;
  enabledModules: readonly PropertyModuleAssignmentSubject[] | undefined;
  permissions: readonly string[];
}): string {
  return JSON.stringify({
    dataScope: input.dataScope,
    enabledModules: propertyModuleAssignmentFingerprint(input.enabledModules),
    permissions: [...input.permissions].sort()
  });
}

export function assertPropertyDraftMatchesSchema(
  value: unknown,
  schema: PropertyDraftSchema,
  path = "draft"
): asserts value is Record<string, unknown> {
  if (!isPlainRecord(value)) throw new Error(`offline draft object required at ${path}`);
  for (const [key, child] of Object.entries(value)) {
    const expected = schema[key];
    if (expected === undefined) throw new Error(`offline draft field is not allowlisted: ${path}.${key}`);
    if (typeof expected === "string") {
      const actual = child === null ? "null" : typeof child;
      if (actual !== expected) throw new Error(`invalid offline draft value at ${path}.${key}`);
      continue;
    }
    assertPropertyDraftMatchesSchema(child, expected, `${path}.${key}`);
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || value instanceof Date) return false;
  if (typeof Blob !== "undefined" && value instanceof Blob) return false;
  return Object.getPrototypeOf(value) === Object.prototype;
}

export function createPropertyDraftEnvelope<T extends Record<string, unknown>>(
  context: PropertyDraftContext,
  value: T,
  schema: PropertyDraftSchema,
  options: { now?: number; entityVersion?: number | null } = {}
): PropertyDraftEnvelope<T> {
  assertPropertyDraftMatchesSchema(value, schema);
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
