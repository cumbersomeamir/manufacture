function fmt(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(2) : "-";
}

export function AwardDecisionPanel({ decision }) {
  return (
    <section className="panel">
      <h2 className="text-lg font-semibold text-ink mb-3">Award Gate</h2>
      {!decision ? (
        <p className="text-sm text-muted">No award decision generated yet.</p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <span className="chip chip-ok">Recommended: {decision.recommended?.supplierName || "-"}</span>
            <span className="chip chip-muted">Score: {fmt(decision.recommended?.totalScore)}</span>
            <span className="chip chip-muted">Landed: ${fmt(decision.recommended?.landedUnitCostUsd)}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-muted border-b border-line">
                  <th className="py-2 pr-4">Supplier</th>
                  <th className="py-2 pr-4">Total Score</th>
                  <th className="py-2 pr-4">Landed USD</th>
                  <th className="py-2 pr-4">Lead Days</th>
                  <th className="py-2 pr-4">MOQ</th>
                </tr>
              </thead>
              <tbody>
                {(decision.ranking || []).map((row) => (
                  <tr key={row.supplierId} className="border-b border-line/60">
                    <td className="py-2 pr-4">{row.supplierName}</td>
                    <td className="py-2 pr-4">{fmt(row.totalScore)}</td>
                    <td className="py-2 pr-4">{fmt(row.landedUnitCostUsd)}</td>
                    <td className="py-2 pr-4">{row.leadTimeDays ?? "-"}</td>
                    <td className="py-2 pr-4">{row.moq ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {decision.samplePo ? (
            <div className="timeline-card">
              <p className="text-sm font-semibold text-ink">Sample PO Packet</p>
              <p className="text-xs text-muted mt-1">PO: {decision.samplePo.poId}</p>
              <p className="text-xs text-muted">Supplier: {decision.samplePo.supplierName}</p>
              <p className="text-xs text-muted">
                Qty: {decision.samplePo.sampleQuantityUnits} · Unit: ${fmt(decision.samplePo.unitPriceUsd)} · Est Total: ${fmt(decision.samplePo.estimatedTotalUsd)}
              </p>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
