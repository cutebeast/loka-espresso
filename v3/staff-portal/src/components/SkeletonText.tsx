"use client";

export default function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton skeleton-text" style={{ width: i === lines - 1 ? "60%" : "100%" }} />
      ))}
    </>
  );
}
