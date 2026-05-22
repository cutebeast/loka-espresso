"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { Customer, Table } from "@/lib/api";

export function usePosScanner(tables: Table[], onCustomerScan?: (customer: Customer) => void) {
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
            const custMatch = decodedText.match(/loka:customer:(\d+)/);
            let customerId: number | null = null;
            if (custMatch) {
              customerId = parseInt(custMatch[1], 10);
            } else {
              const rawId = parseInt(decodedText.trim(), 10);
              if (!isNaN(rawId)) customerId = rawId;
            }
            if (customerId) {
              const customer: Customer = { id: customerId, display_name: `Customer #${customerId}`, phone_number: "" };
              onCustomerScan?.(customer);
              setShowQrScanner(false);
              scanner.stop().catch((err: unknown) => console.error("Scanner stop failed:", err));
            } else {
              setScannerError("Invalid QR code. Please scan a valid customer QR.");
              scanner.stop().catch((err: unknown) => console.error("Scanner stop failed:", err));
            }
            return;
          }
          const match = decodedText.match(/loka:table:(.+)/);
          if (match) {
            const token = match[1];
            const table = tables.find((t) => t.qr_code_token === token);
            if (table) {
              // Table matched - handled by parent
              setShowQrScanner(false);
              scanner.stop().catch((err: unknown) => console.error("Scanner stop failed:", err));
              return;
            }
          }
          const tableNum = tables.find((t) => t.table_number === decodedText.trim());
          if (tableNum) {
            setShowQrScanner(false);
            scanner.stop().catch((err: unknown) => console.error("Scanner stop failed:", err));
          } else {
            setScannerError("Invalid QR code. Please scan a valid table QR.");
            scanner.stop().catch((err: unknown) => console.error("Scanner stop failed:", err));
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
  }, [qrScanMode, tables, onCustomerScan]);

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
