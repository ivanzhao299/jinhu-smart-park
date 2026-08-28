import type { UserContext, UserParkContext } from "@jinhu/shared";

const PARK_ROLE_RECOVERY_KEY = "jinhu_park_role_recovery_source";

export interface ParkRoleRecoverySource {
  userId: string;
  tenantId: string;
  parkId: string;
  parkName: string;
}

export function isCurrentParkAccessOnly(user: UserContext | null): boolean {
  return resolveCurrentPark(user)?.role_summary?.has_business_role === false;
}

export function updateParkRoleRecoverySource(
  previousUser: UserContext | null,
  nextUser: UserContext
): ParkRoleRecoverySource | null {
  if (!isCurrentParkAccessOnly(nextUser)) {
    clearParkRoleRecoverySource();
    return null;
  }
  if (!previousUser || previousUser.id !== nextUser.id || previousUser.tenant_id !== nextUser.tenant_id) {
    return readParkRoleRecoverySource(nextUser);
  }
  const previousPark = resolveCurrentPark(previousUser);
  const stillAccessible = nextUser.accessible_parks?.find((park) => (
    park.park_id === previousUser.park_id && park.status === "enabled"
  ));
  if (
    previousPark?.role_summary?.has_business_role !== true
    || !stillAccessible
    || previousUser.park_id === nextUser.park_id
  ) {
    return readParkRoleRecoverySource(nextUser);
  }
  const source: ParkRoleRecoverySource = {
    userId: nextUser.id,
    tenantId: nextUser.tenant_id,
    parkId: previousUser.park_id,
    parkName: previousPark.park_name
  };
  if (typeof window !== "undefined") {
    sessionStorage.setItem(PARK_ROLE_RECOVERY_KEY, JSON.stringify(source));
  }
  return source;
}

export function readParkRoleRecoverySource(user: UserContext | null): ParkRoleRecoverySource | null {
  if (typeof window === "undefined" || !user) return null;
  if (!isCurrentParkAccessOnly(user)) {
    clearParkRoleRecoverySource();
    return null;
  }
  const raw = sessionStorage.getItem(PARK_ROLE_RECOVERY_KEY);
  if (!raw) return null;
  try {
    const source = JSON.parse(raw) as Partial<ParkRoleRecoverySource>;
    const recoveryPark = user.accessible_parks?.find((park) => park.park_id === source.parkId);
    if (
      source.userId !== user.id
      || source.tenantId !== user.tenant_id
      || typeof source.parkId !== "string"
      || !source.parkId
      || source.parkId === user.park_id
      || typeof source.parkName !== "string"
      || recoveryPark?.status !== "enabled"
      || recoveryPark.role_summary?.has_business_role !== true
    ) {
      clearParkRoleRecoverySource();
      return null;
    }
    return source as ParkRoleRecoverySource;
  } catch {
    clearParkRoleRecoverySource();
    return null;
  }
}

export function clearParkRoleRecoverySource(): void {
  if (typeof window !== "undefined") sessionStorage.removeItem(PARK_ROLE_RECOVERY_KEY);
}

function resolveCurrentPark(user: UserContext | null): UserParkContext | null {
  if (!user) return null;
  if (user.current_park?.park_id === user.park_id) return user.current_park;
  return user.accessible_parks?.find((park) => park.park_id === user.park_id) ?? null;
}
