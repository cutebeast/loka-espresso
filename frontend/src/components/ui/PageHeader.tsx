'use client';

import { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: { label: string; href?: string }[];
  primaryAction?: {
    label: string;
    icon?: string;
    onClick: () => void;
  };
  secondaryAction?: {
    label: string;
    icon?: string;
    onClick: () => void;
  };
  children?: ReactNode;
}

export function PageHeader({
  title,
  subtitle,
  breadcrumbs,
  primaryAction,
  secondaryAction,
  children,
}: PageHeaderProps) {
  return (
    <div style={{
      marginBottom: 24,
      paddingBottom: 20,
      borderBottom: '1px solid #E5E0D8',
    }}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 8,
          fontSize: 12,
          color: '#6B635E',
        }}>
          {breadcrumbs.map((crumb, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {i > 0 && <i className="fas fa-chevron-right" style={{ fontSize: 10 }} />}
              {crumb.href ? (
                <a href={crumb.href} style={{ color: '#6B635E', textDecoration: 'none' }}>
                  {crumb.label}
                </a>
              ) : (
                <span style={{ color: '#2C1E16' }}>{crumb.label}</span>
              )}
            </span>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{
            margin: 0,
            fontSize: 24,
            fontWeight: 700,
            color: '#2C1E16',
          }}>
            {title}
          </h2>
          {subtitle && (
            <p style={{
              margin: '4px 0 0 0',
              fontSize: 14,
              color: '#6B635E',
            }}>
              {subtitle}
            </p>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {secondaryAction && (
            <button
              onClick={secondaryAction.onClick}
              style={{
                padding: '10px 16px',
                borderRadius: 10,
                border: '1px solid #E5E0D8',
                background: 'white',
                color: '#2C1E16',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {secondaryAction.icon && <i className={`fas ${secondaryAction.icon}`} />}
              {secondaryAction.label}
            </button>
          )}
          {primaryAction && (
            <button
              onClick={primaryAction.onClick}
              style={{
                padding: '10px 16px',
                borderRadius: 10,
                border: 'none',
                background: '#2C1E16',
                color: 'white',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 4px 8px rgba(44,30,22,0.15)',
              }}
            >
              {primaryAction.icon && <i className={`fas ${primaryAction.icon}`} />}
              {primaryAction.label}
            </button>
          )}
        </div>
      </div>

      {children && (
        <div style={{ marginTop: 16 }}>
          {children}
        </div>
      )}
    </div>
  );
}