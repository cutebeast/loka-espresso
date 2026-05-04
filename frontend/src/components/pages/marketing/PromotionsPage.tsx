'use client';

import React, { useState } from 'react';
import { PromoBannerEditor, PromoContentTabs, PromoTabs } from './promotions';
import type { PromoView } from './promotions';

type ViewMode = 'promotions' | 'banner-form' | PromoView;

export default function PromotionsPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('promotions');

  const currentTab: 'promotions' | 'surveys' | 'reports' =
    (viewMode === 'promotions' || viewMode === 'banner-form') ? 'promotions' : (viewMode === 'reports' ? 'reports' : 'surveys');

  const handleTabChange = (tab: 'promotions' | 'surveys' | 'reports') => {
    setViewMode(tab);
  };

  const handlePromoViewChange = (view: PromoView) => {
    setViewMode(view);
  };

  const showTabs = true;

  return (
    <div>
      <PromoTabs activeTab={currentTab} onTabChange={handleTabChange} />

      {currentTab === 'promotions' && (
        <PromoBannerEditor />
      )}

      {currentTab !== 'promotions' && (
        <PromoContentTabs
          activeView={viewMode as PromoView}
          onViewChange={handlePromoViewChange}
        />
      )}
    </div>
  );
}
