function fmt(value) {
  const num = Number(value);
  if (Number.isFinite(num)) return num.toLocaleString();
  return "-";
}

function VariantCard({ variant }) {
  return (
    <article className="timeline-card">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">{variant.name}</p>
        <span className="chip chip-muted">{variant.key}</span>
      </div>
      <p className="text-xs text-muted mt-1">{variant.description}</p>
      <div className="mt-2 grid gap-1 text-xs text-subtle">
        <p>Volume: {variant.targetVolumeRange}</p>
        <p>Process: {variant.processStrategy}</p>
        <p>Tooling: ${fmt(variant.tooling?.costUsd)} ({variant.tooling?.type})</p>
        <p>Landed Unit: ${fmt(variant.unitEconomics?.landedUnitCostUsd)}</p>
        <p>Sample Days: {fmt(variant.timeline?.sampleDays)}</p>
        <p>Production Days: {fmt(variant.timeline?.productionDays)}</p>
      </div>
    </article>
  );
}

export function VariantsPanel({ variants = [] }) {
  return (
    <section className="panel">
      <h2 className="text-lg font-semibold text-ink mb-3">Manufacturing Variants</h2>
      {!variants.length ? (
        <p className="text-sm text-muted">No variant strategy generated yet.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {variants.map((variant) => (
            <VariantCard key={variant.key} variant={variant} />
          ))}
        </div>
      )}
    </section>
  );
}
