function fmt(value, suffix = "") {
  if (value === null || value === undefined || value === "") return "-";
  const num = Number(value);
  if (Number.isFinite(num)) return `${num.toLocaleString()}${suffix}`;
  return `${value}${suffix}`;
}

function Tile({ label, value }) {
  return (
    <div className="status-tile status-pending">
      <p className="text-xs uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-sm font-mono mt-1">{value}</p>
    </div>
  );
}

export function OutcomeKpiPanel({ metrics }) {
  const lead = metrics?.leadTime || {};
  const funnel = metrics?.funnel || {};
  const economics = metrics?.economics || {};

  return (
    <section className="panel">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-ink mb-3">Outcome Metrics</h2>
        <span className="chip chip-muted text-xs">
          {metrics?.generatedAt ? `Updated ${new Date(metrics.generatedAt).toLocaleString()}` : "No metrics"}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="First Supplier (h)" value={fmt(lead.timeToFirstSupplierHours)} />
        <Tile label="First Outreach (h)" value={fmt(lead.timeToFirstOutreachHours)} />
        <Tile label="First Quote (h)" value={fmt(lead.timeToFirstQuoteHours)} />
        <Tile label="Award Time (h)" value={fmt(lead.timeToAwardHours)} />
        <Tile label="Suppliers" value={fmt(funnel.suppliersIdentified)} />
        <Tile label="Responded" value={fmt(funnel.suppliersResponded)} />
        <Tile label="Comparable Quotes" value={fmt(funnel.quotesComparable)} />
        <Tile label="Follow-ups Sent" value={fmt(funnel.followUpsSent)} />
        <Tile label="Min Quote USD" value={fmt(economics.quotedUnitCostMin)} />
        <Tile label="Median Quote USD" value={fmt(economics.quotedUnitCostMedian)} />
        <Tile label="Expected Landed USD" value={fmt(economics.expectedLandedUnitCostUsd)} />
        <Tile label="Savings vs Should-Cost" value={fmt(economics.savingsVsShouldCostUsd)} />
      </div>
    </section>
  );
}
