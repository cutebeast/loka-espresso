"use client";

import { useEffect, useRef, useState } from "react";
import Modal from "./Modal";

interface QrScannerModalProps {
  open: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
  title?: string;
}

export default function QrScannerModal({ open, onClose, onScan, title = "Scan QR Code" }: QrScannerModalProps) {
  const scannerRef = useRef<any>(null);
  const decodedRef = useRef(false);
  const mountedRef = useRef(true);
  const [error, setError] = useState("");

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!open) {
      setError("");
      if (scannerRef.current) {
        scannerRef.current.stop().catch((err: Error) => console.error("QR scanner stop failed:", err));
        scannerRef.current = null;
      }
      return;
    }
    decodedRef.current = false;
    setError("");

    const start = async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (!mountedRef.current) return;
        const scanner = new Html5Qrcode("qr-reader-modal");
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText: string) => {
            if (decodedRef.current) return;
            decodedRef.current = true;
            onScan(decodedText);
            scanner.stop().catch((err) => console.error("QR scanner stop failed:", err));
            scannerRef.current = null;
          },
          (err) => console.warn("QR scan error:", err)
        );
      } catch (err: unknown) {
        console.error("QR scanner failed:", err);
        const msg = (err as Error)?.message || String(err);
        if (msg.toLowerCase().includes("permission") || msg.toLowerCase().includes("notallowed") || msg.toLowerCase().includes("denied")) {
          setError("Camera permission denied. Please allow camera access in your browser settings, then try again.");
        } else if (msg.toLowerCase().includes("notfound") || msg.toLowerCase().includes("no camera")) {
          setError("No camera found. Please connect a camera device.");
        } else {
          setError("Could not start camera. " + msg);
        }
      }
    };

    start();

    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch((err: Error) => console.error("QR scanner cleanup failed:", err));
        scannerRef.current = null;
      }
    };
  }, [open, onScan]);

  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      {error ? (
        <div style={{ padding: 20, textAlign: "center" }}>
          <div style={{ fontSize: 14, color: "var(--color-error)", fontWeight: 600, marginBottom: 12 }}>{error}</div>
          <button type="button" className="btn btn-primary" onClick={onClose}>Close</button>
        </div>
      ) : (
        <>
          <div id="qr-reader-modal" style={{ width: "100%", minHeight: 250 }} />
          <p style={{ textAlign: "center", fontSize: 12, color: "var(--color-text-muted)", marginTop: 12 }}>
            Point camera at the QR code
          </p>
        </>
      )}
    </Modal>
  );
}
