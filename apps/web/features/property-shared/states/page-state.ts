export type PageStateKind =
  | "initial-loading"
  | "initial-failure"
  | "empty-initial"
  | "empty-filtered"
  | "empty-scope"
  | "ready"
  | "forbidden-full"
  | "forbidden-partial"
  | "refresh-failure"
  | "offline-stale"
  | "conflict"
  | "submitting"
  | "success";

export type PageState =
  | { kind: "initial-loading" }
  | { kind: "initial-failure"; message: string }
  | { kind: "empty-initial" }
  | { kind: "empty-filtered" }
  | { kind: "empty-scope" }
  | { kind: "ready" }
  | { kind: "forbidden-full" }
  | { kind: "forbidden-partial"; message?: string }
  | { kind: "refresh-failure"; message: string }
  | { kind: "offline-stale"; message?: string }
  | { kind: "conflict"; message: string }
  | { kind: "submitting"; message?: string }
  | { kind: "success"; message: string };

export function pageStateAnnouncement(state: PageState): string {
  switch (state.kind) {
    case "initial-loading":
      return "正在加载页面内容。";
    case "initial-failure":
      return `页面加载失败：${state.message}`;
    case "empty-initial":
      return "当前还没有记录。";
    case "empty-filtered":
      return "没有符合当前筛选条件的记录。";
    case "empty-scope":
      return "当前管理范围内没有可查看的记录。";
    case "ready":
      return "";
    case "forbidden-full":
      return "你没有查看此页面内容的权限。";
    case "forbidden-partial":
      return state.message ?? "部分内容因权限限制未显示。";
    case "refresh-failure":
      return `刷新失败，继续显示最近一次成功加载的内容：${state.message}`;
    case "offline-stale":
      return state.message ?? "网络不可用，当前显示缓存内容。";
    case "conflict":
      return `内容已发生变化：${state.message}`;
    case "submitting":
      return state.message ?? "正在提交，请稍候。";
    case "success":
      return state.message;
    default:
      return assertNever(state);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled page state: ${JSON.stringify(value)}`);
}
