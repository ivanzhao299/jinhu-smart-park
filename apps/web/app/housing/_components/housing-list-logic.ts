import type { UserDataScopeContext } from "@jinhu/shared";

const UNRESTRICTED_SCOPE_TYPES = new Set(["all", "tenant", "park", "40", "50"]);

function stringIds(value: unknown): readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : [];
}

export function hasAuthoritativeEmptyUnitScope(
  scopes: readonly UserDataScopeContext[] | undefined,
  isSuper: boolean
): boolean {
  if (isSuper || !scopes?.length) return false;
  const relevant = scopes.filter((scope) =>
    scope.dimension === "unit"
    || scope.dimension === "tenant"
    || scope.dimension === "park"
  );
  if (!relevant.length || relevant.some((scope) => UNRESTRICTED_SCOPE_TYPES.has(scope.scope_type))) {
    return false;
  }
  const restricting = relevant.filter((scope) => {
    const config = scope.scope_config ?? {};
    return scope.dimension === "unit"
      || stringIds(config.unitIds).length > 0
      || stringIds(config.ids).length > 0
      || scope.scope_type === "self";
  });
  if (!restricting.length) return false;
  return restricting.every((scope) => {
    if (scope.scope_type === "self") return false;
    const config = scope.scope_config ?? {};
    return stringIds(config.unitIds).length === 0 && stringIds(config.ids).length === 0;
  });
}

export function returnToSearch(context: string): string {
  return new URLSearchParams({ returnTo: context }).toString();
}
