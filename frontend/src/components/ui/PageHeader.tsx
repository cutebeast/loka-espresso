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
    <div className="ph-0">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <div className="ph-1">
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="ph-2">
              {i > 0 && <span className="ph-3"><i className="fas fa-chevron-right" /></span>}
              {crumb.href ? (
                <a href={crumb.href} className="ph-4">
                  {crumb.label}
                </a>
              ) : (
                <span className="ph-5">{crumb.label}</span>
              )}
            </span>
          ))}
        </div>
      )}

      <div className="ph-6">
        <div>
          <h2 className="ph-7">
            {title}
          </h2>
          {subtitle && (
            <p className="ph-8">
              {subtitle}
            </p>
          )}
        </div>

        <div className="ph-9">
          {secondaryAction && (
            <button
              onClick={secondaryAction.onClick}
              className="ph-10"
            >
              {secondaryAction.icon && <i className={`fas ${secondaryAction.icon}`} />}
              {secondaryAction.label}
            </button>
          )}
          {primaryAction && (
            <button
              onClick={primaryAction.onClick}
              className="ph-11"
            >
              {primaryAction.icon && <i className={`fas ${primaryAction.icon}`} />}
              {primaryAction.label}
            </button>
          )}
        </div>
      </div>

      {children && (
        <div className="ph-12">
          {children}
        </div>
      )}
    </div>
  );
}