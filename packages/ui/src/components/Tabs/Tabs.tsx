import { type FC, type ReactNode } from 'react';
import styles from './Tabs.module.css';

export interface TabItem {
  value: string;
  label: ReactNode;
  count?: number;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  'aria-label'?: string;
}

/**
 * 分段控件 / 页签（segmented control）。只读受控组件，样式走设计令牌。
 */
export const Tabs: FC<TabsProps> = ({ items, value, onChange, className = '', ...rest }) => {
  const classNames = [styles.tabs, className].filter(Boolean).join(' ');
  return (
    <div className={classNames} role="tablist" aria-label={rest['aria-label'] ?? '视图切换'}>
      {items.map((item) => {
        const active = item.value === value;
        const btnClass = [styles.tab, active ? styles.active : ''].filter(Boolean).join(' ');
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            className={btnClass}
            onClick={() => onChange(item.value)}
          >
            <span className={styles.tabLabel}>{item.label}</span>
            {typeof item.count === 'number' ? <span className={styles.tabCount}>{item.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
};

Tabs.displayName = 'Tabs';
