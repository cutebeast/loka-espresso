"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import { BrandProvider, useBrand } from "@/components/BrandProvider";
import { TranslationProvider, useTranslation } from "@/lib/i18n";
import { STORAGE_KEYS, ROUTES } from "@/lib/constants";
import { refreshToken, BASE_URL } from "@/lib/api";

function clearSession() {
  localStorage.removeItem(STORAGE_KEYS.ADMIN_EMAIL);
  document.cookie = `admin_token=; Path=/; SameSite=Strict; Max-Age=0`;
  document.cookie = `admin_refresh_token=; Path=/; SameSite=Strict; Max-Age=0`;
}

function LayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isLogin = pathname === ROUTES.LOGIN;
  const [checked, setChecked] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const { faviconUrl } = useBrand();
  const { t } = useTranslation();

  useEffect(() => {
    if (!faviconUrl) return;
    let created: HTMLLinkElement | null = null;
    const link = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
    if (link) {
      link.type = "image/svg+xml";
      link.href = faviconUrl;
    } else {
      const el = document.createElement("link");
      el.rel = "icon";
      el.type = "image/svg+xml";
      el.href = faviconUrl;
      document.head.appendChild(el);
      created = el;
    }
    return () => {
      if (created) {
        created.remove();
      }
    };
  }, [faviconUrl]);

  // ── Idle timeout (30 min) ──
  useEffect(() => {
    if (isLogin) return;
    const IDLE_MS = 30 * 60 * 1000;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    const logoutIdle = () => {
      clearSession();
      router.replace(ROUTES.LOGIN);
    };

    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(logoutIdle, IDLE_MS);
    };

    const events = ["mousemove", "keydown", "click", "touchstart"];
    events.forEach((e) => window.addEventListener(e, resetIdleTimer, { passive: true }));
    resetIdleTimer();

    return () => {
      events.forEach((e) => window.removeEventListener(e, resetIdleTimer));
      if (idleTimer) clearTimeout(idleTimer);
    };
  }, [isLogin, router]);

  useEffect(() => {
    if (isLogin) { setChecked(true); return; }

    let cancelled = false;
    let redirectTimer: ReturnType<typeof setTimeout> | null = null;

    const verify = async () => {
      try {
        const res = await fetch(`${BASE_URL}/admin/auth/me`, { credentials: "include" });
        if (cancelled) return;

        if (res.status === 401) {
          const refreshed = await refreshToken();
          if (refreshed) {
            const retry = await fetch(`${BASE_URL}/admin/auth/me`, { credentials: "include" });
            if (cancelled) return;
            if (retry.status === 401) {
              clearSession();
              router.replace(ROUTES.LOGIN);
              return;
            }
            if (retry.status === 403) {
              setForbidden(true);
              redirectTimer = setTimeout(() => {
                if (!cancelled) { clearSession(); router.replace(ROUTES.LOGIN); }
              }, 2000);
              return;
            }
            setChecked(true);
            return;
          }
          clearSession();
          router.replace(ROUTES.LOGIN);
          return;
        }

        if (res.status === 403) {
          setForbidden(true);
          redirectTimer = setTimeout(() => {
            if (!cancelled) { clearSession(); router.replace(ROUTES.LOGIN); }
          }, 2000);
          return;
        }

        if (!res.ok) {
          clearSession();
          router.replace(ROUTES.LOGIN);
          return;
        }

        setChecked(true);
      } catch (err) {
        console.error("Auth verification failed:", err);
        if (!cancelled) { clearSession(); router.replace(ROUTES.LOGIN); }
      }
    };

    verify();
    return () => { cancelled = true; if (redirectTimer) clearTimeout(redirectTimer); };
  }, [pathname, router, isLogin]);

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {!isLogin && !forbidden && <Sidebar />}
      <main style={{ flex: 1, overflow: "auto", minWidth: 0 }}>
      {forbidden ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", textAlign: "center" }}>
          <div><p style={{ fontSize: 18, fontWeight: 700, color: "#991B1B" }}>{t("admin.common.accessDenied")}</p><p style={{ fontSize: 13, opacity: 0.6 }}>{t("admin.layout.staffForbidden")}</p></div>
        </div>
      ) : checked ? children : (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
          <div style={{ color: "var(--color-text-muted)" }}>{t("admin.common.loading")}</div>
        </div>
      )}
      </main>
    </div>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <BrandProvider>
      <TranslationProvider>
        <LayoutInner>{children}</LayoutInner>
      </TranslationProvider>
    </BrandProvider>
  );
}
