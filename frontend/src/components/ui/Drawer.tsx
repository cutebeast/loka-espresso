'use client';

import { useEffect } from 'react';

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: number;
}

export function Drawer({ isOpen, onClose, title, children, width = 720 }: DrawerProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) onClose();
    }
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="d-0">
      <div
        className="d-1"
        onClick={onClose}
      />
      <div className="d-panel" style={{ width: width }}>
        <div className="d-2">
          <h2 className="d-3">{title}</h2>
          <button
            className="btn btn-sm d-4"
            onClick={onClose}
            
          >
            <i className="fas fa-times"></i>
          </button>
        </div>
        <div className="d-5">
          {children}
        </div>
      </div>
    </div>
  );
}
