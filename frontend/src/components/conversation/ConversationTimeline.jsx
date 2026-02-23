export function ConversationTimeline({ conversations = [], suppliers = [] }) {
  const supplierMap = new Map(suppliers.map((supplier) => [supplier.id, supplier]));

  return (
    <section className="panel">
      <h2 className="text-lg font-semibold text-ink mb-3">Conversation History</h2>
      {conversations.length === 0 ? (
        <p className="text-sm text-muted">No conversation events yet.</p>
      ) : (
        <div className="space-y-2">
          {[...conversations]
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .map((event) => {
              const supplier = supplierMap.get(event.supplierId);
              return (
                <article key={event.id} className="timeline-card">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-ink">
                      {event.direction === "inbound" ? "Inbound" : "Outbound"} · {supplier?.name || "Supplier"}
                    </p>
                    <p className="text-xs text-muted font-mono">{new Date(event.createdAt).toLocaleString()}</p>
                  </div>
                  {event.subject ? <p className="text-xs text-muted mt-1">{event.subject}</p> : null}
                  <p className="text-sm text-subtle mt-2 whitespace-pre-wrap">{event.message}</p>
                  {event.parsed ? (
                    <div className="mt-2 rounded-lg border border-line bg-surface-2 p-2 text-xs text-muted">
                      Parsed: price {event.parsed.unitPrice ?? "-"}, MOQ {event.parsed.moq ?? "-"}, lead {event.parsed.leadTimeDays ?? "-"}d
                    </div>
                  ) : null}
                </article>
              );
            })}
        </div>
      )}
    </section>
  );
}
