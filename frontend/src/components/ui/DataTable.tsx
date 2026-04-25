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
      <div style={{
        background: 'white',
        borderRadius: 16,
        border: '1px solid #E5E0D8',
        overflow: 'hidden',
      }}>
        <div style={{ padding: 40, textAlign: 'center', color: '#6B635E' }}>
          <i className="fas fa-spinner fa-spin" style={{ fontSize: 24 }}></i>
          <p style={{ marginTop: 12 }}>Loading...</p>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div style={{
        background: 'white',
        borderRadius: 16,
        border: '1px solid #E5E0D8',
        overflow: 'hidden',
      }}>
        <div style={{ padding: 60, textAlign: 'center', color: '#6B635E' }}>
          <i className="fas fa-inbox" style={{ fontSize: 32, opacity: 0.5 }}></i>
          <p style={{ marginTop: 12 }}>{emptyMessage}</p>
        </div>
      </div>
    );
  }

  const totalPages = pagination ? Math.ceil(pagination.total / pagination.pageSize) : 1;

  return (
    <div>
      <div style={{
        background: 'white',
        borderRadius: 16,
        border: '1px solid #E5E0D8',
        overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
      }}>
        <div className="data-table">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F9F7F3' }}>
                {columns.map(col => (
                  <th
                    key={col.key}
                    style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#6B635E',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      borderBottom: '1px solid #E5E0D8',
                      width: col.width,
                    }}
                  >
                    {col.header}
                    {sortable && col.sortable && (
                      <i className="fas fa-sort" style={{ marginLeft: 6, fontSize: 10, opacity: 0.5 }}></i>
                    )}
                  </th>
                ))}
                {actions.length > 0 && (
                  <th style={{
                    padding: '12px 16px',
                    textAlign: 'right',
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#6B635E',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    borderBottom: '1px solid #E5E0D8',
                    width: actions.length * 80,
                  }}>
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {data.map((row, idx) => (
                <tr
                  key={idx}
                  onClick={() => onRowClick?.(row)}
                  style={{
                    cursor: onRowClick ? 'pointer' : 'default',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#F9F7F3')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {columns.map(col => (
                    <td
                      key={col.key}
                      style={{
                        padding: '14px 16px',
                        fontSize: 14,
                        color: '#2C1E16',
                        borderBottom: '1px solid #E5E0D8',
                      }}
                    >
                      {col.render ? col.render(row) : row[col.key]}
                    </td>
                  ))}
                  {actions.length > 0 && (
                    <td style={{ padding: '14px 16px', borderBottom: '1px solid #E5E0D8' }}>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        {actions.map((action, i) => (
                          <button
                            key={i}
                            onClick={e => { e.stopPropagation(); action.onClick(row); }}
                            style={{
                              padding: '6px 12px',
                              borderRadius: 8,
                              border: 'none',
                              fontSize: 12,
                              fontWeight: 500,
                              cursor: 'pointer',
                              transition: 'all 0.15s',
                              background: action.variant === 'danger' ? '#A83232' :
                                         action.variant === 'ghost' ? 'transparent' : '#2C1E16',
                              color: action.variant === 'ghost' ? '#6B635E' : 'white',
                            }}
                          >
                            {action.icon && <i className={`fas ${action.icon}`} style={{ marginRight: 4 }} />}
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
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 12,
          marginTop: 16,
          color: '#6B635E',
          fontSize: 13,
        }}>
          <button
            onClick={() => pagination.onPageChange(pagination.page - 1)}
            disabled={pagination.page <= 1}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid #E5E0D8',
              background: 'white',
              color: pagination.page <= 1 ? '#C5BFB8' : '#2C1E16',
              cursor: pagination.page <= 1 ? 'not-allowed' : 'pointer',
              fontSize: 13,
            }}
          >
            <i className="fas fa-chevron-left" style={{ marginRight: 4 }} />
            Prev
          </button>
          <span>
            Page {pagination.page} of {totalPages}
          </span>
          <button
            onClick={() => pagination.onPageChange(pagination.page + 1)}
            disabled={pagination.page >= totalPages}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid #E5E0D8',
              background: 'white',
              color: pagination.page >= totalPages ? '#C5BFB8' : '#2C1E16',
              cursor: pagination.page >= totalPages ? 'not-allowed' : 'pointer',
              fontSize: 13,
            }}
          >
            Next
            <i className="fas fa-chevron-right" style={{ marginLeft: 4 }} />
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
      <div style={{
        background: 'white',
        borderRadius: 16,
        border: '1px solid #E5E0D8',
        overflow: 'hidden',
      }}>
        <div style={{ padding: 40, textAlign: 'center', color: '#6B635E' }}>
          <i className="fas fa-spinner fa-spin" style={{ fontSize: 24 }}></i>
          <p style={{ marginTop: 12 }}>Loading...</p>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div style={{
        background: 'white',
        borderRadius: 16,
        border: '1px solid #E5E0D8',
        overflow: 'hidden',
      }}>
        <div style={{ padding: 60, textAlign: 'center', color: '#6B635E' }}>
          <i className="fas fa-inbox" style={{ fontSize: 32, opacity: 0.5 }}></i>
          <p style={{ marginTop: 12 }}>{emptyMessage}</p>
        </div>
      </div>
    );
  }

  const totalPages = pagination ? Math.ceil(pagination.total / pagination.pageSize) : 1;

  return (
    <div>
      <div style={{
        background: 'white',
        borderRadius: 16,
        border: '1px solid #E5E0D8',
        overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
      }}>
        <div className="data-table">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F9F7F3' }}>
                {columns.map(col => (
                  <th
                    key={col.key}
                    style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#6B635E',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      borderBottom: '1px solid #E5E0D8',
                      width: col.width,
                    }}
                  >
                    {col.header}
                    {sortable && col.sortable && (
                      <i className="fas fa-sort" style={{ marginLeft: 6, fontSize: 10, opacity: 0.5 }}></i>
                    )}
                  </th>
                ))}
                <th style={{
                  padding: '12px 16px',
                  textAlign: 'center',
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#6B635E',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  borderBottom: '1px solid #E5E0D8',
                  width: 80,
                }}>
                  {expandColumnHeader}
                </th>
                {actions.length > 0 && (
                  <th style={{
                    padding: '12px 16px',
                    textAlign: 'right',
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#6B635E',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    borderBottom: '1px solid #E5E0D8',
                    width: actions.length * 80,
                  }}>
                    Actions
                  </th>
                )}
                <th style={{
                  padding: '12px 16px',
                  textAlign: 'center',
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#6B635E',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  borderBottom: '1px solid #E5E0D8',
                  width: 100,
                }}>
                  {expandColumnHeader}
                </th>
                {actions.length > 0 && (
                  <th style={{
                    padding: '12px 16px',
                    textAlign: 'right',
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#6B635E',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    borderBottom: '1px solid #E5E0D8',
                    width: actions.length * 80,
                  }}>
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
                    style={{
                      transition: 'background 0.15s',
                      background: isExpanded(row) ? '#F9F7F3' : 'transparent',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#F9F7F3')}
                    onMouseLeave={e => (e.currentTarget.style.background = isExpanded(row) ? '#F9F7F3' : 'transparent')}
                  >
                    {columns.map(col => (
                      <td
                        key={col.key}
                        style={{
                          padding: '14px 16px',
                          fontSize: 14,
                          color: '#2C1E16',
                          borderBottom: '1px solid #E5E0D8',
                        }}
                      >
                        {col.render ? col.render(row) : row[col.key]}
                      </td>
                    ))}
                    <td style={{ padding: '14px 16px', textAlign: 'center', borderBottom: '1px solid #E5E0D8' }}>
                      <button
                        onClick={() => toggleRow(row)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 8,
                          border: 'none',
                          fontSize: 12,
                          fontWeight: 500,
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                          background: '#2C1E16',
                          color: 'white',
                        }}
                      >
                        <i className={`fas fa-chevron-${isExpanded(row) ? 'up' : 'down'}`} style={{ marginRight: 4 }}></i>
                        {isExpanded(row) ? 'Hide' : 'View'}
                      </button>
                    </td>
                    {actions.length > 0 && (
                      <td style={{ padding: '14px 16px', borderBottom: '1px solid #E5E0D8' }}>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          {actions.map((action, i) => (
                            <button
                              key={i}
                              onClick={e => { e.stopPropagation(); action.onClick(row); }}
                              style={{
                                padding: '6px 12px',
                                borderRadius: 8,
                                border: 'none',
                                fontSize: 12,
                                fontWeight: 500,
                                cursor: 'pointer',
                                transition: 'all 0.15s',
                                background: action.variant === 'danger' ? '#A83232' :
                                           action.variant === 'ghost' ? 'transparent' : '#2C1E16',
                                color: action.variant === 'ghost' ? '#6B635E' : 'white',
                              }}
                            >
                              {action.icon && <i className={`fas ${action.icon}`} style={{ marginRight: 4 }} />}
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
                        style={{
                          padding: '16px 24px',
                          background: '#FAFAF8',
                          borderBottom: '1px solid #E5E0D8',
                        }}
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
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 12,
          marginTop: 16,
          color: '#6B635E',
          fontSize: 13,
        }}>
          <button
            onClick={() => pagination.onPageChange(pagination.page - 1)}
            disabled={pagination.page <= 1}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid #E5E0D8',
              background: 'white',
              color: pagination.page <= 1 ? '#C5BFB8' : '#2C1E16',
              cursor: pagination.page <= 1 ? 'not-allowed' : 'pointer',
              fontSize: 13,
            }}
          >
            <i className="fas fa-chevron-left" style={{ marginRight: 4 }} />
            Prev
          </button>
          <span>
            Page {pagination.page} of {totalPages}
          </span>
          <button
            onClick={() => pagination.onPageChange(pagination.page + 1)}
            disabled={pagination.page >= totalPages}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid #E5E0D8',
              background: 'white',
              color: pagination.page >= totalPages ? '#C5BFB8' : '#2C1E16',
              cursor: pagination.page >= totalPages ? 'not-allowed' : 'pointer',
              fontSize: 13,
            }}
          >
            Next
            <i className="fas fa-chevron-right" style={{ marginLeft: 4 }} />
          </button>
        </div>
      )}
    </div>
  );
}