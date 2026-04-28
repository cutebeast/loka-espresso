'use client';

import React from 'react';
import { THEME } from '@/lib/theme';
import SurveysPage from '../SurveysPage';
import SurveyReportPage from '../SurveyReportPage';

export type BroadcastView = 'surveys' | 'survey-form' | 'reports';

interface BroadcastManagerProps {
  token: string;
  activeView: BroadcastView;
  onViewChange: (view: BroadcastView) => void;
}

export default function BroadcastManager({ token, activeView, onViewChange }: BroadcastManagerProps) {
  return (
    <>
      {(activeView === 'surveys' || activeView === 'survey-form') && (
        <SurveysPage
          token={token}
          onSwitchToPromotions={() => onViewChange('surveys')}
        />
      )}

      {activeView === 'reports' && (
        <SurveyReportPage token={token} />
      )}
    </>
  );
}

interface BroadcastTabsProps {
  activeTab: 'promotions' | 'surveys' | 'reports';
  onTabChange: (tab: 'promotions' | 'surveys' | 'reports') => void;
}

export function BroadcastTabs({ activeTab, onTabChange }: BroadcastTabsProps) {
  return (
    <div className="pp-25">
      <button
        onClick={() => onTabChange('promotions')}
        className="pp-tab"
        style={{
          borderBottom: `2px solid ${activeTab === 'promotions' ? THEME.primary : 'transparent'}`,
          color: activeTab === 'promotions' ? THEME.primary : THEME.textMuted,
        }}
      >
        <span className="pp-26"><i className="fas fa-bullhorn"></i></span>
        Promotions
      </button>
      <button
        onClick={() => onTabChange('surveys')}
        className="pp-tab"
        style={{
          borderBottom: `2px solid ${activeTab === 'surveys' ? THEME.primary : 'transparent'}`,
          color: activeTab === 'surveys' ? THEME.primary : THEME.textMuted,
        }}
      >
        <span className="pp-27"><i className="fas fa-list-check"></i></span>
        Surveys
      </button>
      <button
        onClick={() => onTabChange('reports')}
        className="pp-tab"
        style={{
          borderBottom: `2px solid ${activeTab === 'reports' ? THEME.primary : 'transparent'}`,
          color: activeTab === 'reports' ? THEME.primary : THEME.textMuted,
        }}
      >
        <span className="pp-28"><i className="fas fa-chart-bar"></i></span>
        Survey Reports
      </button>
    </div>
  );
}
