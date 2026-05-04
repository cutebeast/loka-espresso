'use client';

import { useAuthStore, useMerchantDataStore, useUIStore } from '@/stores';
import ChangePasswordModal from '@/components/ChangePasswordModal';
import ProfileUpdateModal from '@/components/ProfileUpdateModal';
import CustomizationManager from '@/components/CustomizationManager';

export default function AdminModals() {
  const showModal = useUIStore((s) => s.showModal);
  const setShowModal = useUIStore((s) => s.setShowModal);
  const modalTitle = useUIStore((s) => s.modalTitle);
  const modalContent = useUIStore((s) => s.modalContent);
  const showChangePassword = useUIStore((s) => s.showChangePassword);
  const setShowChangePassword = useUIStore((s) => s.setShowChangePassword);
  const showStoreModal = useUIStore((s) => s.showStoreModal);
  const setShowStoreModal = useUIStore((s) => s.setShowStoreModal);
  const stores = useMerchantDataStore((s) => s.stores);
  const setSelectedStore = useMerchantDataStore((s) => s.setSelectedStore);
  const customizingItem = useUIStore((s) => s.customizingItem);
  const setCustomizingItem = useUIStore((s) => s.setCustomizingItem);
  const token = useAuthStore((s) => s.token);
  const fetchMenu = useMerchantDataStore((s) => s.fetchMenu);
  const showProfile = useUIStore((s) => s.showProfile);
  const setShowProfile = useUIStore((s) => s.setShowProfile);
  const currentUserName = useAuthStore((s) => s.currentUserName);
  const currentUserPhone = useAuthStore((s) => s.currentUserPhone);
  const currentUserEmail = useAuthStore((s) => s.currentUserEmail);
  const setCurrentUserName = useAuthStore((s) => s.setCurrentUserName);
  const setCurrentUserPhone = useAuthStore((s) => s.setCurrentUserPhone);

  return (
    <>
      {showStoreModal && (
        <div className="modal-overlay" onClick={() => setShowStoreModal(false)}>
          <div className="modal md-4" onClick={e => e.stopPropagation()}>
            <h3 className="md-5">Select Store</h3>
            <div className="md-6">
              <button className="btn md-7" onClick={() => { setSelectedStore('all'); setShowStoreModal(false); }}>All Stores (Global view)</button>
            </div>
            {stores.map((s: any) => (
              <button key={s.id} className="btn md-8" onClick={() => { setSelectedStore(String(s.id)); setShowStoreModal(false); }}>{s.name} &middot; {s.address}</button>
            ))}
            <button className="btn btn-primary md-9" onClick={() => setShowStoreModal(false)}>Done</button>
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="md-10">
              <h3>{modalTitle}</h3>
              <button className="btn btn-sm" onClick={() => setShowModal(false)}><i className="fas fa-times"></i></button>
            </div>
            {modalContent}
          </div>
        </div>
      )}

      {customizingItem && (
        <div className="modal-overlay" onClick={() => setCustomizingItem(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="md-11">
              <h3>Customizations: {customizingItem.name}</h3>
              <button className="btn btn-sm" onClick={() => setCustomizingItem(null)}><i className="fas fa-times"></i></button>
            </div>
            <CustomizationManager storeId={0} item={customizingItem} token={token} onClose={() => { setCustomizingItem(null); fetchMenu(); }} />
          </div>
        </div>
      )}

      {showChangePassword && (
        <div className="modal-overlay" onClick={() => setShowChangePassword(false)}>
          <div className="modal md-12" onClick={e => e.stopPropagation()}>
            <ChangePasswordModal token={token} onClose={() => setShowChangePassword(false)} />
          </div>
        </div>
      )}

      {showProfile && (
        <div className="modal-overlay" onClick={() => setShowProfile(false)}>
          <div className="modal md-12" onClick={e => e.stopPropagation()}>
            <ProfileUpdateModal
              currentName={currentUserName}
              currentPhone={currentUserPhone}
              currentEmail={currentUserEmail}
              onClose={() => setShowProfile(false)}
              onSaved={(name: string, phone: string) => { setCurrentUserName(name); setCurrentUserPhone(phone); }}
            />
          </div>
        </div>
      )}
    </>
  );
}
