import { type FC, type CSSProperties } from 'react';
import styles from './ShareBar.module.css';

export interface ShareBarRow {
  name: string;
  amount: string;
  /** 0-100，可选；不传则按 maxAmount 内部计算 */
  ratio?: number;
  orderCount?: number;
}

export interface ShareBarProps {
  rows: ShareBarRow[];
  /** rows 中金额最大值，用于未传 ratio 时按比例渲染 */
  maxAmount?: number;
  /** 金额格式化 */
  formatAmount?: (amount: string) => string;
  className?: string;
  'aria-label'?: string;
}

function toNum(v: string): number {
  const n = Number(String(v).replace(/[,¥￥\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/**
 * 轻量水平占比条形（纯 CSS Modules，设计令牌，无图表库）。
 * 每行：名称 + 金额 + 轨道条（按 ratio/maxAmount 填充）。
 * 宽度通过 CSS 变量 --share-pct 注入，避免页面级 inline 颜色/样式。
 */
export const ShareBar: FC<ShareBarProps> = ({ rows, maxAmount, formatAmount, className = '', ...rest }) => {
  const classNames = [styles.wrap, className].filter(Boolean).join(' ');
  const max = maxAmount ?? Math.max(1, ...rows.map((r) => toNum(r.amount)));
  return (
    <ul className={classNames} aria-label={rest['aria-label'] ?? '占比条形'}>
      {rows.map((row) => {
        const pct = typeof row.ratio === 'number'
          ? Math.max(0, Math.min(100, row.ratio))
          : Math.max(0, Math.min(100, (toNum(row.amount) / max) * 100));
        const vars = { '--share-pct': `${pct}%` } as CSSProperties;
        return (
          <li key={row.name} className={styles.row} style={vars}>
            <div className={styles.head}>
              <span className={styles.name}>{row.name}</span>
              <span className={styles.value}>
                {formatAmount ? formatAmount(row.amount) : row.amount}
                {typeof row.orderCount === 'number' ? <em className={styles.sub}> · {row.orderCount} 单</em> : null}
              </span>
            </div>
            <div className={styles.track}>
              <div className={styles.fill} />
            </div>
          </li>
        );
      })}
    </ul>
  );
};

ShareBar.displayName = 'ShareBar';
