import {
  PROPERTY_ACCESS_MANIFEST,
  PROPERTY_BUSINESS_COMPATIBILITY_REDIRECTS,
  PROPERTY_BUSINESS_LANDING,
  PROPERTY_BUSINESS_SURFACES,
  type PropertyAccessManifestEntry,
  type PropertyBusinessModuleCode,
  type PropertyBusinessSurfaceRoute,
  type PropertyDataDimension,
  type PropertyFieldProjection,
  type PropertyFilePolicy,
  type UserDataScopeContext,
  type UserContext
} from "@jinhu/shared";

type CapabilityUser = Pick<
  UserContext,
  | "id"
  | "tenant_id"
  | "park_id"
  | "permissions"
  | "is_super"
  | "enabled_modules"
  | "data_scope"
  | "data_scopes"
  | "field_policies"
>;

export interface PropertyFileCapability {
  readonly canRead: boolean;
  readonly canDownload: boolean;
  readonly canUpload: boolean;
  readonly canDelete: boolean;
}

export interface PropertyActionCapability {
  readonly allowed: boolean;
  readonly approvalRequired: boolean;
  readonly blockedUntilTrackB: boolean;
}

export interface PropertyCapabilityProjection {
  featureId: string | null;
  moduleAvailable: boolean;
  pageAllowed: boolean;
  actionAllowed(actionId: string): boolean;
  actionCapability(actionId: string): PropertyActionCapability;
  fieldProjection(field: string): PropertyFieldProjection;
  fileCapability(bizType: string): PropertyFileCapability;
  dataDimensions: readonly PropertyDataDimension[];
  invalidationKey: string;
}

const DENIED_FILE_CAPABILITY: PropertyFileCapability = Object.freeze({
  canRead: false,
  canDownload: false,
  canUpload: false,
  canDelete: false
});

function hasPermission(user: CapabilityUser | null, permission: string | undefined): boolean {
  if (!user || !permission) return false;
  return user.is_super === true
    || user.permissions.includes("*")
    || user.permissions.includes(permission);
}

function hasAllPermissions(
  user: CapabilityUser | null,
  permissions: readonly string[] | undefined
): boolean {
  return (permissions ?? []).every((permission) => hasPermission(user, permission));
}

function hasAnyPermission(
  user: CapabilityUser | null,
  permissions: readonly string[] | undefined
): boolean {
  return !permissions?.length
    || permissions.some((permission) => hasPermission(user, permission));
}

function enabledModuleCodes(user: CapabilityUser | null): Set<string> {
  return new Set(
    (user?.enabled_modules ?? [])
      .filter((module) => module.enabled !== false)
      .map((module) => module.module_code)
  );
}

function isModuleAvailable(
  user: CapabilityUser | null,
  entry: PropertyAccessManifestEntry
): boolean {
  if (!user) return false;
  const modules = enabledModuleCodes(user);
  return modules.has(entry.module.required)
    && entry.module.dependencies.every((dependency) => modules.has(dependency));
}

function allowedDataDimensions(
  entry: PropertyAccessManifestEntry,
  scopes: readonly UserDataScopeContext[],
  fallbackScope: string | undefined
): readonly PropertyDataDimension[] {
  if (scopes.length > 0) {
    return entry.data.dimensions.filter((dimension) =>
      scopes.some((scope) =>
        scope.dimension === dimension
        || scope.dimension === "tenant"
        || scope.dimension === "park"
      )
    );
  }
  if (!fallbackScope) return [];
  return entry.data.dimensions.filter((dimension) =>
    dimension !== "owner" && dimension !== "assignee"
  );
}

function findFilePolicy(
  entry: PropertyAccessManifestEntry,
  bizType: string
): PropertyFilePolicy | undefined {
  return entry.files.find((policy) => policy.bizTypes.includes(bizType));
}

function projectFileCapability(
  user: CapabilityUser | null,
  policy: PropertyFilePolicy | undefined
): PropertyFileCapability {
  if (!user || !policy) return DENIED_FILE_CAPABILITY;
  const domainRead = hasPermission(user, policy.readPermission)
    || (policy.readAnyPermissions ?? []).some((permission) => hasPermission(user, permission));
  const canRead = domainRead && hasPermission(user, policy.genericReadPermission);
  return {
    canRead,
    canDownload: canRead && hasPermission(user, policy.genericDownloadPermission),
    canUpload: hasPermission(user, policy.uploadPermission)
      && hasPermission(user, policy.genericUploadPermission),
    canDelete: hasPermission(user, policy.deletePermission)
      && hasPermission(user, policy.genericDeletePermission)
  };
}

function projectField(
  user: CapabilityUser | null,
  entry: PropertyAccessManifestEntry,
  field: string
): PropertyFieldProjection {
  const policy = entry.fields.find((candidate) => candidate.field === field);
  if (!policy || (policy.readPermission && !hasPermission(user, policy.readPermission))) {
    return "omitted";
  }
  const runtimePolicies = (user?.field_policies ?? []).filter(
    (candidate) =>
      candidate.module === entry.module.required
      && candidate.field_key === field
  );
  if (runtimePolicies.some((candidate) => candidate.policy_type === "hidden")) {
    return "omitted";
  }
  if (runtimePolicies.some((candidate) => candidate.policy_type === "masked")) {
    return "masked";
  }
  if (runtimePolicies.some((candidate) => candidate.policy_type === "readonly")) {
    return policy.projection === "masked" ? "masked" : "readonly";
  }
  return policy.projection;
}

