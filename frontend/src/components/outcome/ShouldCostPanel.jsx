function fmtUsd(value) {
  const num = Number(value);
  return Number.isFinite(num) ? `$${num.toFixed(2)}` : "-";
}

export function ShouldCostPanel({ shouldCost }) {
  return (
    <section className="panel">
      <h2 className="text-lg font-semibold text-ink mb-3">Should-Cost Model</h2>
      {!shouldCost ? (
        <p className="text-sm text-muted">No should-cost model generated yet.</p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <span className="chip chip-muted">Profile: {shouldCost.profile || "general"}</span>
            <span className="chip chip-muted">Target Volume: {shouldCost.targetVolumeUnits || "-"} units</span>
            <span className="chip chip-muted">
              Landed: {fmtUsd(shouldCost?.costBreakdown?.landedUnitCostUsd)}
            </span>
            <span className="chip chip-muted">
              Tooling: {fmtUsd(shouldCost?.costBreakdown?.toolingUsd)}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-left text-muted border-b border-line">
                  <th className="py-2 pr-4">Component</th>
                  <th className="py-2 pr-4">Qty</th>
                  <th className="py-2 pr-4">Unit USD</th>
                  <th className="py-2 pr-4">Ext USD</th>
                  <th className="py-2 pr-4">Cost Driver</th>
                </tr>
              </thead>
              <tbody>
                {(shouldCost.bom || []).map((line, idx) => (
                  <tr key={`${line.component}-${idx}`} className="border-b border-line/60">
                    <td className="py-2 pr-4">
                      <p className="text-ink">{line.component}</p>
                      {line.specIntent ? <p className="text-xs text-muted">{line.specIntent}</p> : null}
                    </td>
                    <td className="py-2 pr-4">{line.qtyPerUnit ?? "-"}</td>
                    <td className="py-2 pr-4">{fmtUsd(line.unitCostUsd)}</td>
                    <td className="py-2 pr-4">{fmtUsd(line.extCostUsd)}</td>
                    <td className="py-2 pr-4 text-xs text-muted">{line.costDriver || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {(shouldCost.costLevers || []).length ? (
            <div className="text-xs text-muted space-y-1">
              <p className="font-mono text-ink">Cost Levers</p>
              {(shouldCost.costLevers || []).map((lever, idx) => (
                <p key={`${lever}-${idx}`}>- {lever}</p>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
