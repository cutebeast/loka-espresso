import { create } from 'zustand';
import React from 'react';
import type { MerchantMenuItem } from '@/lib/merchant-types';
import { useAuthStore } from './authStore';

interface UIState {
  showStoreModal: boolean;
  showModal: boolean;
  modalContent: React.ReactNode;
  modalTitle: string;
  collapsedGroups: Record<string, boolean>;
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  showChangePassword: boolean;
  showProfile: boolean;
  notifRefreshKey: number;
  customizingItem: MerchantMenuItem | null;

  setShowStoreModal: (v: boolean) => void;
  setShowModal: (v: boolean) => void;
  setModalContent: (v: React.ReactNode) => void;
  setModalTitle: (v: string) => void;
  setCollapsedGroups: (v: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => void;
  setSidebarOpen: (v: boolean) => void;
  setSidebarCollapsed: (v: boolean) => void;
  setShowChangePassword: (v: boolean) => void;
  setShowProfile: (v: boolean) => void;
  setNotifRefreshKey: (v: number | ((k: number) => number)) => void;
  setCustomizingItem: (v: MerchantMenuItem | null) => void;
  openBroadcastModal: () => void;
}

export const useUIStore = create<UIState>()((set) => ({
  showStoreModal: false,
  showModal: false,
  modalContent: null,
  modalTitle: '',
  collapsedGroups: {},
  sidebarOpen: typeof window !== 'undefined' ? window.innerWidth > 1024 : false,
  sidebarCollapsed: false,
  showChangePassword: false,
  showProfile: false,
  notifRefreshKey: 0,
  customizingItem: null,

  setShowStoreModal: (v) => set({ showStoreModal: v }),
  setShowModal: (v) => set({ showModal: v }),
  setModalContent: (v) => set({ modalContent: v }),
  setModalTitle: (v) => set({ modalTitle: v }),
  setCollapsedGroups: (v) =>
    set((state) => ({
      collapsedGroups: typeof v === 'function' ? (v as (prev: Record<string, boolean>) => Record<string, boolean>)(state.collapsedGroups) : v,
    })),
  setSidebarOpen: (v) => set({ sidebarOpen: v }),
  setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
  setShowChangePassword: (v) => set({ showChangePassword: v }),
  setShowProfile: (v) => set({ showProfile: v }),
  setNotifRefreshKey: (v) =>
    set((state) => ({
      notifRefreshKey: typeof v === 'function' ? v(state.notifRefreshKey) : v,
    })),
  setCustomizingItem: (v) => set({ customizingItem: v }),

  openBroadcastModal: () => {
    import('@/components/Modals').then(({ AddBroadcastForm }) => {
      const token = useAuthStore.getState().token;
      set({
        modalTitle: 'New Broadcast',
        modalContent: React.createElement(AddBroadcastForm, {
          token,
          onClose: () => {
            set((state) => ({
              showModal: false,
              notifRefreshKey: state.notifRefreshKey + 1,
            }));
          },
        }),
        showModal: true,
      });
    });
  },
}));
