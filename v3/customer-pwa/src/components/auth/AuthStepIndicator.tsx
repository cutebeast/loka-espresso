'use client';

import { useTranslation } from '@/hooks/useTranslation';

interface AuthStepIndicatorProps {
  currentStep: number; // 1, 2, or 3
  labels?: boolean;
}

export function AuthStepIndicator({ currentStep, labels = true }: AuthStepIndicatorProps) {
  const { t } = useTranslation();
  return (
    <div className="auth-step-indicator">
      <div className="auth-step-dots">
        {[1, 2, 3].map((step) => (
          <div
            key={step}
            className={`auth-step-dot ${
              step < currentStep
                ? 'done'
                : step === currentStep
                ? 'active'
                : ''
            }`}
          />
        ))}
      </div>
      {labels && (
        <div className="auth-step-label">
          {t('common.stepCount', { current: currentStep, total: 3 })}
        </div>
      )}
    </div>
  );
}
