'use client';

import { ReactNode, useState } from 'react';

export interface ColumnDef<T> {
  key: string;
  header: string;
  sortable?: boolean;
  render?: (row: T) => ReactNode;
  width?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  sortable?: boolean;
  onRowClick?: (row: T) => void;
  actions?: {
    label: string;
    icon?: string;
    onClick: (row: T) => void;
    variant?: 'primary' | 'danger' | 'ghost';
  }[];
  emptyMessage?: string;
  loading?: boolean;
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    onPageChange: (page: number) => void;
  };
}

export function DataTable<T extends Record<string, any>>({
  data,
  columns,
  sortable = false,
  onRowClick,
  actions = [],
  emptyMessage = 'No data available',
  loading = false,
  pagination,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className="dt-0">
        <div className="dt-1">
          <span className="dt-2"><i className="fas fa-spinner fa-spin"></i></span>
          <p className="dt-3">Loading...</p>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="dt-4">
        <div className="dt-5">
          <span className="dt-6"><i className="fas fa-inbox"></i></span>
          <p className="dt-7">{emptyMessage}</p>
        </div>
      </div>
    );
  }

  const totalPages = pagination ? Math.ceil(pagination.total / pagination.pageSize) : 1;

  return (
    <div>
      <div className="dt-8">
        <div className="data-table">
          <table className="dt-9">
            <thead>
              <tr className="dt-10">
                {columns.map(col => (
                  <th
                    key={col.key}
                    className="dt-th"
                    {...({ width: col.width } as any)}
                  >
                    {col.header}
                    {sortable && col.sortable && (
                      <span className="dt-11"><i className="fas fa-sort"></i></span>
                    )}
                  </th>
                ))}
                {actions.length > 0 && (
                  <th className="dt-th dt-th-right"
                    {...({ width: actions.length * 80 } as any)}>
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {data.map((row, idx) => (
                <tr
                  key={row.id ?? idx}
                  onClick={() => onRowClick?.(row)}
                  className={`dt-row ${onRowClick ? 'cursor-pointer' : 'cursor-default'}`}
                  onMouseEnter={e => (e.currentTarget.style.background = '#F9F7F3')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {columns.map(col => (
                    <td
                      key={col.key}
                      className="dt-12"
                    >
                      {col.render ? col.render(row) : row[col.key]}
                    </td>
                  ))}
                  {actions.length > 0 && (
                    <td className="dt-13">
                      <div className="dt-14">
                        {actions.map((action, i) => (
                          <button
                            key={i}
                            onClick={e => { e.stopPropagation(); action.onClick(row); }}
                            className={`dt-action-btn ${action.variant === 'danger' ? 'dt-action-danger' : action.variant === 'ghost' ? 'dt-action-ghost' : 'dt-action-primary'}`}
                          >
                            {action.icon && <span className="dt-15"><i className={`fas ${action.icon}`} /></span>}
                            {action.label}
                          </button>
                        ))}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {pagination && totalPages > 1 && (
        <div className="dt-16">
          <button
            onClick={() => pagination.onPageChange(pagination.page - 1)}
            disabled={pagination.page <= 1}
            className={`dt-page-btn ${pagination.page <= 1 ? 'dt-page-disabled' : 'dt-page-enabled'}`}
          >
            <span className="dt-17"><i className="fas fa-chevron-left" /></span>
            Prev
          </button>
          <span>
            Page {pagination.page} of {totalPages}
          </span>
          <button
            onClick={() => pagination.onPageChange(pagination.page + 1)}
            disabled={pagination.page >= totalPages}
            className={`dt-page-btn ${pagination.page >= totalPages ? 'dt-page-disabled' : 'dt-page-enabled'}`}
          >
            Next
            <span className="dt-18"><i className="fas fa-chevron-right" /></span>
          </button>
        </div>
      )}
    </div>
  );
}

// Expandable row variant - for rows that can expand to show additional content
interface DataTableExpandableRowProps<T> extends Omit<DataTableProps<T>, 'onRowClick'> {
  expandColumnHeader?: string;
  getRowId: (row: T) => string | number;
  renderExpandedContent: (row: T) => ReactNode;
  onRowExpand?: (row: T, isExpanded: boolean) => void;
}

export function DataTableExpandableRow<T extends Record<string, any>>({
  data,
  columns,
  sortable = false,
  expandColumnHeader = 'Details',
  getRowId,
  renderExpandedContent,
  actions = [],
  emptyMessage = 'No data available',
  loading = false,
  pagination,
  onRowExpand,
}: DataTableExpandableRowProps<T>) {
  const [expandedRows, setExpandedRows] = useState<Set<string | number>>(new Set());

  const toggleRow = (row: T) => {
    const id = getRowId(row);
    const newExpanded = new Set(expandedRows);
    const isCurrentlyExpanded = newExpanded.has(id);
    
    if (isCurrentlyExpanded) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    
    setExpandedRows(newExpanded);
    onRowExpand?.(row, !isCurrentlyExpanded);
  };

  const isExpanded = (row: T) => expandedRows.has(getRowId(row));

  if (loading) {
    return (
      <div className="dter-19">
        <div className="dter-20">
          <span className="dter-21"><i className="fas fa-spinner fa-spin"></i></span>
          <p className="dter-22">Loading...</p>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="dter-23">
        <div className="dter-24">
          <span className="dter-25"><i className="fas fa-inbox"></i></span>
          <p className="dter-26">{emptyMessage}</p>
        </div>
      </div>
    );
  }

  const totalPages = pagination ? Math.ceil(pagination.total / pagination.pageSize) : 1;

  return (
    <div>
      <div className="dter-27">
        <div className="data-table">
          <table className="dter-28">
            <thead>
              <tr className="dter-29">
                {columns.map(col => (
                  <th
                    key={col.key}
                    className="dt-th"
                    {...({ width: col.width } as any)}
                  >
                    {col.header}
                    {sortable && col.sortable && (
                      <span className="dter-30"><i className="fas fa-sort"></i></span>
                    )}
                  </th>
                ))}
                <th className="dter-31">
                  {expandColumnHeader}
                </th>
                {actions.length > 0 && (
                  <th className="dt-th dt-th-right"
                    {...({ width: actions.length * 80 } as any)}>
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {data.map((row, _idx) => (
                <>
                  <tr
                    key={getRowId(row)}
                    className={`dter-row ${isExpanded(row) ? 'dter-row-expanded' : 'dter-row-collapsed'}`}
                    onMouseEnter={e => (e.currentTarget.style.background = '#F9F7F3')}
                    onMouseLeave={e => (e.currentTarget.style.background = isExpanded(row) ? '#F9F7F3' : 'transparent')}
                  >
                    {columns.map(col => (
                      <td
                        key={col.key}
                        className="dter-33"
                      >
                        {col.render ? col.render(row) : row[col.key]}
                      </td>
                    ))}
                    <td className="dter-34">
                      <button
                        onClick={() => toggleRow(row)}
                        className="dter-35"
                      >
                        <span className="dter-36"><i className={`fas fa-chevron-${isExpanded(row) ? 'up' : 'down'}`}></i></span>
                        {isExpanded(row) ? 'Hide' : 'View'}
                      </button>
                    </td>
                    {actions.length > 0 && (
                      <td className="dter-37">
                        <div className="dter-38">
                          {actions.map((action, i) => (
                            <button
                              key={i}
                              onClick={e => { e.stopPropagation(); action.onClick(row); }}
                              className={`dt-action-btn ${action.variant === 'danger' ? 'dt-action-danger' : action.variant === 'ghost' ? 'dt-action-ghost' : 'dt-action-primary'}`}
                            >
                              {action.icon && <span className="dter-39"><i className={`fas ${action.icon}`} /></span>}
                              {action.label}
                            </button>
                          ))}
                        </div>
                      </td>
                    )}
                  </tr>
                  {isExpanded(row) && (
                    <tr>
                      <td
                        colSpan={columns.length + 1 + (actions.length > 0 ? 1 : 0)}
                        className="dter-40"
                      >
                        {renderExpandedContent(row)}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {pagination && totalPages > 1 && (
        <div className="dter-41">
          <button
            onClick={() => pagination.onPageChange(pagination.page - 1)}
            disabled={pagination.page <= 1}
            className={`dt-page-btn ${pagination.page <= 1 ? 'dt-page-disabled' : 'dt-page-enabled'}`}
          >
            <span className="dter-42"><i className="fas fa-chevron-left" /></span>
            Prev
          </button>
          <span>
            Page {pagination.page} of {totalPages}
          </span>
          <button
            onClick={() => pagination.onPageChange(pagination.page + 1)}
            disabled={pagination.page >= totalPages}
            className={`dt-page-btn ${pagination.page >= totalPages ? 'dt-page-disabled' : 'dt-page-enabled'}`}
          >
            Next
            <span className="dter-43"><i className="fas fa-chevron-right" /></span>
          </button>
        </div>
      )}
    </div>
  );
}