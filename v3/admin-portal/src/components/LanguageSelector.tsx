"use client";

import { Globe } from "lucide-react";
import { useTranslation, SUPPORTED_LOCALES, DEFAULT_LOCALE } from "@/lib/i18n";

const LOCALE_LABELS: Record<string, string> = {
  en: "English",
  ms: "Bahasa Melayu",
  zh: "中文",
  ta: "தமிழ்",
  tr: "Türkçe",
};

export default function LanguageSelector() {
  const { locale, setLocale, t } = useTranslation();

  return (
    <div className="language-selector">
      <Globe size={14} className="language-selector-icon" />
      <select
        value={locale || DEFAULT_LOCALE}
        onChange={(e) => setLocale(e.target.value)}
        aria-label={t("admin.common.selectLanguage")}
      >
        {SUPPORTED_LOCALES.map((loc) => (
          <option key={loc} value={loc}>
            {LOCALE_LABELS[loc] || loc}
          </option>
        ))}
      </select>
    </div>
  );
}
