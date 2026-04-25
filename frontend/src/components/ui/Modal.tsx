'use client';

import { ReactNode, useEffect } from 'react';
import { Button } from './Button';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;



  return (
    <div
      className="m-0"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div
        className="m-1"
      />

      {/* Modal Content */}
      <div
        className={`m-content m-size-${size}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="m-2"
        >
          <h3 className="m-3">{title}</h3>
          <button
            onClick={onClose}
            className="m-4"
          >
            <i className="fas fa-times" />
          </button>
        </div>

        {/* Body */}
        <div className="m-5">{children}</div>

        {/* Footer */}
        {footer && (
          <div
            className="m-6"
          >
            {footer}
          </div>
        )}
      </div>

      <style>{`
        @keyframes modalIn {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(-10px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

interface ConfirmModalProps extends Omit<ModalProps, 'children' | 'footer'> {
  message: string;
  onConfirm: () => void;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'primary';
}

export function ConfirmModal({
  message,
  onConfirm,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'primary',
  ...props
}: ConfirmModalProps) {
  return (
    <Modal
      {...props}
      footer={
        <>
          <Button variant="ghost" onClick={props.onClose}>
            {cancelText}
          </Button>
          <Button
            variant={variant === 'danger' ? 'danger' : 'primary'}
            onClick={() => {
              onConfirm();
              props.onClose();
            }}
          >
            {confirmText}
          </Button>
        </>
      }
    >
      <p className="cm-7">{message}</p>
    </Modal>
  );
}