function stableValues(values: readonly string[] | undefined): readonly string[] {
  return [...new Set(values ?? [])].sort();
}

function stableUnknown(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableUnknown);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableUnknown(entry)])
    );
  }
  return value;
}

function stableFingerprint(value: unknown): string {
  const source = JSON.stringify(stableUnknown(value));
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function createInvalidationKey(user: CapabilityUser | null): string {
  if (!user) return "property-capabilities:anonymous";
  return JSON.stringify({
    user: user.id,
    tenant: user.tenant_id,
    park: user.park_id,
    permissions: stableValues(user.permissions),
    modules: stableValues(
      (user.enabled_modules ?? [])
        .filter((module) => module.enabled !== false)
        .map((module) => module.module_code)
    ),
    scopes: [...(user.data_scopes ?? [])]
      .map((scope) =>
        JSON.stringify({
          dimension: scope.dimension,
          type: scope.scope_type,
          rule: scope.rule_code ?? "",
          configHash: stableFingerprint(scope.scope_config ?? null)
        })
      )
      .sort(),
    fallbackScope: user.data_scope ?? "",
    super: user.is_super === true,
    fieldPolicies: [...(user.field_policies ?? [])]
      .map((policy) =>
        `${policy.module}:${policy.entity}:${policy.field_key}:${policy.policy_type}:${policy.mask_rule ?? ""}`
      )
      .sort()
  });
}

export function projectPropertyCapabilities(
  user: CapabilityUser | null,
  featureId: string
): PropertyCapabilityProjection {
  const entry = PROPERTY_ACCESS_MANIFEST.find((item) => item.featureId === featureId);
  const moduleAvailable = Boolean(entry && isModuleAvailable(user, entry));
  const pageAllowed = Boolean(
    entry
    && moduleAvailable
    && hasPermission(user, entry.surface.pageCode)
  );
  const actionCapability = (actionId: string): PropertyActionCapability => {
    const action = entry?.actions.find((candidate) => candidate.actionId === actionId);
    if (!action) {
      return { allowed: false, approvalRequired: false, blockedUntilTrackB: false };
    }
    const approvalRequired = action.approvalPolicy.requirement === "required";
    const blockedUntilTrackB =
      action.approvalPolicy.enforcement === "blocked-until-track-b";
    const permissionsAllowed = hasPermission(user, action.permission)
      && hasAllPermissions(user, action.requiredPermissions)
      && hasAnyPermission(user, action.anyPermissions);
    return {
      allowed: pageAllowed && permissionsAllowed && !blockedUntilTrackB,
      approvalRequired,
      blockedUntilTrackB
    };
  };

  return {
    featureId: entry?.featureId ?? null,
    moduleAvailable,
    pageAllowed,
    actionAllowed(actionId) {
      return actionCapability(actionId).allowed;
    },
    actionCapability,
    fieldProjection(field) {
      if (!entry || !pageAllowed) return "omitted";
      return projectField(user, entry, field);
    },
    fileCapability(bizType) {
      if (!entry || !pageAllowed) return DENIED_FILE_CAPABILITY;
      return projectFileCapability(user, findFilePolicy(entry, bizType));
    },
    dataDimensions: entry && pageAllowed
      ? allowedDataDimensions(
          entry,
          user?.data_scopes ?? [],
          user?.data_scope
        )
      : [],
    invalidationKey: createInvalidationKey(user)
  };
}

interface ResolvedSurfaceRoute {
  kind: "surface" | "detail";
  featureId: string;
  moduleCode: PropertyBusinessModuleCode;
  pagePermission: string;
  routePattern: string;
  canonicalRoute: string;
  params: Readonly<Record<string, string>>;
}

interface ResolvedLegacyRoute {
  kind: "legacy";
  moduleCode: PropertyBusinessModuleCode;
  legacyPermission: string;
  routePattern: string;
}

interface ResolvedCompatibilityRoute {
  kind: "compatibility-redirect";
  sourcePagePermission: string;
  routePattern: string;
  redirectTo: string;
  targetAuthorization: "canonical-target";
  params: Readonly<Record<string, string>>;
}

interface UnknownPropertyRoute {
  kind: "unknown-property";
}

interface NonPropertyRoute {
  kind: "non-property";
}

export type PropertyRouteResolution =
  | ResolvedSurfaceRoute
  | ResolvedLegacyRoute
  | ResolvedCompatibilityRoute
  | UnknownPropertyRoute
  | NonPropertyRoute;

interface PatternMatch {
  params: Readonly<Record<string, string>>;
}

const UNSAFE_ROUTE_ENCODING = /%(?:2e|2f|5c)/i;
const ENCODED_OCTET = /%[0-9a-f]{2}/i;
const MAX_ROUTE_DECODE_DEPTH = 4;

function isUnsafeDecodedSegment(segment: string): boolean {
  return !segment
    || segment === "."
    || segment === ".."
    || segment.includes("/")
    || segment.includes("\\")
    || segment.includes("[")
    || segment.includes("]")
    || [...segment].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    });
}

