import type { EngineeringPlan, EngineeringPlanTreeNode } from "./engineering-plans-types";

export function buildEngineeringPlanTree(plans: EngineeringPlan[]): EngineeringPlanTreeNode[] {
  const nodes = new Map<string, EngineeringPlanTreeNode>();
  for (const plan of plans) {
    nodes.set(plan.id, { ...plan, children: [], depth: 0 });
  }

  const roots: EngineeringPlanTreeNode[] = [];
  for (const node of nodes.values()) {
    if (node.parentPlanId && nodes.has(node.parentPlanId)) {
      const parent = nodes.get(node.parentPlanId);
      parent?.children.push(node);
      continue;
    }
    roots.push(node);
  }

  const sortNodes = (items: EngineeringPlanTreeNode[], depth = 0) => {
    items.sort((left, right) => left.sortOrder - right.sortOrder || left.createTime.localeCompare(right.createTime));
    for (const item of items) {
      item.depth = depth;
      sortNodes(item.children, depth + 1);
    }
  };
  sortNodes(roots);
  return roots;
}

export function flattenEngineeringPlanTree(nodes: EngineeringPlanTreeNode[]): EngineeringPlanTreeNode[] {
  const rows: EngineeringPlanTreeNode[] = [];
  const visit = (items: EngineeringPlanTreeNode[]) => {
    for (const item of items) {
      rows.push(item);
      visit(item.children);
    }
  };
  visit(nodes);
  return rows;
}

export function validatePlanDateRange(startDate?: string, endDate?: string): string {
  if (startDate && endDate && endDate < startDate) {
    return "计划结束日期不能早于计划开始日期";
  }
  return "";
}

export function validateActualDateRange(startDate?: string, endDate?: string): string {
  if (startDate && endDate && endDate < startDate) {
    return "实际结束日期不能早于实际开始日期";
  }
  return "";
}

export function validatePlanProgress(value: string | number): string {
  const progress = Number(value);
  if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
    return "计划进度必须在 0 到 100 之间";
  }
  return "";
}

export function validatePlanWeight(value: string | number): string {
  if (String(value).trim() === "") return "";
  const weight = Number(value);
  if (!Number.isFinite(weight) || weight < 0) {
    return "计划权重不能为负数";
  }
  return "";
}
