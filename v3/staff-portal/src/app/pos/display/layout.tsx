import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Customer Display — Loka Espresso",
  description: "Customer-facing order display for the counter screen",
};

export default function DisplayLayout({ children }: { children: React.ReactNode }) {
  return children;
}
