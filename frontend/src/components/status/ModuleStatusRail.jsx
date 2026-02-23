import { MODULE_LABELS, statusTone } from "@/store/ui.store";

export function ModuleStatusRail({ status = {} }) {
  return (
    <section className="panel">
      <h2 className="text-lg font-semibold text-ink mb-3">Execution Status</h2>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(MODULE_LABELS).map(([key, label]) => {
          const value = status[key] || "pending";
          return (
            <div key={key} className={`status-tile ${statusTone(value)}`}>
              <p className="text-xs uppercase tracking-wide opacity-70">{label}</p>
              <p className="text-sm font-mono mt-1">{String(value).replace("_", " ")}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
