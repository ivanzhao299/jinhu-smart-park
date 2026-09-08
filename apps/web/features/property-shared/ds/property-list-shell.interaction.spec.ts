import assert from "node:assert/strict";
import test from "node:test";
import type { ReactElement, ReactNode } from "react";

require.extensions[".css"] = (module: NodeModule) => {
  module.exports = new Proxy({}, { get: (_target, property) => String(property) });
};

const nodeModule = require("node:module") as { _load: (request: string, parent: unknown, isMain: boolean) => unknown };
const originalLoad = nodeModule._load;
nodeModule._load = (request, parent, isMain) => request === "@jinhu/ui"
  ? {
      DataTable: function DataTable() {},
      EmptyState: function EmptyState() {},
      FilterPanel: function FilterPanel() {},
      PageHeader: function PageHeader() {},
      PaginationBar: function PaginationBar() {}
    }
  : originalLoad(request, parent, isMain);
const { PropertyListShell } = require("./PropertyListShell") as typeof import("./PropertyListShell");
nodeModule._load = originalLoad;

function collectElements(node: ReactNode, result: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) {
    for (const child of node) collectElements(child, result);
    return result;
  }
  if (!node || typeof node !== "object" || !("props" in node)) return result;
  const element = node as ReactElement<Record<string, unknown>>;
  result.push(element);
  for (const value of Object.values(element.props)) collectElements(value as ReactNode, result);
  return result;
}

function textContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textContent).join("");
  if (!node || typeof node !== "object" || !("props" in node)) return "";
  return textContent((node as ReactElement<{ children?: ReactNode }>).props.children);
}

interface InteractionProps {
  onClick?: () => void;
  onPage?: (page: number) => void;
  page?: number;
  totalPages?: number;
}

test("property list shell wires filter, chip and pagination interactions", () => {
  const calls: string[] = [];
  const tree = PropertyListShell({
    title: "测试列表",
    filters: "筛选内容",
    filtersOpen: true,
    onFiltersOpenChange: (open) => calls.push(`filters:${open}`),
    onApplyFilters: () => calls.push("apply"),
    onResetFilters: () => calls.push("reset"),
    appliedFilterChips: [{ key: "status", label: "状态：待处理", onRemove: () => calls.push("remove") }],
    children: "记录",
    pagination: { page: 2, totalPages: 3, total: 21, onPage: (page) => calls.push(`page:${page}`) }
  });
  const elements = collectElements(tree);
  const button = (label: string) => elements.find((element) => element.type === "button" && textContent(element) === label);

  for (const label of ["收起筛选", "重置", "应用筛选", "状态：待处理 ×"]) {
    (button(label)?.props as InteractionProps | undefined)?.onClick?.();
  }

  const pagination = elements.find((element) => typeof element.type === "function" && element.type.name === "PaginationBar");
  assert.ok(pagination);
  const paginationProps = pagination.props as InteractionProps;
  assert.equal(paginationProps.page, 2);
  assert.equal(paginationProps.totalPages, 3);
  paginationProps.onPage?.(1);
  paginationProps.onPage?.(3);

  assert.deepEqual(calls, ["filters:false", "reset", "apply", "remove", "page:1", "page:3"]);
});
