import type { Metadata, Viewport } from "next";
import "@/lib/logger";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import { LangAttribute } from "@/components/shared/LangAttribute";
import { LocaleProviderWrapper } from "@/components/LocaleProviderWrapper";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:13810"),
  title: "LOKA Espresso",
  description: "Artisan Coffee · Community · Culture",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "LOKA Espresso",
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
  applicationName: "LOKA Espresso",
  authors: [{ name: "LOKA Espresso" }],
  keywords: ["coffee", "cafe", "loyalty", "rewards", "malaysia"],
  openGraph: {
    title: "LOKA Espresso",
    description: "Artisan Coffee · Community · Culture",
    images: [{ url: "/icon-512.png", width: 512, height: 512, alt: "LOKA Espresso" }],
    type: "website",
    locale: "en_MY",
  },
  twitter: {
    card: "summary_large_image",
    title: "LOKA Espresso",
    description: "Artisan Coffee · Community · Culture",
    images: ["/icon-512.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  themeColor: "#16130F",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html suppressHydrationWarning>
      <head>
        {/* Theme boot — set data-theme before first paint (default: dark "Loka
            Ritual"; localStorage 'loka-theme' = 'light' restores light mode).
            The self-ordering kiosk (kiosk.* subdomain) stays light: a bright
            in-store LCD reads better in the light theme than the dark one. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(location.hostname.indexOf('kiosk.')===0||(location.hash||'').indexOf('#kiosk')===0){document.documentElement.dataset.theme='light';return;}var t=localStorage.getItem('loka-theme');document.documentElement.dataset.theme=(t==='light'||t==='dark')?t:'dark';}catch(e){document.documentElement.dataset.theme='dark';}})()`,
          }}
        />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400;14..32,500;14..32,600;14..32,700;14..32,800&family=Playfair+Display:ital,wght@0,500;0,600;0,700;1,500&family=Noto+Sans+SC:wght@400;500;600;700&family=Noto+Sans+Tamil:wght@400;500;600;700&family=Noto+Sans+Arabic:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        {/* iOS PWA Splash Screens */}
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="LOKA Espresso" />
        <link rel="apple-touch-startup-image" media="screen and (device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)" href="/icon-512.png" />
        <link rel="apple-touch-startup-image" media="screen and (device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)" href="/icon-512.png" />
        <link rel="apple-touch-startup-image" media="screen and (device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)" href="/icon-512.png" />
        <link rel="apple-touch-startup-image" media="screen and (device-width: 360px) and (device-height: 780px) and (-webkit-device-pixel-ratio: 3)" href="/icon-512.png" />
        <link rel="apple-touch-startup-image" media="screen and (device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2)" href="/icon-512.png" />
        
        {/* MS Tile Color */}
        <meta name="msapplication-TileColor" content="#16130F" />
        <meta name="msapplication-TileImage" content="/icon-192.png" />
        
        {/* Theme Colors for different platforms */}
        <meta name="theme-color" content="#16130F" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#16130F" media="(prefers-color-scheme: dark)" />
        <meta name="screen-orientation" content="portrait" />
        
        {/* Preconnect for performance */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://js.stripe.com" />
        <link rel="preconnect" href="https://hooks.stripe.com" />
      </head>
      <body className="antialiased">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:text-gray-900 focus:px-4 focus:py-2 focus:rounded focus:shadow-lg">Skip to content</a>
        <LangAttribute />
        <ServiceWorkerRegistrar />
        <LocaleProviderWrapper>{children}</LocaleProviderWrapper>
      </body>
    </html>
  );
}