function safeRouteSegment(segment: string): string | null {
  if (
    !segment
    || segment === "."
    || segment === ".."
    || segment.includes("\\")
    || segment.includes("[")
    || segment.includes("]")
    || UNSAFE_ROUTE_ENCODING.test(segment)
  ) {
    return null;
  }
  try {
    let decoded = segment;
    for (let depth = 0; depth < MAX_ROUTE_DECODE_DEPTH; depth += 1) {
      decoded = decodeURIComponent(decoded);
      if (isUnsafeDecodedSegment(decoded) || UNSAFE_ROUTE_ENCODING.test(decoded)) {
        return null;
      }
      if (!ENCODED_OCTET.test(decoded)) return decoded;
    }
    return ENCODED_OCTET.test(decoded) ? null : decoded;
  } catch {
    return null;
  }
}

function matchRoutePattern(pattern: string, path: string): PatternMatch | null {
  const patternSegments = pattern.split("/");
  const pathSegments = path.split("/");
  if (patternSegments.length !== pathSegments.length) return null;

  const params: Record<string, string> = {};
  for (let index = 0; index < patternSegments.length; index += 1) {
    const expected = patternSegments[index];
    const actual = pathSegments[index];
    if (expected === undefined || actual === undefined) return null;
    const parameter = expected.match(/^\[([A-Za-z][A-Za-z0-9]*)\]$/);
    if (parameter) {
      const parameterName = parameter[1];
      const safeValue = safeRouteSegment(actual);
      if (!parameterName || !safeValue) return null;
      params[parameterName] = safeValue;
    } else if (expected !== actual) {
      return null;
    }
  }
  return { params };
}

function interpolateRoute(
  pattern: string,
  params: Readonly<Record<string, string>>
): string {
  return pattern.replace(/\[([A-Za-z][A-Za-z0-9]*)\]/g, (_match, key: string) =>
    encodeURIComponent(params[key] ?? "")
  );
}

function resolveSurface(path: string): ResolvedSurfaceRoute | null {
  for (const surface of PROPERTY_BUSINESS_SURFACES) {
    if (surface.route === path) {
      return {
        kind: "surface",
        featureId: surface.featureId,
        moduleCode: surface.moduleCode,
        pagePermission: surface.pageCode,
        routePattern: surface.route,
        canonicalRoute: surface.route,
        params: {}
      };
    }
    for (const detailRoute of surface.detailRoutes) {
      const match = matchRoutePattern(detailRoute, path);
      if (match) {
        return {
          kind: "detail",
          featureId: surface.featureId,
          moduleCode: surface.moduleCode,
          pagePermission: surface.pageCode,
          routePattern: detailRoute,
          canonicalRoute: surface.route,
          params: match.params
        };
      }
    }
  }
  return null;
}

function resolveCompatibility(path: string): ResolvedCompatibilityRoute | null {
  for (const redirect of PROPERTY_BUSINESS_COMPATIBILITY_REDIRECTS) {
    const match = matchRoutePattern(redirect.source, path);
    if (match) {
      return {
        kind: "compatibility-redirect",
        sourcePagePermission: redirect.sourcePagePermission,
        routePattern: redirect.source,
        redirectTo: interpolateRoute(redirect.target, match.params),
        targetAuthorization: redirect.targetAuthorization,
        params: match.params
      };
    }
  }
  return null;
}

function isPropertyNamespace(path: string): boolean {
  return /^\/(?:homestay|housing)(?:$|[/%\\])/i.test(path);
}

export function resolvePropertyRoute(rawPath: string): PropertyRouteResolution {
  const [rawPathname = "/"] = rawPath.split(/[?#]/, 1);
  const path = rawPathname || "/";
  if (!isPropertyNamespace(path)) return { kind: "non-property" };
  if (path.includes("\\") || UNSAFE_ROUTE_ENCODING.test(path)) {
    return { kind: "unknown-property" };
  }
  const compatibility = resolveCompatibility(path);
  if (compatibility) return compatibility;

  const surface = resolveSurface(path);
  if (surface) return surface;

  for (const landing of Object.values(PROPERTY_BUSINESS_LANDING)) {
    if (landing.legacyAlias === path) {
      return {
        kind: "legacy",
        moduleCode: landing.moduleCode,
        legacyPermission: landing.legacyPermission,
        routePattern: landing.legacyAlias
      };
    }
  }
  return { kind: "unknown-property" };
}

export function propertySurfaceCount(): number {
  return PROPERTY_BUSINESS_SURFACES.length;
}

export function propertyDetailRouteCount(): number {
  return PROPERTY_BUSINESS_SURFACES.reduce(
    (count, surface: PropertyBusinessSurfaceRoute) => count + surface.detailRoutes.length,
    0
  );
}
