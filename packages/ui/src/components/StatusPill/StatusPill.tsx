import { type HTMLAttributes, type FC, type ReactNode } from 'react';
import styles from './StatusPill.module.css';

type StatusPillVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'primary' | 'muted';

interface DictItemLike {
  itemLabel?: string;
  itemValue?: string | number;
  tagType?: string | null;
}

export interface StatusPillProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: StatusPillVariant;
  children?: ReactNode;
  dictCode?: string;
  value?: string | number | null;
  dicts?: Record<string, DictItemLike[]>;
}

export const StatusPill: FC<StatusPillProps> = ({
  className = '',
  variant = 'default',
  children,
  dictCode,
  value,
  dicts,
  ...props
}) => {
  const dictItem = dictCode ? dicts?.[dictCode]?.find((item) => String(item.itemValue) === String(value)) : null;
  const displayVariant = normalizeVariant(dictItem?.tagType ?? variant);
  const content = children ?? dictItem?.itemLabel ?? value ?? "-";
  const classNames = [
    styles.statusPill,
    styles[displayVariant],
    className
  ].filter(Boolean).join(' ');

  return (
    <span className={classNames} {...props}>
      {content}
    </span>
  );
};

StatusPill.displayName = 'StatusPill';

function normalizeVariant(variant: string | null | undefined): StatusPillVariant {
  if (variant === 'success' || variant === 'warning' || variant === 'danger' || variant === 'info' || variant === 'primary' || variant === 'muted') {
    return variant;
  }
  return 'default';
}
