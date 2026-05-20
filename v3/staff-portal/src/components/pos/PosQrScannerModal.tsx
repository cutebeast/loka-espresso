"use client";

import Modal from "@/components/Modal";

interface PosQrScannerModalProps {
  open: boolean;
  mode: "table" | "customer";
  scannerError: string;
  onClose: () => void;
}

export default function PosQrScannerModal({ open, mode, scannerError, onClose }: PosQrScannerModalProps) {
  return (
    <Modal open={open} onClose={onClose} title={mode === "customer" ? "Scan Customer QR" : "Scan Table QR"} size="sm">
      {scannerError ? (
        <div style={{ padding: 20, textAlign: "center" }}>
          <div style={{ fontSize: 14, color: "var(--color-error)", fontWeight: 600, marginBottom: 12 }}>{scannerError}</div>
          <button className="btn btn-primary" onClick={onClose}>Close</button>
        </div>
      ) : (
        <>
          <div id="qr-reader" style={{ width: "100%", minHeight: 250 }} />
          <p style={{ textAlign: "center", fontSize: 12, color: "var(--color-text-muted)", marginTop: 12 }}>
            Point camera at the QR code
          </p>
        </>
      )}
    </Modal>
  );
}
