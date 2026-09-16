export default function ComingSoonCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-dashed border-card-border bg-card-bg/60 p-5">
      <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
      <p className="mt-2 text-sm text-soft">{description}</p>
    </section>
  );
}
