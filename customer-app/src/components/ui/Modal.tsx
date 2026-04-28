'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { ReactNode } from 'react';
import { X } from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  meta?: string;
  children: ReactNode;
  footer?: ReactNode;
  variant?: 'bottom' | 'center';
}

export function Modal({ isOpen, onClose, title, meta, children, footer, variant = 'bottom' }: ModalProps) {
  const containerRef = useFocusTrap<HTMLDivElement>(isOpen);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
          className="modal-wrap"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          {variant === 'bottom' ? (
            <motion.div
              ref={containerRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={title ? 'modal-title' : undefined}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
              className="modal-sheet"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header: handle + title + close + meta */}
              <div className="modal-header">
                {/* Handle */}
                <div className="modal-handle" />

                {(title || meta) && (
                  <>
                    <div className="modal-title-row">
                      {title && (
                        <h3 id="modal-title" className="modal-title">
                          {title}
                        </h3>
                      )}
                      <button
                        onClick={onClose}
                        aria-label="Close"
                        className="modal-close"
                      >
                        <X size={16} />
                      </button>
                    </div>
                    {meta && (
                      <p className="modal-meta">{meta}</p>
                    )}
                  </>
                )}
              </div>

              {/* Body */}
              <div className="modal-body">
                {children}
              </div>

              {/* Footer */}
              {footer && (
                <div className="modal-footer">
                  {footer}
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              ref={containerRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={title ? 'modal-title' : undefined}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-3xl p-6 w-[90%] max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              {title && (
                <div className="flex items-center justify-between mb-4">
                  <h3 id="modal-title" className="text-xl font-bold text-text-primary">{title}</h3>
                  <button
                    onClick={onClose}
                    aria-label="Close"
                    className="w-11 h-11 rounded-full bg-bg-light flex items-center justify-center hover:bg-border-subtle transition-colors"
                  >
                    <X size={18} className="text-text-secondary" />
                  </button>
                </div>
              )}
              {children}
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
