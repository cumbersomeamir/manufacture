function formatNumber(value) {
  if (value === null || value === undefined || value === "") return "-";
  const num = Number(value);
  return Number.isFinite(num) ? num.toLocaleString() : "-";
}

export function SupplierComparison({ suppliers = [], onSelectSupplier }) {
  return (
    <section className="panel">
      <h2 className="text-lg font-semibold text-ink mb-3">Supplier Comparison</h2>

      {suppliers.length === 0 ? (
        <p className="text-sm text-muted">Run supplier discovery to populate candidates.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-muted border-b border-line">
                <th className="py-2 pr-4">Supplier</th>
                <th className="py-2 pr-4">Location</th>
                <th className="py-2 pr-4">Website</th>
                <th className="py-2 pr-4">Price</th>
                <th className="py-2 pr-4">MOQ</th>
                <th className="py-2 pr-4">Lead Time</th>
                <th className="py-2 pr-4">Confidence</th>
                <th className="py-2 pr-4">Action</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((supplier) => (
                <tr key={supplier.id} className="border-b border-line/60">
                  <td className="py-3 pr-4">
                    <p className="font-medium text-ink">{supplier.name}</p>
                    <p className="text-xs text-muted">{supplier.email || "No email"}</p>
                  </td>
                  <td className="py-3 pr-4">{supplier.location || "-"}</td>
                  <td className="py-3 pr-4">
                    {supplier.website ? (
                      <a
                        href={supplier.website}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-ink underline"
                      >
                        Open
                      </a>
                    ) : "-"}
                  </td>
                  <td className="py-3 pr-4">
                    {supplier.pricing?.unitPrice ? `${supplier.pricing.unitPrice} ${supplier.pricing.currency || "USD"}` : "-"}
                  </td>
                  <td className="py-3 pr-4">{formatNumber(supplier.moq)}</td>
                  <td className="py-3 pr-4">{supplier.leadTimeDays ? `${supplier.leadTimeDays} days` : "-"}</td>
                  <td className="py-3 pr-4">{Math.round((supplier.confidenceScore || 0) * 100)}%</td>
                  <td className="py-3 pr-4">
                    <button
                      type="button"
                      className={`btn-ghost ${supplier.selected ? "btn-ghost-selected" : ""}`}
                      onClick={() => onSelectSupplier?.(supplier.id)}
                    >
                      {supplier.selected ? "Selected" : "Select"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
