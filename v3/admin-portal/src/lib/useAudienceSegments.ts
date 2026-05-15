"use client";
import { useEffect, useState } from "react";
import { api } from "./api";

export interface Segment {
  value: string;
  label: string;
}

export interface TierSegment extends Segment {
  tier_key: string;
}

export function useAudienceSegments() {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [tierSegments, setTierSegments] = useState<TierSegment[]>([]);
  const [allSegments, setAllSegments] = useState<Segment[]>([
    { value: "all_users", label: "All Users" },
    { value: "new_users", label: "New Users" },
    { value: "loyal_customers", label: "Loyal Customers" },
    { value: "inactive_users", label: "Inactive Users" },
  ]);

  useEffect(() => {
    api.getRaw<any>("/admin/loyalty/tiers?per_page=10&is_active=true")
      .then(d => {
        const tiers = (d?.items || []) as { tier_key: string; display_name: string }[];
        const tSegments: Segment[] = tiers.map(t => ({ value: `tier:${t.tier_key}`, label: `${t.display_name} Members` }));
        setAllSegments([
          { value: "all_users", label: "All Users" },
          { value: "new_users", label: "New Users" },
          { value: "loyal_customers", label: "Loyal Customers" },
          { value: "inactive_users", label: "Inactive Users" },
          ...tSegments,
        ]);
      })
      .catch(() => {}); // keep base segments on error
  }, []);

  return { allSegments };
}
