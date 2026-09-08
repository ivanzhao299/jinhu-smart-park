import { FilterPanel, PageHeader, PaginationBar } from "@jinhu/ui";
import type { ReactNode } from "react";
import { PropertyPageSurface, PropertyPanelSurface } from "./PropertyPageSurfaces";
import styles from "./PropertyListShell.module.css";

export interface PropertyListFilterChip {
  key: string;
  label: ReactNode;
  onRemove?: () => void;
}

export interface PropertyListPagination {
  page: number;
  totalPages: number;
  total?: number;
  onPage: (page: number) => void;
}

export interface PropertyListShellProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  context?: ReactNode;
  actions?: ReactNode;
  filters?: ReactNode;
  filtersOpen?: boolean;
  onFiltersOpenChange?: (open: boolean) => void;
  onApplyFilters?: () => void;
  onResetFilters?: () => void;
  appliedFilterChips?: readonly PropertyListFilterChip[];
  summary?: ReactNode;
  listActions?: ReactNode;
  bulkActions?: ReactNode;
  children: ReactNode;
  emptyState?: ReactNode;
  pagination?: PropertyListPagination;
}

export function PropertyListShell({
  eyebrow,
  title,
  description,
  context,
  actions,
  filters,
  filtersOpen = true,
  onFiltersOpenChange,
  onApplyFilters,
  onResetFilters,
  appliedFilterChips = [],
  summary,
  listActions,
  bulkActions,
  children,
  emptyState,
  pagination
}: PropertyListShellProps) {
  const filterActions = onApplyFilters || onResetFilters ? (
    <>
      {onResetFilters ? <button className="secondary-button" type="button" onClick={onResetFilters}>重置</button> : null}
      {onApplyFilters ? <button className="primary-button" type="button" onClick={onApplyFilters}>应用筛选</button> : null}
    </>
  ) : undefined;

  return (
    <PropertyPageSurface>
      <PageHeader eyebrow={eyebrow} title={title} description={description} actions={actions}>
        {context ? <div className={styles.context}>{context}</div> : null}
      </PageHeader>

      {filters ? (
        <section className={styles.filterSection} aria-label="列表筛选">
          <button
            className={`secondary-button ${styles.filterToggle}`}
            type="button"
            aria-expanded={filtersOpen}
            onClick={() => onFiltersOpenChange?.(!filtersOpen)}
          >
            {filtersOpen ? "收起筛选" : "展开筛选"}
          </button>
          {filtersOpen ? <FilterPanel actions={filterActions}>{filters}</FilterPanel> : null}
          {appliedFilterChips.length > 0 ? (
            <div className={styles.chips} aria-label="已应用筛选">
              {appliedFilterChips.map((chip) => (
                chip.onRemove ? (
                  <button className={styles.chip} type="button" key={chip.key} onClick={chip.onRemove}>
                    {chip.label}<span aria-hidden="true"> ×</span>
                  </button>
                ) : <span className={styles.chip} key={chip.key}>{chip.label}</span>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {bulkActions ? <div className={styles.bulkBar} aria-label="批量操作">{bulkActions}</div> : null}

      <PropertyPanelSurface title={summary} actions={listActions}>
        {children}
        {emptyState}
        {pagination ? (
          <PaginationBar
            page={pagination.page}
            totalPages={Math.max(1, pagination.totalPages)}
            total={pagination.total}
            onPage={pagination.onPage}
          />
        ) : null}
      </PropertyPanelSurface>
    </PropertyPageSurface>
  );
}
