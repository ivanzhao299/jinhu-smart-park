import type { ReactNode } from "react";
import { LiveRegion } from "./LiveRegion";
import {
  type PageState as PageStateValue,
  pageStateAnnouncement
} from "./page-state";

export interface PageStateProps {
  state: PageStateValue;
  children?: ReactNode;
  retryAction?: ReactNode;
  clearFiltersAction?: ReactNode;
  changeScopeAction?: ReactNode;
  className?: string;
}

export function PageState({
  state,
  children,
  retryAction,
  clearFiltersAction,
  changeScopeAction,
  className
}: PageStateProps) {
  const announcement = pageStateAnnouncement(state);
  const liveMode = state.kind === "initial-failure" || state.kind === "conflict"
    ? "assertive"
    : "polite";

  return (
    <section
      aria-busy={state.kind === "initial-loading" || state.kind === "submitting"}
      className={["ds-panel", className ?? ""].filter(Boolean).join(" ")}
    >
      <LiveRegion
        dedupeKey={`${state.kind}:${announcement}`}
        message={announcement}
        mode={liveMode}
      />
      {renderPageState({
        state,
        children,
        retryAction,
        clearFiltersAction,
        changeScopeAction
      })}
    </section>
  );
}

interface PageStateRenderInput {
  state: PageStateValue;
  children?: ReactNode;
  retryAction?: ReactNode;
  clearFiltersAction?: ReactNode;
  changeScopeAction?: ReactNode;
}

function renderPageState(input: PageStateRenderInput): ReactNode {
  switch (input.state.kind) {
    case "initial-loading":
      return <p>正在加载…</p>;
    case "initial-failure":
      return <StateMessage title="页面加载失败" message={input.state.message} action={input.retryAction} />;
    case "empty-initial":
      return <StateMessage title="从第一条记录开始" message="当前还没有记录。" />;
    case "empty-filtered":
      return <StateMessage title="没有匹配结果" message="请调整或清除筛选条件。" action={input.clearFiltersAction} />;
    case "empty-scope":
      return <StateMessage title="当前范围暂无内容" message="可切换管理范围后重试。" action={input.changeScopeAction} />;
    case "ready":
      return input.children;
    case "forbidden-full":
      return <StateMessage title="无法查看页面内容" message="你没有查看此页面内容的权限。" />;
    case "forbidden-partial":
      return (
        <>
          <StateMessage title="部分内容未显示" message={input.state.message ?? "部分内容受权限限制。"} />
          {input.children}
        </>
      );
    case "refresh-failure":
      return (
        <>
          <StateMessage title="刷新失败" message={input.state.message} action={input.retryAction} />
          {input.children}
        </>
      );
    case "offline-stale":
      return (
        <>
          <StateMessage title="当前处于离线状态" message={input.state.message ?? "正在显示最近一次保存的内容。"} />
          {input.children}
        </>
      );
    case "conflict":
      return <StateMessage title="内容已发生变化" message={input.state.message} action={input.retryAction} />;
    case "submitting":
      return (
        <>
          <StateMessage title="正在提交" message={input.state.message ?? "请勿重复操作。"} />
          {input.children}
        </>
      );
    case "success":
      return (
        <>
          <StateMessage title="操作成功" message={input.state.message} />
          {input.children}
        </>
      );
    default:
      return assertNever(input.state);
  }
}

function StateMessage({
  title,
  message,
  action
}: {
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div>
      <h2>{title}</h2>
      <p>{message}</p>
      {action}
    </div>
  );
}

function assertNever(value: never): never {
  throw new Error(`Unhandled page state: ${JSON.stringify(value)}`);
}
