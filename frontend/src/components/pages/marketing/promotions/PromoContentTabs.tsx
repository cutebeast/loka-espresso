'use client';

import React from 'react';
import { THEME } from '@/lib/theme';
import SurveysPage from '../SurveysPage';
import SurveyReportPage from '../SurveyReportPage';

export type PromoView = 'surveys' | 'survey-form' | 'reports';

interface PromoContentTabsProps {
  token: string;
  activeView: PromoView;
  onViewChange: (view: PromoView) => void;
}

export default function PromoContentTabs({ token, activeView, onViewChange }: PromoContentTabsProps) {
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

interface PromoTabsProps {
  activeTab: 'promotions' | 'surveys' | 'reports';
  onTabChange: (tab: 'promotions' | 'surveys' | 'reports') => void;
}

export function PromoTabs({ activeTab, onTabChange }: PromoTabsProps) {
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
