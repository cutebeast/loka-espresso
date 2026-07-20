"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { scanCustomerCode } from "@/lib/api";
import type { Customer, Table } from "@/lib/api";

export function usePosScanner(tables: Table[], onCustomerScan?: (customer: Customer) => void, onTableSelect?: (table: Table) => void) {
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [qrScanMode, setQrScanMode] = useState<"table" | "customer">("table");
  const [scannerError, setScannerError] = useState("");
  const scannerRef = useRef<{ stop: () => Promise<void> } | null>(null);
  const scannerMountedRef = useRef(true);
  const scannerStartingRef = useRef(false);

  useEffect(() => {
    return () => {
      scannerMountedRef.current = false;
      if (scannerRef.current) {
        scannerRef.current.stop().catch((err: unknown) => console.error("Scanner stop failed:", err));
        scannerRef.current = null;
      }
    };
  }, []);

  const startScanner = useCallback(async () => {
    if (scannerRef.current || scannerStartingRef.current) return;
    scannerStartingRef.current = true;
    setScannerError("");
    setShowQrScanner(true);
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      if (!scannerMountedRef.current) return;
      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText: string) => {
          if (qrScanMode === "customer") {
            // Resolve the scanned code via the backend so the real customer
            // record (name/phone) is linked, not a fabricated stub.
            scanner.stop().catch((err: unknown) => console.error("Scanner stop failed:", err)).finally(() => { scannerRef.current = null; });
            scanCustomerCode(decodedText)
              .then((data) => {
                if (!scannerMountedRef.current) return;
                onCustomerScan?.({ id: data.customer_id, display_name: data.customer_name, phone_number: data.customer_phone });
                setShowQrScanner(false);
              })
              .catch((err: unknown) => {
                if (!scannerMountedRef.current) return;
                console.error("Customer scan failed:", err);
                setScannerError("Invalid QR code. Please scan a valid customer QR.");
              });
            return;
          }
          const match = decodedText.match(/loka:table:(.+)/);
          if (match) {
            const token = match[1];
            const table = tables.find((t) => t.qr_code_token === token);
            if (table) {
              onTableSelect?.(table);
              setShowQrScanner(false);
              scanner.stop().catch((err: unknown) => console.error("Scanner stop failed:", err)).finally(() => { scannerRef.current = null; });
              return;
            }
          }
          const tableNum = tables.find((t) => t.table_number === decodedText.trim());
          if (tableNum) {
            onTableSelect?.(tableNum);
            setShowQrScanner(false);
            scanner.stop().catch((err: unknown) => console.error("Scanner stop failed:", err)).finally(() => { scannerRef.current = null; });
          } else {
            setScannerError("Invalid QR code. Please scan a valid table QR.");
            scanner.stop().catch((err: unknown) => console.error("Scanner stop failed:", err)).finally(() => { scannerRef.current = null; });
          }
        },
        () => {}
      );
    } catch (e: unknown) {
      if (!scannerMountedRef.current) return;
      console.error("Scanner start failed:", e);
      const msg = (e as { message?: string })?.message || String(e);
      if (msg.toLowerCase().includes("permission") || msg.toLowerCase().includes("notallowed") || msg.toLowerCase().includes("denied")) {
        setScannerError("Camera permission denied. Please allow camera access in your browser settings.");
      } else if (msg.toLowerCase().includes("notfound") || msg.toLowerCase().includes("no camera")) {
        setScannerError("No camera found. Please connect a camera device.");
      } else {
        setScannerError("Could not start camera. " + msg);
      }
    } finally {
      scannerStartingRef.current = false;
    }
  }, [qrScanMode, tables, onCustomerScan, onTableSelect]);

  const stopScanner = useCallback(() => {
    if (scannerRef.current) {
      scannerRef.current.stop().catch((err: unknown) => console.error("Scanner stop failed:", err));
      scannerRef.current = null;
    }
    setShowQrScanner(false);
  }, []);

  return {
    showQrScanner, setShowQrScanner,
    qrScanMode, setQrScanMode,
    scannerError, setScannerError,
    startScanner,
    stopScanner,
  };
}
