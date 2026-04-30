'use client';

import React, { useState } from 'react';
import { PromoBannerEditor, PromoContentTabs, PromoTabs } from './promotions';
import type { PromoView } from './promotions';

type ViewMode = 'promotions' | 'banner-form' | PromoView;

interface PromotionsPageProps {
  token: string;
}

export default function PromotionsPage({ token }: PromotionsPageProps) {
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
        <PromoBannerEditor token={token} />
      )}

      {currentTab !== 'promotions' && (
        <PromoContentTabs
          token={token}
          activeView={viewMode as PromoView}
          onViewChange={handlePromoViewChange}
        />
      )}
    </div>
  );
}
