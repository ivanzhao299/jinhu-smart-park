import { forwardRef, type TableHTMLAttributes, type HTMLAttributes } from 'react';
import styles from './DataTable.module.css';

export type DataTableProps = TableHTMLAttributes<HTMLTableElement>;

export const DataTable = forwardRef<HTMLTableElement, DataTableProps>(
  ({ className = '', ...props }, ref) => {
    return (
      <div className={styles.tableContainer}>
        <table ref={ref} className={[styles.table, className].filter(Boolean).join(' ')} {...props} />
      </div>
    );
  }
);

DataTable.displayName = 'DataTable';

export const DataTableActions = forwardRef<HTMLSpanElement, HTMLAttributes<HTMLSpanElement>>(
  ({ className = '', ...props }, ref) => {
    return <span ref={ref} className={[styles.actions, className].filter(Boolean).join(' ')} {...props} />;
  }
);

DataTableActions.displayName = 'DataTableActions';
