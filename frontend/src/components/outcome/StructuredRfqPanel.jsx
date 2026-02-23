export function StructuredRfqPanel({ contract }) {
  return (
    <section className="panel">
      <h2 className="text-lg font-semibold text-ink mb-3">Structured RFQ Contract</h2>
      {!contract ? (
        <p className="text-sm text-muted">No structured RFQ generated yet.</p>
      ) : (
        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap gap-2">
            <span className="chip chip-muted">RFQ: {contract.rfqId}</span>
            <span className="chip chip-muted">Variant: {contract.variantKey}</span>
            <span className="chip chip-muted">
              Deadline: {contract.responseDeadline ? new Date(contract.responseDeadline).toLocaleString() : "-"}
            </span>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <div className="timeline-card">
              <p className="text-xs text-muted">Target Unit Price</p>
              <p className="text-sm font-semibold text-ink">
                {contract.commercialTerms?.currency || "USD"} {contract.commercialTerms?.targetUnitPriceUsd ?? "-"}
              </p>
            </div>
            <div className="timeline-card">
              <p className="text-xs text-muted">Target MOQ</p>
              <p className="text-sm font-semibold text-ink">{contract.commercialTerms?.targetMoq ?? "-"}</p>
            </div>
            <div className="timeline-card">
              <p className="text-xs text-muted">Target Lead Time</p>
              <p className="text-sm font-semibold text-ink">{contract.commercialTerms?.targetLeadTimeDays ?? "-"} days</p>
            </div>
          </div>

          {(contract.deliverables || []).length ? (
            <div className="text-xs text-muted">
              <p className="font-mono text-ink mb-1">Deliverables</p>
              {(contract.deliverables || []).map((item, idx) => (
                <p key={`${item}-${idx}`}>- {item}</p>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
