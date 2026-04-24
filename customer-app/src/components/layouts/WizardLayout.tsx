'use client';

import { ReactNode } from 'react';

interface WizardLayoutProps {
  children: ReactNode;
  currentStep: number;
  totalSteps: number;
  stepLabels?: string[];
  onNext?: () => void;
  onPrev?: () => void;
  canGoNext?: boolean;
  canGoPrev?: boolean;
  isLastStep?: boolean;
  nextLabel?: string;
  prevLabel?: string;
  className?: string;
}

export function WizardLayout({
  children,
  currentStep,
  totalSteps,
  stepLabels = [],
  onNext,
  onPrev,
  canGoNext = true,
  canGoPrev = true,
  isLastStep = false,
  nextLabel = 'Next',
  prevLabel = 'Back',
  className = '',
}: WizardLayoutProps) {
  const progress = totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0;

  return (
    <div className={`flex flex-col h-full bg-bg ${className}`}>
      {/* Progress bar */}
      <div className="shrink-0 safe-area-top bg-white">
        <div className="px-5 pt-4 pb-3">
          {stepLabels.length > 0 && (
            <div className="flex justify-between mb-2">
              {stepLabels.map((label, i) => (
                <span
                  key={i}
                  className={`text-xs font-semibold ${
                    i < currentStep
                      ? 'text-primary'
                      : i === currentStep - 1
                      ? 'text-text-primary'
                      : 'text-text-muted'
                  }`}
                >
                  {label}
                </span>
              ))}
            </div>
          )}
          <div className="h-1.5 bg-bg-light rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-text-muted mt-1.5 font-medium">
            Step {currentStep} of {totalSteps}
          </p>
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 overflow-y-auto scroll-container">
        {children}
      </main>

      {/* Navigation buttons */}
      <div className="shrink-0 safe-area-bottom bg-white border-t border-border-subtle px-5 py-4">
        <div className="flex gap-3">
          {onPrev && (
            <button
              onClick={onPrev}
              disabled={!canGoPrev}
              className="flex-1 py-3 rounded-xl bg-bg-light text-text-primary font-semibold text-sm hover:bg-border-subtle transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {prevLabel}
            </button>
          )}
          {onNext && (
            <button
              onClick={onNext}
              disabled={!canGoNext}
              className="flex-1 py-3 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLastStep ? 'Finish' : nextLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
