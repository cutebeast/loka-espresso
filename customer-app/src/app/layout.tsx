import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Loka Espresso",
  description: "Artisan Coffee · Community · Culture",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Loka Espresso",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
  },
  applicationName: "Loka Espresso",
  authors: [{ name: "Loka Espresso" }],
  keywords: ["coffee", "cafe", "loyalty", "rewards", "malaysia"],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  themeColor: "#384B16",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        {/* iOS PWA Splash Screens */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Loka Espresso" />
        
        {/* MS Tile Color */}
        <meta name="msapplication-TileColor" content="#384B16" />
        <meta name="msapplication-TileImage" content="/icon-192.png" />
        
        {/* Theme Colors for different platforms */}
        <meta name="theme-color" content="#384B16" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#2A3910" media="(prefers-color-scheme: dark)" />
        <meta name="screen-orientation" content="portrait" />
        
        {/* Preconnect for performance */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="font-sans antialiased bg-[#E4EAEF]">
        <ServiceWorkerRegistrar />
        {children}
      </body>
    </html>
  );
}
