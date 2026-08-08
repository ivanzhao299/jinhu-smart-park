import {
  ContentCard,
  DataTable,
  DataTableActions,
  PageShell
} from "@jinhu/ui";
import type { ComponentProps, HTMLAttributes, ReactNode } from "react";
import {
  projectPropertyRecord,
  type PropertyFieldDescriptor
} from "./property-records";
import styles from "./PropertyPageSurfaces.module.css";

export type { PropertyFieldDescriptor } from "./property-records";

export interface PropertyPageSurfaceProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
}

export function PropertyPageSurface({
  className = "",
  children,
  ...props
}: PropertyPageSurfaceProps) {
  return (
    <PageShell
      className={["ds-page", styles.accessibilitySurface, className].filter(Boolean).join(" ")}
      {...props}
    >
      {children}
    </PageShell>
  );
}

export type PropertyPanelSurfaceProps = ComponentProps<typeof ContentCard>;

export function PropertyPanelSurface({
  className = "",
  ...props
}: PropertyPanelSurfaceProps) {
  return (
    <ContentCard
      className={[
        "ds-panel",
        "ds-section-panel",
        styles.accessibilitySurface,
        className
      ].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

export function propertyAccessibleControlClassName(className = ""): string {
  return [styles.interactiveControl, className].filter(Boolean).join(" ");
}

export type PropertyRecordPresentation = "desktop" | "mobile";

export interface PropertyResponsiveRecordsProps<T> {
  items: readonly T[];
  fields: readonly PropertyFieldDescriptor<T>[];
  getKey: (item: T) => string;
  getTitle: (item: T) => ReactNode;
  label: string;
  renderActions?: (item: T, presentation: PropertyRecordPresentation) => ReactNode;
}

export function PropertyResponsiveRecords<T>({
  items,
  fields,
  getKey,
  getTitle,
  label,
  renderActions
}: PropertyResponsiveRecordsProps<T>) {
  const hasActions = Boolean(renderActions);

  return (
    <div className={styles.responsiveRecords}>
      <div className="ds-mobile-record-list" aria-label={`${label}移动列表`}>
        {items.map((item) => {
          const projected = projectPropertyRecord(item, fields);
          return (
            <article className="ds-mobile-record" key={getKey(item)}>
              <div className="ds-mobile-record-header">
                <strong>{getTitle(item)}</strong>
              </div>
              <dl>
                {projected.map((field) => (
                  <div key={field.key}>
                    <dt>{field.label}</dt>
                    <dd>{field.value}</dd>
                  </div>
                ))}
              </dl>
              {hasActions ? (
                <div className="ds-action-bar">
                  {renderActions?.(item, "mobile")}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      <DataTable aria-label={`${label}桌面列表`}>
        <thead>
          <tr>
            {fields.map((field) => <th key={field.key} scope="col">{field.label}</th>)}
            {hasActions ? <th scope="col">操作</th> : null}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const projected = projectPropertyRecord(item, fields);
            return (
              <tr key={getKey(item)}>
                {projected.map((field) => <td key={field.key}>{field.value}</td>)}
                {hasActions ? (
                  <td>
                    <DataTableActions>
                      {renderActions?.(item, "desktop")}
                    </DataTableActions>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </DataTable>
    </div>
  );
}
