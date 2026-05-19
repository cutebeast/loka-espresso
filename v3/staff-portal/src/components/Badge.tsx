"use client";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "green" | "yellow" | "red" | "blue" | "gray" | "orange" | "purple" | "primary" | "outline" | "amber";
  size?: "sm" | "md";
  className?: string;
  style?: React.CSSProperties;
}

export default function Badge({ children, variant = "gray", size = "md", className = "", style }: BadgeProps) {
  const sizeClass = size === "sm" ? "badge-sm" : "";
  return <span className={`badge ${sizeClass} badge-${variant} ${className}`} style={style}>{children}</span>;
}
