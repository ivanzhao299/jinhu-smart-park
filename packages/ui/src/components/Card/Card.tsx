import { type HTMLAttributes, type ReactNode } from 'react';
import styles from './Card.module.css';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: 'article' | 'div' | 'main' | 'section';
  children?: ReactNode;
}

export function Card({ className = '', as = 'div', ...props }: CardProps) {
  const classNames = [styles.card, className].filter(Boolean).join(' ');
  if (as === 'article') return <article className={classNames} {...props} />;
  if (as === 'main') return <main className={classNames} {...props} />;
  if (as === 'section') return <section className={classNames} {...props} />;
  return <div className={classNames} {...props} />;
}
