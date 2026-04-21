import type { Metadata } from "next";
import "./globals.css";
import "@/styles/theme.css";

export const metadata: Metadata = {
  title: "Loka Espresso - Merchant Dashboard",
  description: "Merchant management portal for Loka Espresso",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" crossOrigin="anonymous" />
      </head>
      <body style={{ backgroundColor: '#f5f5f0' }}>{children}</body>
    </html>
  );
}
