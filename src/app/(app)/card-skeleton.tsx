export default function CardSkeleton({ title }: { title: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-2 shadow-sm sm:p-5">
      <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
      <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
      <div className="mt-4 animate-pulse space-y-2">
        <div className="h-3.5 w-3/4 rounded bg-field-border/70" />
        <div className="h-3.5 w-1/2 rounded bg-field-border/70" />
        <div className="h-3.5 w-2/3 rounded bg-field-border/70" />
      </div>
    </div>
  );
}
