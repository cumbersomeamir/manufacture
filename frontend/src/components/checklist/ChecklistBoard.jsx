export function ChecklistBoard({ checklist = [] }) {
  return (
    <section className="panel">
      <h2 className="text-lg font-semibold text-ink mb-3">Sequential Manufacturing Checklist</h2>
      <div className="space-y-2">
        {(checklist || []).map((item, index) => (
          <article key={item.id} className="check-row">
            <div className="flex items-start gap-3">
              <span className="order-pill">{index + 1}</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">{item.title}</p>
                <p className="text-xs text-muted mt-1">{item.description}</p>
                {item.evidence ? <p className="text-xs text-subtle mt-2">Evidence: {item.evidence}</p> : null}
                {item.nextAction ? <p className="text-xs text-subtle mt-1">Next: {item.nextAction}</p> : null}
              </div>
            </div>
            <span className={`chip ${item.status === "validated" ? "chip-ok" : item.status === "in_progress" ? "chip-progress" : item.status === "blocked" ? "chip-blocked" : "chip-muted"}`}>
              {String(item.status).replace("_", " ")}
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}
