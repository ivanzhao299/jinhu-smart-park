"use client";

import type { PaginatedResult } from "@jinhu/shared";
import Link from "next/link";
import type { FormEvent, ReactNode } from "react";
import {
  PageState,
  PropertyPageSurface,
  PropertyPanelSurface,
  PropertyResponsiveRecords,
  encodeReturnContext,
  type PropertyPageState
} from "../../../features/property-shared";
import type { projectPropertyCapabilities } from "../../../features/property-shared";
import type { HousingCollectionPageProps, HousingFilterDefinition } from "./HousingCollectionPage";
import styles from "./HousingWorkbench.module.css";

interface HousingCollectionViewProps<T> extends HousingCollectionPageProps<T> {
  active: Record<string, string>; capabilities: ReturnType<typeof projectPropertyCapabilities>;
  draft: Record<string, string>; filters: readonly HousingFilterDefinition[];
  load(): Promise<void>; page: number; query: Record<string, string>;
  result: PaginatedResult<T> | null; setDraft(value: Record<string, string>): void;
  state: PropertyPageState; update(page: number, values: Record<string, string>): void;
}

export function HousingCollectionView<T>(props: HousingCollectionViewProps<T>) {
  return (
    <PropertyPageSurface>
      <header className={`ds-hero ${styles.hero}`}>
        <div><p>住房出租工作台</p><h1>{props.title}</h1><p>{props.description}</p></div>
        {props.toolbar ? <div className={styles.heroActions}>{props.toolbar}</div> : null}
      </header>
      {props.filters.length ? <HousingFilters {...props} /> : null}
      <div aria-hidden="true" id="housing-list" />
      <PageState
        clearFiltersAction={<button className="ds-button" onClick={() => props.update(1, {})} type="button">清除筛选</button>}
        retryAction={<button className="ds-button" onClick={() => void props.load()} type="button">重试</button>}
        state={props.state}
      >
        {props.result ? <HousingRecords {...props} result={props.result} /> : null}
      </PageState>
    </PropertyPageSurface>
  );
}

function HousingFilters<T>(props: HousingCollectionViewProps<T>) {
  function change(key: string, value: string) { props.setDraft({ ...props.draft, [key]: value }); }
  function clear() {
    const empty = Object.fromEntries(props.filters.map((filter) => [filter.key, ""]));
    props.setDraft(empty); props.update(1, empty);
  }
  function submit(event: FormEvent) { event.preventDefault(); props.update(1, props.draft); }
  return (
    <PropertyPanelSurface>
      <form className={styles.filters} onSubmit={submit}>
        {props.filters.map((filter) => <FilterControl
          definition={filter} key={filter.key} onChange={(value) => change(filter.key, value)}
          value={props.draft[filter.key] ?? ""}
        />)}
        <button className="ds-button ds-button-primary" type="submit">应用筛选</button>
        <button className="ds-button" onClick={clear} type="button">清除</button>
      </form>
    </PropertyPanelSurface>
  );
}

function FilterControl({ definition, onChange, value }: {
  definition: HousingFilterDefinition; onChange(value: string): void; value: string;
}) {
  return (
    <label>{definition.label}
      {definition.options ? <select onChange={(event) => onChange(event.target.value)} value={value}>
        <option value="">全部</option>
        {definition.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select> : <input maxLength={100} onChange={(event) => onChange(event.target.value)}
        placeholder={definition.placeholder} value={value} />}
    </label>
  );
}

function HousingRecords<T>(props: HousingCollectionViewProps<T> & { result: PaginatedResult<T> }) {
  const totalPages = Math.max(1, Math.ceil(props.result.total / 20));
  const actions = props.detailHref || props.renderItemActions ? (item: T): ReactNode => {
    const href = props.detailHref?.(item);
    const returnTo = encodeReturnContext({ route: props.route, query: props.query, scrollAnchor: "housing-list" });
    return <div className={styles.actionBar}>
      {href ? <Link className="ds-button" href={{
        ...href, query: { returnTo }
      }}>查看详情</Link> : null}
      {props.renderItemActions?.(item, props.capabilities, props.load)}
    </div>;
  } : undefined;
  return <>
    <PropertyResponsiveRecords fields={props.fields} getKey={props.getKey}
      getTitle={props.getTitle} items={props.result.items} label={props.title} renderActions={actions} />
    <nav aria-label={`${props.title}分页`} className={styles.pagination}>
      <span>共 {props.result.total} 条，第 {props.result.page}/{totalPages} 页</span>
      <div className={styles.actionBar}>
        <button className="ds-button" disabled={props.page <= 1}
          onClick={() => props.update(props.page - 1, props.active)} type="button">上一页</button>
        <button className="ds-button" disabled={props.page >= totalPages}
          onClick={() => props.update(props.page + 1, props.active)} type="button">下一页</button>
      </div>
    </nav>
  </>;
}
