"use client";

import TranslationsPageShell from "@/components/TranslationsPageShell";
import AdminTranslationsTab from "@/components/AdminTranslationsTab";

export default function AdminTranslationsPage() {
  return (
    <TranslationsPageShell
      titleKey="admin.translations.tab.admin"
      descKey="admin.translations.tab.adminDesc"
    >
      <AdminTranslationsTab />
    </TranslationsPageShell>
  );
}
