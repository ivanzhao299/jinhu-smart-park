export interface ReturnRouteDefinition {
  pathTemplate: string;
  allowedQueryKeys: readonly string[];
}

export interface ReturnContextPolicy {
  origin: string;
  fallbackHref: string;
  routes: Readonly<Record<string, ReturnRouteDefinition>>;
}

export interface StructuredReturnContext {
  route: string;
  entityId?: string;
  query?: Readonly<Record<string, string | readonly string[] | undefined>>;
  scrollAnchor?: string;
}

const ENTITY_ID_TOKEN = ":entityId";
const SAFE_ANCHOR = /^[A-Za-z][A-Za-z0-9_:.~-]{0,127}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isQueryValue(value: unknown): value is string | readonly string[] {
  return typeof value === "string"
    || (Array.isArray(value) && value.every((item) => typeof item === "string"));
}

function parseContext(value: unknown): StructuredReturnContext | null {
  if (!isRecord(value) || typeof value.route !== "string") {
    return null;
  }
  const entityId = value.entityId;
  const query = value.query;
  const scrollAnchor = value.scrollAnchor;
  if (entityId !== undefined && typeof entityId !== "string") {
    return null;
  }
  if (scrollAnchor !== undefined && typeof scrollAnchor !== "string") {
    return null;
  }
  if (query !== undefined) {
    if (!isRecord(query) || !Object.values(query).every(
      (queryValue) => queryValue === undefined || isQueryValue(queryValue)
    )) {
      return null;
    }
  }
  const normalizedEntityId = typeof entityId === "string" ? entityId : undefined;
  const normalizedScrollAnchor = typeof scrollAnchor === "string" ? scrollAnchor : undefined;
  const context: StructuredReturnContext = { route: value.route };
  if (normalizedEntityId !== undefined) {
    context.entityId = normalizedEntityId;
  }
  if (query !== undefined) {
    context.query = query as NonNullable<StructuredReturnContext["query"]>;
  }
  if (normalizedScrollAnchor !== undefined) {
    context.scrollAnchor = normalizedScrollAnchor;
  }
  return context;
}

function buildPath(
  definition: ReturnRouteDefinition,
  entityId: string | undefined
): string | null {
  const needsEntityId = definition.pathTemplate.includes(ENTITY_ID_TOKEN);
  if (needsEntityId && !entityId) {
    return null;
  }
  const path = needsEntityId
    ? definition.pathTemplate.replaceAll(ENTITY_ID_TOKEN, encodeURIComponent(entityId ?? ""))
    : definition.pathTemplate;
  return path.startsWith("/") && !path.startsWith("//") ? path : null;
}

export function encodeReturnContext(context: StructuredReturnContext): string {
  return encodeURIComponent(JSON.stringify(context));
}

export function decodeReturnContext(value: string): StructuredReturnContext | null {
  try {
    return parseContext(JSON.parse(decodeURIComponent(value)));
  } catch {
    return null;
  }
}

export function createReturnHref(
  context: StructuredReturnContext,
  policy: ReturnContextPolicy
): string {
  const definition = policy.routes[context.route];
  if (!definition) {
    return policy.fallbackHref;
  }
  const path = buildPath(definition, context.entityId);
  if (!path) {
    return policy.fallbackHref;
  }

  const url = new URL(path, policy.origin);
  const allowedKeys = new Set(definition.allowedQueryKeys);
  for (const [key, rawValue] of Object.entries(context.query ?? {})) {
    if (!allowedKeys.has(key) || rawValue === undefined) {
      continue;
    }
    const values = typeof rawValue === "string" ? [rawValue] : rawValue;
    for (const value of values) {
      url.searchParams.append(key, value);
    }
  }
  if (context.scrollAnchor && SAFE_ANCHOR.test(context.scrollAnchor)) {
    url.hash = context.scrollAnchor;
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function resolveReturnHref(
  encodedContext: string | null | undefined,
  policy: ReturnContextPolicy
): string {
  if (!encodedContext) {
    return policy.fallbackHref;
  }
  const context = decodeReturnContext(encodedContext);
  return context ? createReturnHref(context, policy) : policy.fallbackHref;
}

export function resolveSameOriginReturnHref(
  candidate: string | null | undefined,
  policy: ReturnContextPolicy
): string {
  if (!candidate) {
    return policy.fallbackHref;
  }
  try {
    const url = new URL(candidate, policy.origin);
    if (url.origin !== new URL(policy.origin).origin) {
      return policy.fallbackHref;
    }
    for (const route of Object.values(policy.routes)) {
      const escaped = route.pathTemplate
        .split(ENTITY_ID_TOKEN)
        .map(escapeRegularExpression)
        .join("[^/]+");
      if (new RegExp(`^${escaped}$`).test(url.pathname)) {
        const allowedKeys = new Set(route.allowedQueryKeys);
        const queryAllowed = [...url.searchParams.keys()].every((key) => allowedKeys.has(key));
        const anchorAllowed = !url.hash || SAFE_ANCHOR.test(url.hash.slice(1));
        return queryAllowed && anchorAllowed
          ? `${url.pathname}${url.search}${url.hash}`
          : policy.fallbackHref;
      }
    }
  } catch {
    return policy.fallbackHref;
  }
  return policy.fallbackHref;
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
