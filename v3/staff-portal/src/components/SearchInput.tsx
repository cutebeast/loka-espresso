"use client";

import { useTranslation } from "@/hooks/useTranslation";
import { Search, X } from "lucide-react";
interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}
export default function SearchInput({
  value,
  onChange,
  placeholder = "Search...",
  className = ""
}: SearchInputProps) {
  const {
    t
  } = useTranslation();
  return <div className={`search-input-wrap ${className}`}>
      <Search size={16} />
      <input className="search-input" type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
      {value && <button type="button" aria-label={t("common.clear_search")} onClick={() => onChange("")} style={{
      position: "absolute",
      right: 10,
      top: "50%",
      transform: "translateY(-50%)",
      background: "none",
      border: "none",
      cursor: "pointer",
      opacity: 0.4
    }}>
          <X size={14} />
        </button>}
    </div>;
}