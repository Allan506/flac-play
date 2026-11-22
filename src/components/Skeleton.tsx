export function TrackSkeleton() {
  return (
    <div className="track-row track-skeleton" aria-hidden="true">
      <div className="skeleton skeleton-index" />
      <div className="skeleton skeleton-cover" />
      <div className="skeleton-copy">
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-meta" />
      </div>
      <div className="skeleton skeleton-duration" />
      <div className="skeleton skeleton-actions" />
    </div>
  );
}

export function TrackSkeletonList({ count = 6 }: { count?: number }) {
  return (
    <div className="track-list" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <TrackSkeleton key={index} />
      ))}
    </div>
  );
}
