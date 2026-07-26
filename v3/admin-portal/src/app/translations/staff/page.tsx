"use client";

import TranslationsPageShell from "@/components/TranslationsPageShell";
import StaffTranslationsTab from "@/components/StaffTranslationsTab";

export default function StaffTranslationsPage() {
  return (
    <TranslationsPageShell
      titleKey="admin.translations.tab.staff"
      descKey="admin.translations.tab.staffDesc"
    >
      <StaffTranslationsTab />
    </TranslationsPageShell>
  );
}
