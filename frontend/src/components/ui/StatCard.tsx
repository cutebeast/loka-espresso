'use client';

export function StatCard({ icon, color, label, value }: { icon: string; color: string; label: string; value: string }) {
  return (
    <div className="sc-0">
      <div>
        <div className="sc-1">{label}</div>
        <div className="sc-2">{value}</div>
      </div>
      <i className={`fas ${icon} sc-icon-lg`} style={{ color }}></i>
    </div>
  );
}
