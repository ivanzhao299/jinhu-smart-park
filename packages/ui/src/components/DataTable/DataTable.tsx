import {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
  type TableHTMLAttributes,
} from 'react';
import styles from './DataTable.module.css';

export type DataTableProps = TableHTMLAttributes<HTMLTableElement>;

type ElementWithChildren = ReactElement<{
  children?: ReactNode;
  className?: string;
  colSpan?: number;
  rowSpan?: number;
  scope?: string;
  'data-label'?: string;
}>;

function hasReadableText(children: ReactNode): boolean {
  return Children.toArray(children).some((child) => {
    if (typeof child === 'string' || typeof child === 'number') {
      return String(child).trim().length > 0;
    }
    if (!isValidElement(child)) return false;
    return hasReadableText((child.props as { children?: ReactNode }).children);
  });
}

function getNodeText(node: ReactNode): string {
  return Children.toArray(node).map((child) => {
    if (typeof child === 'string' || typeof child === 'number') return String(child);
    if (!isValidElement(child)) return '';
    return getNodeText((child.props as { children?: ReactNode }).children);
  }).join('').trim();
}

function isElementType(element: ReactElement, type: string): boolean {
  return typeof element.type === 'string' && element.type.toLowerCase() === type;
}

function extractHeaderLabels(children: ReactNode): string[] {
  let labels: string[] = [];

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (!isElementType(child, 'thead')) return;
    const thead = child as ElementWithChildren;
    Children.forEach(thead.props.children, (row) => {
      if (!isValidElement(row) || !isElementType(row, 'tr')) return;
      const tr = row as ElementWithChildren;
      const currentLabels: string[] = [];
      Children.forEach(tr.props.children, (cell) => {
        if (!isValidElement(cell) || !isElementType(cell, 'th')) return;
        const th = cell as ElementWithChildren;
        const label = getNodeText(th.props.children);
        const colSpan = Number(th.props.colSpan ?? 1);
        for (let index = 0; index < colSpan; index += 1) {
          currentLabels.push(label);
        }
      });
      if (currentLabels.length > labels.length) labels = currentLabels;
    });
  });

  return labels;
}

function enhanceTableCell(cell: ReactNode, headers: string[], cellIndex: number): ReactNode {
  if (!isValidElement(cell) || !isElementType(cell, 'td')) return cell;
  const td = cell as ElementWithChildren;
  if (td.props['data-label']) return td;
  const label = headers[cellIndex];
  if (!label) return td;
  return cloneElement(td, { 'data-label': label });
}

function enhanceTableRow(row: ReactNode, headers: string[]): ReactNode {
  if (!isValidElement(row) || !isElementType(row, 'tr')) return row;
  const tr = row as ElementWithChildren;
  let cellIndex = 0;
  const children = Children.map(tr.props.children, (cell) => {
    const enhanced = enhanceTableCell(cell, headers, cellIndex);
    if (isValidElement(cell) && isElementType(cell, 'td')) {
      const td = cell as ElementWithChildren;
      cellIndex += Number(td.props.colSpan ?? 1);
    }
    return enhanced;
  });
  return cloneElement(tr, { children });
}

function enhanceTableChildren(children: ReactNode): ReactNode {
  const headers = extractHeaderLabels(children);
  if (headers.length === 0) return children;

  return Children.map(children, (child) => {
    if (!isValidElement(child) || !isElementType(child, 'tbody')) return child;
    const tbody = child as ElementWithChildren;
    const rows = Children.map(tbody.props.children, (row) => enhanceTableRow(row, headers));
    return cloneElement(tbody, { children: rows });
  });
}

function getActionTone(label: string): string {
  if (/删除|作废|取消|关闭|驳回|忽略/.test(label)) return 'ds-row-action-danger';
  if (/编辑|调整|处理|审批|确认|启用|停用|提交/.test(label)) return 'ds-row-action-edit';
  if (/附件|上传|下载|导入|导出|文件|图片/.test(label)) return 'ds-row-action-file';
  if (/流转|状态|开始|完成|复查|下达|发布|同步|重置|生成/.test(label)) return 'ds-row-action-status';
  if (/日志|记录|历史|轨迹|时间线/.test(label)) return 'ds-row-action-history';
  return 'ds-row-action-view';
}

function enhanceActionChild(child: ReactNode): ReactNode {
  if (!isValidElement(child)) return child;

  const element = child as ReactElement<{
    'aria-label'?: string;
    children?: ReactNode;
    className?: string;
    title?: string;
  }>;
  const props = element.props;
  const label = props['aria-label'] || props.title || '';
  const existingClassNames = new Set((props.className || '').split(/\s+/).filter(Boolean));
  const toneClass = label ? getActionTone(label) : 'ds-row-action-view';
  const className = [
    existingClassNames.has('ds-row-action') ? '' : 'ds-row-action',
    existingClassNames.has(toneClass) ? '' : toneClass,
    props.className,
  ].filter(Boolean).join(' ');

  if (!label || hasReadableText(props.children)) {
    return cloneElement(element, { className });
  }

  return cloneElement(element, {
    className,
    children: (
      <>
        {props.children}
        <span className="ds-row-action-label">{label}</span>
      </>
    ),
  });
}

export const DataTable = forwardRef<HTMLTableElement, DataTableProps>(
  ({ children, className = '', ...props }, ref) => {
    const enhancedChildren = enhanceTableChildren(children);
    return (
      <div className={[styles.tableContainer, 'ds-table-shell'].join(' ')}>
        <table ref={ref} className={[styles.table, 'ds-data-table', className].filter(Boolean).join(' ')} {...props}>
          {enhancedChildren}
        </table>
      </div>
    );
  }
);

DataTable.displayName = 'DataTable';

export const DataTableActions = forwardRef<HTMLSpanElement, HTMLAttributes<HTMLSpanElement>>(
  ({ className = '', children, ...props }, ref) => {
    return (
      <span ref={ref} className={[styles.actions, 'data-table-actions', className].filter(Boolean).join(' ')} {...props}>
        {Children.map(children, enhanceActionChild)}
      </span>
    );
  }
);

DataTableActions.displayName = 'DataTableActions';
