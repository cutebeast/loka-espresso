"use client";

import { useTranslation } from "@/hooks/useTranslation";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
interface PageHeaderProps {
  title: string;
  subtitle?: string;
  back?: boolean | string;
  action?: React.ReactNode;
}
export default function PageHeader({
  title,
  subtitle,
  back,
  action
}: PageHeaderProps) {
  const {
    t
  } = useTranslation();
  const router = useRouter();
  const handleBack = () => {
    if (typeof back === "string") router.push(back);else router.back();
  };
  return <div className="page-header">
      <div style={{
      display: "flex",
      alignItems: "center",
      gap: 12
    }}>
        {back && <button type="button" className="btn btn-ghost" onClick={handleBack} aria-label={t("common.go_back")} style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontWeight: 700,
        fontSize: 14,
        padding: "8px 12px"
      }}>
            <ArrowLeft size={18} />
            <span>{t("common.back")}</span>
          </button>}
        <div>
          <h1 className="page-title" style={{
          margin: 0
        }}>{title}</h1>
          {subtitle && <p className="page-subtitle" style={{
          margin: "4px 0 0"
        }}>{subtitle}</p>}
        </div>
      </div>
      {action && <div>{action}</div>}
    </div>;
}