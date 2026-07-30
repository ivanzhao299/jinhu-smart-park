export interface TaskFilterChip {
  id: string;
  label: string;
  count: number;
  active: boolean;
  authorized?: boolean;
}

export interface TaskStaleProjection {
  isStale: boolean;
  label: string;
  generatedAt?: string;
}

export interface TaskLightAction<T> {
  id: string;
  label: string;
  authorized: boolean;
  disabled?: boolean;
  invoke: (item: T) => void;
}

export function visibleTaskFilters(
  filters: readonly TaskFilterChip[]
): TaskFilterChip[] {
  return filters.filter((filter) => filter.authorized !== false);
}

export function visibleTaskActions<T>(
  actions: readonly TaskLightAction<T>[]
): TaskLightAction<T>[] {
  return actions.filter((action) => action.authorized);
}

export function invokeTaskAction<T>(
  action: TaskLightAction<T>,
  item: T
): boolean {
  if (!action.authorized || action.disabled) return false;
  action.invoke(item);
  return true;
}

export function taskStaleText(stale?: TaskStaleProjection): string | null {
  if (!stale?.isStale) return null;
  return stale.generatedAt
    ? `${stale.label}（数据时间：${stale.generatedAt}）`
    : stale.label;
}
