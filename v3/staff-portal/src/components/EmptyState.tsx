"use client";

import { useTranslation } from "@/hooks/useTranslation";
import { Inbox } from "lucide-react";

interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

export default function EmptyState({
  title,
  description,
  icon,
  action,
}: EmptyStateProps) {
  const { t } = useTranslation();
  return (
    <div className="empty-state">
      <div className="empty-state-icon">{icon || <Inbox size={48} />}</div>
      <div className="empty-state-title">{title ?? t("empty.default_title")}</div>
      <div className="empty-state-desc">{description ?? t("empty.default_description")}</div>
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}
