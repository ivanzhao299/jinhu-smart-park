import { type HTMLAttributes, type ReactNode } from 'react';
import styles from './Page.module.css';

type ShellElement = 'div' | 'main' | 'section';
type NoticeVariant = 'info' | 'warning' | 'danger';

interface PageShellProps extends HTMLAttributes<HTMLElement> {
  as?: ShellElement;
  children?: ReactNode;
}

export function PageShell({ as = 'main', className = '', ...props }: PageShellProps) {
  const classNames = [styles.pageShell, className].filter(Boolean).join(' ');
  if (as === 'section') return <section className={classNames} {...props} />;
  if (as === 'div') return <div className={classNames} {...props} />;
  return <main className={classNames} {...props} />;
}

interface PageHeaderProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ title, description, eyebrow, actions, className = '', children, ...props }: PageHeaderProps) {
  return (
    <section className={[styles.pageHeader, className].filter(Boolean).join(' ')} {...props}>
      <div className={styles.headerText}>
        {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
        <h1 className={styles.title}>{title}</h1>
        {description ? <p className={styles.description}>{description}</p> : null}
        {children}
      </div>
      {actions ? <ActionGroup>{actions}</ActionGroup> : null}
    </section>
  );
}

interface FilterPanelProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  actions?: ReactNode;
}

export function FilterPanel({ children, actions, className = '', ...props }: FilterPanelProps) {
  return (
    <div className={[styles.filterPanel, className].filter(Boolean).join(' ')} {...props}>
      {children}
      {actions ? <span className={styles.filterActions}>{actions}</span> : null}
    </div>
  );
}

interface ContentCardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}

export function ContentCard({ title, description, actions, className = '', children, ...props }: ContentCardProps) {
  const hasHeader = title || description || actions;
  return (
    <section className={[styles.contentCard, className].filter(Boolean).join(' ')} {...props}>
      {hasHeader ? (
        <div className={styles.contentHeader}>
          <div className={styles.contentTitleGroup}>
            {title ? <h2 className={styles.contentTitle}>{title}</h2> : null}
            {description ? <p className={styles.contentDescription}>{description}</p> : null}
          </div>
          {actions ? <ActionGroup>{actions}</ActionGroup> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function ActionGroup({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={[styles.actions, className].filter(Boolean).join(' ')} {...props} />;
}

interface FeedbackNoticeProps extends HTMLAttributes<HTMLDivElement> {
  variant?: NoticeVariant;
  icon?: ReactNode;
  children?: ReactNode;
}

export function FeedbackNotice({ variant = 'info', icon, className = '', children, ...props }: FeedbackNoticeProps) {
  const variantClass = variant === 'warning' ? styles.noticeWarning : variant === 'danger' ? styles.noticeDanger : styles.noticeInfo;
  return (
    <div className={[styles.notice, variantClass, className].filter(Boolean).join(' ')} role="status" {...props}>
      {icon}
      <span>{children}</span>
    </div>
  );
}

interface PaginationBarProps extends HTMLAttributes<HTMLDivElement> {
  page: number;
  totalPages: number;
  total?: number;
  onPage?: (page: number) => void;
  previous?: ReactNode;
  next?: ReactNode;
}

export function PaginationBar({ page, totalPages, total, onPage, previous, next, className = '', ...props }: PaginationBarProps) {
  const previousControl = previous ?? (
    <button className="secondary-button" type="button" disabled={!onPage || page <= 1} onClick={() => onPage?.(Math.max(1, page - 1))}>
      上一页
    </button>
  );
  const nextControl = next ?? (
    <button className="secondary-button" type="button" disabled={!onPage || page >= totalPages} onClick={() => onPage?.(Math.min(totalPages, page + 1))}>
      下一页
    </button>
  );

  return (
    <div className={[styles.pagination, className].filter(Boolean).join(' ')} {...props}>
      <span>
        {typeof total === 'number' ? `共 ${total} 条，` : null}
        第 {page} / {totalPages} 页
      </span>
      <span className={styles.paginationActions}>
        {previousControl}
        {nextControl}
      </span>
    </div>
  );
}
