"use client";

import { EmptyState, FeedbackNotice, LoadingState, StatusPill } from "@jinhu/ui";
import type { Route as NextRoute } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  PropertyPanelSurface,
  PropertyResponsiveRecords,
  propertyAccessibleControlClassName,
  type PropertyFieldDescriptor,
  type PropertyRecordPresentation
} from "../ds/PropertyPageSurfaces";
import {
  invokeTaskAction,
  taskStaleText,
  visibleTaskActions,
  visibleTaskFilters,
  type TaskFilterChip,
  type TaskLightAction,
  type TaskStaleProjection
} from "./task-presentation";
import styles from "./TaskPresentation.module.css";

export interface TaskPresentationProps<T> {
  title: ReactNode;
  description?: ReactNode;
  label: string;
  items: readonly T[];
  count: number;
  fields: readonly PropertyFieldDescriptor<T>[];
  filters?: readonly TaskFilterChip[];
  stale?: TaskStaleProjection;
  loading?: boolean;
  emptyTitle?: ReactNode;
  emptyDescription?: ReactNode;
  getKey: (item: T) => string;
  getTitle: (item: T) => ReactNode;
  getHref: (item: T) => string;
  lightActions?: (item: T) => readonly TaskLightAction<T>[];
  onFilterSelect?: (filterId: string) => void;
  className?: string;
}

export function TaskPresentation<T>({
  title,
  description,
  label,
  items,
  count,
  fields,
  filters = [],
  stale,
  loading = false,
  emptyTitle = "暂无待处理任务",
  emptyDescription = "符合当前服务端筛选条件的任务会显示在这里。",
  getKey,
  getTitle,
  getHref,
  lightActions,
  onFilterSelect,
  className
}: TaskPresentationProps<T>) {
  const staleText = taskStaleText(stale);
  const allowedFilters = visibleTaskFilters(filters);

  return (
    <PropertyPanelSurface
      className={className}
      title={title}
      description={description}
      actions={<StatusPill value={`${count} 项`} />}
    >
      {allowedFilters.length > 0 ? (
        <div className={styles.filters} aria-label={`${label}筛选`}>
          {allowedFilters.map((filter) => (
            <button
              aria-pressed={filter.active}
              className={propertyAccessibleControlClassName(
                filter.active ? "primary-button" : "secondary-button"
              )}
              disabled={!onFilterSelect}
              key={filter.id}
              type="button"
              onClick={() => onFilterSelect?.(filter.id)}
            >
              {filter.label}
              <span className="ds-count-badge">{filter.count}</span>
            </button>
          ))}
        </div>
      ) : null}

      {staleText ? <FeedbackNotice variant="warning">{staleText}</FeedbackNotice> : null}
      {loading ? <LoadingState title="正在加载任务" /> : null}
      {!loading && items.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : null}
      {!loading && items.length > 0 ? (
        <PropertyResponsiveRecords
          fields={fields}
          getKey={getKey}
          getTitle={(item) => (
            <Link
              className={propertyAccessibleControlClassName()}
              href={getHref(item) as NextRoute}
            >
              {getTitle(item)}
            </Link>
          )}
          items={items}
          label={label}
          renderActions={(item, presentation) => renderTaskActions(
            item,
            presentation,
            getHref,
            lightActions
          )}
        />
      ) : null}
    </PropertyPanelSurface>
  );
}

function renderTaskActions<T>(
  item: T,
  presentation: PropertyRecordPresentation,
  getHref: (item: T) => string,
  lightActions?: (item: T) => readonly TaskLightAction<T>[]
) {
  const actions = visibleTaskActions(lightActions?.(item) ?? []);
  const actionClassName = propertyAccessibleControlClassName("secondary-button");
  const controls = [
    <Link className={actionClassName} href={getHref(item) as NextRoute} key="detail">
      查看详情
    </Link>,
    ...actions.map((action) => (
      <button
        className={actionClassName}
        disabled={action.disabled}
        key={action.id}
        type="button"
        onClick={() => invokeTaskAction(action, item)}
      >
        {action.label}
      </button>
    ))
  ];

  return presentation === "mobile" ? (
    <div className={styles.actions} data-presentation={presentation}>
      {controls}
    </div>
  ) : controls;
}
