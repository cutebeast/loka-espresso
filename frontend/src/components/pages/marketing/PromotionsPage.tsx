'use client';

import React, { useState } from 'react';
import { BannerManager, BroadcastManager, BroadcastTabs } from './promotions';
import type { BroadcastView } from './promotions';

type ViewMode = 'promotions' | 'banner-form' | BroadcastView;

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

  const handleBroadcastViewChange = (view: BroadcastView) => {
    setViewMode(view);
  };

  const showTabs = true;

  return (
    <div>
      <BroadcastTabs activeTab={currentTab} onTabChange={handleTabChange} />

      {currentTab === 'promotions' && (
        <BannerManager token={token} />
      )}

      {currentTab !== 'promotions' && (
        <BroadcastManager
          token={token}
          activeView={viewMode as BroadcastView}
          onViewChange={handleBroadcastViewChange}
        />
      )}
    </div>
  );
}
