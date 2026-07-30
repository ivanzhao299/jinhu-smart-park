"use client";

import type { PartyListItemResponse, PartyListResponse } from "@jinhu/shared";
import Link from "next/link";
import type { UrlObject } from "node:url";
import type { ReactNode } from "react";
import {
  PageState,
  PropertyPageSurface,
  PropertyPanelSurface,
  PropertyResponsiveRecords,
  encodeReturnContext,
  type PropertyFieldDescriptor,
  type PropertyPageState
} from "../../../features/property-shared";
import styles from "./PartyWorkbench.module.css";

const PAGE_SIZE = 20;

interface PartyWorkbenchViewProps {
  canCreate: boolean;
  canReadSensitive: boolean;
  createAction: ReactNode;
  draftKeyword: string;
  draftOrder: string;
  draftSort: string;
  draftType: string;
  fields: readonly PropertyFieldDescriptor<PartyListItemResponse>[];
  onDraftKeyword(value: string): void;
  onDraftOrder(value: string): void;
  onDraftSort(value: string): void;
  onDraftType(value: string): void;
  onReload(): Promise<void>;
  onUpdateQuery(page: number, keyword?: string, type?: string, sort?: string, order?: string): void;
  page: number;
  query: Record<string, string>;
  result: PartyListResponse | null;
  state: PropertyPageState;
}

export function PartyWorkbenchView(props: PartyWorkbenchViewProps) {
  const pages = Math.max(1, Math.ceil((props.result?.total ?? 0) / PAGE_SIZE));
  return (
    <PropertyPageSurface>
      <header className={`ds-hero ${styles.hero}`}>
        <div><p>共享房产底座</p><h1>业务相对方</h1>
          <p>民宿住客、住房租客及其他业务身份统一使用同一份 Party 档案。</p>
        </div>
        {props.canCreate ? <div className={styles.toolbar}>{props.createAction}</div> : null}
      </header>
      <PartyFilters {...props} />
      <div aria-hidden="true" id="party-list" />
      <PageState
        clearFiltersAction={<button className="ds-button" onClick={() => props.onUpdateQuery(1, "", "", "", "")} type="button">清除筛选</button>}
        retryAction={<button className="ds-button" onClick={() => void props.onReload()} type="button">重试</button>}
        state={props.state}
      >
        {props.result ? <PartyRecords {...props} pages={pages} result={props.result} /> : null}
      </PageState>
    </PropertyPageSurface>
  );
}

function PartyFilters(props: PartyWorkbenchViewProps) {
  function clear() {
    props.onDraftKeyword(""); props.onDraftType(""); props.onDraftSort(""); props.onDraftOrder("");
    props.onUpdateQuery(1, "", "", "", "");
  }
  return (
    <PropertyPanelSurface>
      <form className={styles.filters} onSubmit={(event) => {
        event.preventDefault(); props.onUpdateQuery(
          1, props.draftKeyword.trim(), props.draftType, props.draftSort, props.draftOrder
        );
      }}>
        <label>关键词<input maxLength={200} onChange={(event) => props.onDraftKeyword(event.target.value)}
          placeholder={props.canReadSensitive ? "姓名或手机号" : "名称"} value={props.draftKeyword} /></label>
        <label>相对方类型<select onChange={(event) => props.onDraftType(event.target.value)} value={props.draftType}>
          <option value="">全部</option><option value="person">个人</option><option value="organization">组织</option>
        </select></label>
        <label>排序字段<select onChange={(event) => props.onDraftSort(event.target.value)} value={props.draftSort}>
          <option value="">默认排序</option><option value="displayName">名称</option>
          <option value="createTime">创建时间</option><option value="verificationStatus">核验状态</option>
        </select></label>
        <label>排序方向<select onChange={(event) => props.onDraftOrder(event.target.value)} value={props.draftOrder}>
          <option value="">默认方向</option><option value="asc">升序</option><option value="desc">降序</option>
        </select></label>
        <button className="ds-button ds-button-primary" type="submit">查询</button>
        <button className="ds-button" onClick={clear} type="button">清除</button>
      </form>
    </PropertyPanelSurface>
  );
}

function PartyRecords(props: PartyWorkbenchViewProps & { pages: number; result: PartyListResponse }) {
  return <>
    <PropertyResponsiveRecords
      fields={props.fields} getKey={(item) => item.id} getTitle={(item) => item.displayName}
      items={props.result.items} label="业务相对方"
      renderActions={(item) => <Link className="ds-button" href={detailHref(item.id, props.query)}>查看详情</Link>}
    />
    <nav aria-label="业务相对方分页" className={styles.pagination}>
      <span>共 {props.result.total} 条，第 {props.result.page}/{props.pages} 页</span>
      <div className={styles.actions}>
        <button className="ds-button" disabled={props.page <= 1} onClick={() => props.onUpdateQuery(props.page - 1)} type="button">上一页</button>
        <button className="ds-button" disabled={props.page >= props.pages} onClick={() => props.onUpdateQuery(props.page + 1)} type="button">下一页</button>
      </div>
    </nav>
  </>;
}

function detailHref(id: string, query: Record<string, string>): UrlObject {
  const returnTo = encodeReturnContext({ route: "parties", query, scrollAnchor: "party-list" });
  return {
    pathname: `/assets/parties/${encodeURIComponent(id)}`,
    query: { returnTo }
  };
}
