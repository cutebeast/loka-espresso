"use client";
import { useEffect, useState } from "react";
import { api } from "./api";
import { useTranslation } from "./i18n";

export interface Segment {
  value: string;
  label: string;
}

export interface TierSegment extends Segment {
  tier_key: string;
}

export function useAudienceSegments() {
  const { t } = useTranslation();
  const [allSegments, setAllSegments] = useState<Segment[]>([
    { value: "all_users", label: t("segments.all_users") },
    { value: "new_users", label: t("segments.new_users") },
    { value: "loyal_customers", label: t("segments.loyal_customers") },
    { value: "inactive_users", label: t("segments.inactive_users") },
  ]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.getRaw<any>("/admin/loyalty/tiers?per_page=10&is_active=true")
      .then(d => {
        if (cancelled) return;
        const tiers = (d?.items || []) as { tier_key: string; display_name: string }[];
        const tSegments: Segment[] = tiers.map(tier => ({ value: `tier:${tier.tier_key}`, label: t("segments.tier_members", { name: tier.display_name }) }));
        setAllSegments([
          { value: "all_users", label: t("segments.all_users") },
          { value: "new_users", label: t("segments.new_users") },
          { value: "loyal_customers", label: t("segments.loyal_customers") },
          { value: "inactive_users", label: t("segments.inactive_users") },
          ...tSegments,
        ]);
        setError(null);
      })
      .catch((e: any) => { if (!cancelled) setError(e?.message || "Failed to load segments"); });
    return () => { cancelled = true; };
  }, []);

  return { allSegments, error };
}
