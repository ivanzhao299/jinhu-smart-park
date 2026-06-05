import { type HTMLAttributes, type ReactNode } from 'react';
import styles from './State.module.css';

interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}

export function EmptyState({ title = '暂无数据', description, icon, action, compact = false, className = '', ...props }: EmptyStateProps) {
  return (
    <div className={[styles.empty, compact ? styles.compact : '', className].filter(Boolean).join(' ')} {...props}>
      {icon ? <span className={styles.icon}>{icon}</span> : null}
      <p className={styles.title}>{title}</p>
      {description ? <p className={styles.description}>{description}</p> : null}
      {action}
    </div>
  );
}

interface LoadingStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  description?: ReactNode;
}

export function LoadingState({ title = '加载中', description, className = '', ...props }: LoadingStateProps) {
  return (
    <div className={[styles.loading, className].filter(Boolean).join(' ')} {...props}>
      <span className={styles.loadingIndicator} aria-hidden="true" />
      <p className={styles.title}>{title}</p>
      {description ? <p className={styles.description}>{description}</p> : null}
    </div>
  );
}

interface ErrorStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

export function ErrorState({ title = '加载失败', description, action, className = '', ...props }: ErrorStateProps) {
  return (
    <div className={[styles.error, className].filter(Boolean).join(' ')} {...props}>
      <p className={styles.title}>{title}</p>
      {description ? <p className={styles.description}>{description}</p> : null}
      {action}
    </div>
  );
}
