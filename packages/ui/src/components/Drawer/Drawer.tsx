"use client";

import {
  useEffect,
  type ButtonHTMLAttributes,
  type FormHTMLAttributes,
  type HTMLAttributes,
  type ReactNode
} from 'react';
import styles from './Drawer.module.css';

export interface DrawerProps extends HTMLAttributes<HTMLElement> {
  size?: 'md' | 'lg' | 'xl' | 'auto';
  as?: 'aside' | 'div' | 'section';
  onClose?: () => void;
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
}

export function Drawer({
  className = '',
  size = 'auto',
  as = 'section',
  onClose,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  ...props
}: DrawerProps) {
  useEffect(() => {
    if (!onClose || !closeOnEscape) return undefined;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose?.();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closeOnEscape, onClose]);

  const classNames = [
    styles.drawerPanel,
    size !== 'auto' ? styles[`size-${size}`] : '',
    className
  ].filter(Boolean).join(' ');

  const overlay = onClose && closeOnOverlayClick
    ? <button aria-label="关闭抽屉" className={styles.drawerBackdrop} data-drawer-backdrop="true" type="button" onClick={onClose} />
    : <div aria-hidden="true" className={styles.drawerBackdrop} />;

  return (
    <div className={styles.drawerRoot}>
      {overlay}
      {as === 'aside' ? <aside className={classNames} data-ui-drawer-panel="true" {...props} /> : null}
      {as === 'div' ? <div className={classNames} data-ui-drawer-panel="true" {...props} /> : null}
      {as === 'section' ? <section className={classNames} data-ui-drawer-panel="true" {...props} /> : null}
    </div>
  );
}

export interface DrawerHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  onClose?: () => void;
  closeIcon?: ReactNode;
  closeLabel?: string;
}

export function DrawerHeader({
  className = '',
  eyebrow,
  title,
  description,
  onClose,
  closeIcon = '×',
  closeLabel = '关闭',
  ...props
}: DrawerHeaderProps) {
  return (
    <div className={[styles.drawerHeader, className].filter(Boolean).join(' ')} {...props}>
      <div className={styles.drawerHeaderContent}>
        {eyebrow ? <span className={styles.drawerEyebrow}>{eyebrow}</span> : null}
        <h2 className={styles.drawerTitle}>{title}</h2>
        {description ? <p className={styles.drawerDescription}>{description}</p> : null}
      </div>
      {onClose ? (
        <button aria-label={closeLabel} className={styles.drawerCloseButton} type="button" onClick={onClose}>
          {closeIcon}
        </button>
      ) : null}
    </div>
  );
}

export function DrawerActions({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={[styles.drawerActions, className].filter(Boolean).join(' ')} {...props} />;
}

export function DrawerTabs({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={[styles.drawerTabs, className].filter(Boolean).join(' ')} {...props} />;
}

export interface DrawerTabButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export function DrawerTabButton({ className = '', active = false, ...props }: DrawerTabButtonProps) {
  const classNames = [
    styles.drawerTabButton,
    active ? styles.drawerTabButtonActive : '',
    className
  ].filter(Boolean).join(' ');

  return <button className={classNames} type="button" {...props} />;
}

export function DrawerForm({ className = '', ...props }: FormHTMLAttributes<HTMLFormElement>) {
  return <form className={[styles.drawerForm, className].filter(Boolean).join(' ')} {...props} />;
}

export interface DrawerSectionProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode;
}

export function DrawerSection({ className = '', title, children, ...props }: DrawerSectionProps) {
  return (
    <section className={[styles.drawerSection, className].filter(Boolean).join(' ')} {...props}>
      {title ? <h3 className={styles.drawerSectionTitle}>{title}</h3> : null}
      {children}
    </section>
  );
}

export interface DrawerFormGridProps extends HTMLAttributes<HTMLDivElement> {
  single?: boolean;
}

export function DrawerFormGrid({ className = '', single = false, ...props }: DrawerFormGridProps) {
  const classNames = [
    styles.drawerFormGrid,
    single ? styles.drawerFormGridSingle : '',
    className
  ].filter(Boolean).join(' ');

  return <div className={classNames} {...props} />;
}

export function DrawerFooter({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={[styles.drawerFooter, className].filter(Boolean).join(' ')} {...props} />;
}

export function DrawerDetailGrid({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={[styles.drawerDetailGrid, className].filter(Boolean).join(' ')} {...props} />;
}

export interface DrawerDetailItemProps extends HTMLAttributes<HTMLDivElement> {
  label: ReactNode;
  value: ReactNode;
}

export function DrawerDetailItem({ className = '', label, value, ...props }: DrawerDetailItemProps) {
  return (
    <div className={[styles.drawerDetailItem, className].filter(Boolean).join(' ')} {...props}>
      <span className={styles.drawerDetailLabel}>{label}</span>
      <strong className={styles.drawerDetailValue}>{value}</strong>
    </div>
  );
}
