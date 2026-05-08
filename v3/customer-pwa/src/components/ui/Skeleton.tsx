'use client';

interface SkeletonProps {
  className?: string;
  variant?: 'rect' | 'circular' | 'text';
  width?: string | number;
  height?: string | number;
}

export function Skeleton({ className = '', variant = 'rect', width, height }: SkeletonProps) {
  const baseClass = 'skeleton';
  
  const variants = {
    rect: 'rounded-xl',
    circular: 'rounded-full',
    text: 'rounded h-4 w-full',
  };

  const style: React.CSSProperties = {};
  if (width) style.width = typeof width === 'number' ? `${width}px` : width;
  if (height) style.height = typeof height === 'number' ? `${height}px` : height;

  return (
    <div
      className={`${baseClass} ${variants[variant]} ${className}`}
      style={style}
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-card border border-gray-100">
      <Skeleton variant="rect" className="h-32 w-full mb-4" />
      <Skeleton variant="text" className="w-3/4 mb-2" />
      <Skeleton variant="text" className="w-1/2" />
    </div>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl p-3 shadow-card border border-gray-100">
      <Skeleton variant="rect" className="h-28 w-full mb-3" />
      <Skeleton variant="text" className="w-3/4 mb-2" />
      <Skeleton variant="text" className="w-1/2 mb-3" />
      <div className="flex justify-between items-center">
        <Skeleton variant="text" className="w-16" />
        <Skeleton variant="circular" className="w-9 h-9" />
      </div>
    </div>
  );
}

export function OrderCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-card border border-gray-100">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <Skeleton variant="text" className="w-24 mb-2" />
          <Skeleton variant="text" className="w-16" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton variant="rect" className="w-16 h-6 rounded-full" />
          <Skeleton variant="text" className="w-14" />
        </div>
      </div>
    </div>
  );
}
