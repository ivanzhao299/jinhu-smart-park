import { type HTMLAttributes, type FC, type ReactNode } from 'react';
import styles from './MetricCard.module.css';

export interface MetricCardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  label?: string;
  value: string | number;
  icon?: ReactNode;
}

export const MetricCard: FC<MetricCardProps> = ({
  className = '',
  title,
  label,
  value,
  icon,
  ...props
}) => {
  const displayTitle = title ?? label ?? "";

  return (
    <div className={[styles.metricCard, className].filter(Boolean).join(' ')} {...props}>
      <span className={styles.title}>
        {icon ? <span className={styles.icon}>{icon}</span> : null}
        {displayTitle}
      </span>
      <strong className={styles.value}>{value}</strong>
    </div>
  );
};

MetricCard.displayName = 'MetricCard';
