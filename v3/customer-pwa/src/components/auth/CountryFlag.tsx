"use client";

import { countryFlag } from "@/lib/countries";

/**
 * Country flag rendered as the unicode regional-indicator emoji — NO network
 * dependency. The previous implementation loaded 248 flag images from
 * flagcdn.com every time the picker opened; when the CDN was slow or down the
 * selector showed a broken image and the picker list looked empty/broken
 * ("country selection doesn't show up sometimes"). Emoji flags render
 * instantly on phones (Android/iOS) and offline; on Windows they fall back to
 * the ISO letter code (e.g. "MY"), which is still readable.
 */
export default function CountryFlag({
  code,
  width = 24,
  height = 16,
  className = "",
}: {
  code: string;
  size?: "h20" | "h24" | "w40" | "w80";
  width?: number;
  height?: number;
  className?: string;
}) {
  return (
    <span
      className={className}
      aria-hidden
      style={{
        width,
        height,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.max(10, height - 4),
        lineHeight: 1,
        userSelect: "none",
        overflow: "hidden",
      }}
    >
      {countryFlag(code)}
    </span>
  );
}
