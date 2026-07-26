"use client";

import TranslationsPageShell from "@/components/TranslationsPageShell";
import PwaTranslationsTab from "@/components/PwaTranslationsTab";

export default function PwaTranslationsPage() {
  return (
    <TranslationsPageShell
      titleKey="admin.translations.tab.pwa"
      descKey="admin.translations.tab.pwaDesc"
      showSync
    >
      <PwaTranslationsTab />
    </TranslationsPageShell>
  );
}
