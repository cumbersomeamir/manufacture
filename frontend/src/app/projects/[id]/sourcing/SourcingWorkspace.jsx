"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  discoverSourcingSuppliers,
  getProject,
  getSourcingMetrics,
  ingestSourcingReply,
  negotiateSourcing,
  prepareSourcingOutreach,
  sendSourcingOutreach,
  syncSourcingReplies,
  updateSourcingBrief,
} from "@/store/project.store";

function ActionButton({ children, onClick, disabled }) {
  return (
    <button type="button" className="btn-secondary" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

function KpiTile({ label, value }) {
  return (
    <div className="rounded-xl border border-line bg-[color:var(--surface-2)] px-3 py-3">
      <p className="text-xs text-muted font-mono">{label}</p>
      <p className="text-xl font-semibold text-ink mt-1">{value ?? "-"}</p>
    </div>
  );
}

function SupplierRow({ supplier, selected, onToggle }) {
  return (
    <tr className="border-b border-line/60">
      <td className="py-3 pr-3 align-top">
        <input type="checkbox" checked={selected} onChange={() => onToggle(supplier.id)} />
      </td>
      <td className="py-3 pr-4 align-top">
        <p className="font-medium text-ink">{supplier.name}</p>
        <p className="text-xs text-muted">{supplier.email || supplier.phone || "No contact"}</p>
      </td>
      <td className="py-3 pr-4 align-top"><span className="chip chip-muted">{supplier.platform || supplier.marketplace || "web"}</span></td>
      <td className="py-3 pr-4 align-top">{supplier.city || "-"}</td>
      <td className="py-3 pr-4 align-top">{supplier.state || "-"}</td>
      <td className="py-3 pr-4 align-top">{Number.isFinite(Number(supplier.priceInrPerKg)) ? `INR ${supplier.priceInrPerKg}/kg` : "-"}</td>
      <td className="py-3 pr-4 align-top">{Number.isFinite(Number(supplier.moqKg || supplier.moq)) ? `${supplier.moqKg || supplier.moq} kg` : "-"}</td>
      <td className="py-3 pr-4 align-top">{Number.isFinite(Number(supplier.leadTimeDays)) ? `${supplier.leadTimeDays} d` : "-"}</td>
      <td className="py-3 pr-4 align-top">{Math.round((supplier.confidenceScore || 0) * 100)}%</td>
      <td className="py-3 pr-4 align-top">
        {supplier.listingUrl || supplier.website ? (
          <a href={supplier.listingUrl || supplier.website} target="_blank" rel="noreferrer" className="text-xs underline text-ink">Open</a>
        ) : "-"}
      </td>
    </tr>
  );
}

export function SourcingWorkspace({ projectId }) {
  const [project, setProject] = useState(null);
  const [busy, setBusy] = useState({});
  const [error, setError] = useState("");
  const [selectedSupplierIds, setSelectedSupplierIds] = useState([]);
  const [channels, setChannels] = useState(["email", "whatsapp"]);
  const [ingest, setIngest] = useState({ supplierId: "", channel: "email", replyText: "" });
  const [negotiation, setNegotiation] = useState({ supplierId: "", unitPriceInrPerKg: "", moqKg: "", leadTimeDays: "", channel: "whatsapp", sendMessage: true });

  const [brief, setBrief] = useState({
    searchTerm: "",
    ingredientSpec: "",
    quantityTargetKg: "",
    targetCity: "",
    targetState: "",
    maxBudgetInrPerKg: "",
  });

  async function reload() {
    const data = await getProject(projectId);
    setProject(data);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await getProject(projectId);
        if (cancelled) return;
        setProject(data);
        const sourceBrief = data?.sourcing?.brief || {};
        setBrief({
          searchTerm: sourceBrief.searchTerm || "",
          ingredientSpec: sourceBrief.ingredientSpec || "",
          quantityTargetKg: sourceBrief.quantityTargetKg ?? "",
          targetCity: sourceBrief.targetCity || "",
          targetState: sourceBrief.targetState || "",
          maxBudgetInrPerKg: sourceBrief.maxBudgetInrPerKg ?? "",
        });
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load project");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const sourcing = project?.sourcing || {};
  const suppliers = sourcing.suppliers || [];
  const drafts = sourcing.outreachDrafts || [];
  const conversations = sourcing.conversations || [];
  const metrics = sourcing.metrics || null;

  useEffect(() => {
    if (!suppliers.length) {
      setSelectedSupplierIds([]);
      return;
    }
    setSelectedSupplierIds((current) => {
      const valid = current.filter((id) => suppliers.some((supplier) => supplier.id === id));
      return valid.length ? valid : suppliers.slice(0, Math.min(5, suppliers.length)).map((entry) => entry.id);
    });
  }, [project?.id, suppliers.length]);

  useEffect(() => {
    if (!suppliers.length) return;
    setIngest((prev) => ({
      ...prev,
      supplierId: prev.supplierId && suppliers.some((entry) => entry.id === prev.supplierId) ? prev.supplierId : suppliers[0].id,
    }));
    setNegotiation((prev) => ({
      ...prev,
      supplierId: prev.supplierId && suppliers.some((entry) => entry.id === prev.supplierId) ? prev.supplierId : suppliers[0].id,
    }));
  }, [suppliers]);

  function isBusy(key) {
    return Boolean(busy[key]);
  }

  async function runAction(key, fn) {
    setBusy((prev) => ({ ...prev, [key]: true }));
    setError("");
    try {
      const result = await fn();
      if (result?.project) setProject(result.project);
      else if (result?.id) setProject(result);
      return result;
    } catch (err) {
      setError(err.message || "Action failed");
      return null;
    } finally {
      setBusy((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  function toggleSupplier(supplierId) {
    setSelectedSupplierIds((current) =>
      current.includes(supplierId) ? current.filter((id) => id !== supplierId) : [...current, supplierId],
    );
  }

  function toggleChannel(channel) {
    setChannels((current) =>
      current.includes(channel) ? current.filter((item) => item !== channel) : [...current, channel],
    );
  }

  async function handleSaveBrief(event) {
    event.preventDefault();
    if (!brief.searchTerm.trim()) {
      setError("searchTerm is required");
      return;
    }

    await runAction("saveBrief", () =>
      updateSourcingBrief(projectId, {
        ...brief,
        quantityTargetKg: brief.quantityTargetKg ? Number(brief.quantityTargetKg) : null,
        maxBudgetInrPerKg: brief.maxBudgetInrPerKg ? Number(brief.maxBudgetInrPerKg) : null,
      }),
    );
  }

  async function handleDiscover() {
    await runAction("discover", () =>
      discoverSourcingSuppliers(projectId, {
        platforms: ["indiamart", "tradeindia", "justdial"],
        limit: 30,
      }),
    );
  }

  async function handlePrepareOutreach() {
    await runAction("prepareOutreach", () =>
      prepareSourcingOutreach(projectId, {
        supplierIds: selectedSupplierIds,
        channels,
      }),
    );
  }

  async function handleSendOutreach() {
    await runAction("sendOutreach", () =>
      sendSourcingOutreach(projectId, {
        autoSend: true,
      }),
    );
  }

  async function handleSyncReplies() {
    await runAction("syncReplies", () => syncSourcingReplies(projectId));
  }

  async function handleIngestReply(event) {
    event.preventDefault();
    if (!ingest.supplierId || !ingest.replyText.trim()) {
      setError("supplier and reply text are required");
      return;
    }

    const result = await runAction("ingestReply", () =>
      ingestSourcingReply(projectId, {
        supplierId: ingest.supplierId,
        channel: ingest.channel,
        replyText: ingest.replyText,
      }),
    );

    if (result) {
      setIngest((prev) => ({ ...prev, replyText: "" }));
    }
  }

  async function handleNegotiate(event) {
    event.preventDefault();
    if (!negotiation.supplierId) {
      setError("Select supplier for negotiation");
      return;
    }

    await runAction("negotiate", () =>
      negotiateSourcing(projectId, {
        supplierId: negotiation.supplierId,
        target: {
          unitPriceInrPerKg: negotiation.unitPriceInrPerKg ? Number(negotiation.unitPriceInrPerKg) : undefined,
          moqKg: negotiation.moqKg ? Number(negotiation.moqKg) : undefined,
          leadTimeDays: negotiation.leadTimeDays ? Number(negotiation.leadTimeDays) : undefined,
        },
        channel: negotiation.channel,
        sendMessage: Boolean(negotiation.sendMessage),
      }),
    );
  }

  async function handleRefreshMetrics() {
    await runAction("metrics", () => getSourcingMetrics(projectId));
  }

  const topMetrics = useMemo(() => {
    const funnel = metrics?.funnel || {};
    const economics = metrics?.economics || {};
    return {
      identified: funnel.suppliersIdentified ?? suppliers.length,
      contacted: funnel.suppliersContacted ?? 0,
      responded: funnel.suppliersResponded ?? 0,
      minPrice: Number.isFinite(Number(economics.minUnitPriceInrPerKg)) ? `INR ${economics.minUnitPriceInrPerKg}` : "-",
      bestMoq: Number.isFinite(Number(economics.bestMoqKg)) ? `${economics.bestMoqKg} kg` : "-",
      bestLead: Number.isFinite(Number(economics.bestLeadTimeDays)) ? `${economics.bestLeadTimeDays} d` : "-",
    };
  }, [metrics, suppliers.length]);

  if (!project) {
    return <p className="text-sm text-muted">Loading sourcing workspace...</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href={`/projects/${projectId}`} className="text-xs text-muted hover:text-ink">← Back to project workspace</Link>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-ink mt-1">Local Ingredient Sourcing</h1>
          <p className="text-sm text-muted">India-first sourcing flow for ingredients: discover, contact, parse replies, negotiate.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard" className="btn-ghost">Dashboard</Link>
          <ActionButton onClick={() => runAction("reload", reload)} disabled={isBusy("reload")}>Refresh</ActionButton>
        </div>
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <section className="panel">
        <h2 className="text-lg font-semibold text-ink mb-3">E2E KPI Strip</h2>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <KpiTile label="Identified" value={topMetrics.identified} />
          <KpiTile label="Contacted" value={topMetrics.contacted} />
          <KpiTile label="Responded" value={topMetrics.responded} />
          <KpiTile label="Min Price" value={topMetrics.minPrice} />
          <KpiTile label="Best MOQ" value={topMetrics.bestMoq} />
          <KpiTile label="Best Lead" value={topMetrics.bestLead} />
        </div>
      </section>

      <section className="panel">
        <h2 className="text-lg font-semibold text-ink mb-3">Ingredient Brief</h2>
        <form onSubmit={handleSaveBrief} className="grid gap-3 sm:grid-cols-2">
          <label className="field sm:col-span-2">
            <span>Search Term *</span>
            <input className="input" value={brief.searchTerm} onChange={(e) => setBrief((prev) => ({ ...prev, searchTerm: e.target.value }))} placeholder="chilli powder for snack seasoning" />
          </label>
          <label className="field sm:col-span-2">
            <span>Ingredient Specification</span>
            <textarea className="input" rows={3} value={brief.ingredientSpec} onChange={(e) => setBrief((prev) => ({ ...prev, ingredientSpec: e.target.value }))} placeholder="ASTA color 80+, moisture <10%, food grade" />
          </label>
          <label className="field">
            <span>Quantity Target (kg)</span>
            <input className="input" value={brief.quantityTargetKg} onChange={(e) => setBrief((prev) => ({ ...prev, quantityTargetKg: e.target.value }))} placeholder="100" />
          </label>
          <label className="field">
            <span>Max Budget (INR/kg)</span>
            <input className="input" value={brief.maxBudgetInrPerKg} onChange={(e) => setBrief((prev) => ({ ...prev, maxBudgetInrPerKg: e.target.value }))} placeholder="220" />
          </label>
          <label className="field">
            <span>Target City</span>
            <input className="input" value={brief.targetCity} onChange={(e) => setBrief((prev) => ({ ...prev, targetCity: e.target.value }))} placeholder="Lucknow" />
          </label>
          <label className="field">
            <span>Target State</span>
            <input className="input" value={brief.targetState} onChange={(e) => setBrief((prev) => ({ ...prev, targetState: e.target.value }))} placeholder="Uttar Pradesh" />
          </label>
          <div className="sm:col-span-2 flex gap-2 justify-end">
            <ActionButton onClick={handleDiscover} disabled={isBusy("discover")}>Discover Suppliers</ActionButton>
            <button type="submit" className="btn-primary" disabled={isBusy("saveBrief")}>Save Brief</button>
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-lg font-semibold text-ink">Marketplace Discovery</h2>
          <p className="text-xs text-muted font-mono">{suppliers.length} suppliers</p>
        </div>

        {suppliers.length === 0 ? (
          <p className="text-sm text-muted">Run discovery after saving your ingredient brief.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="text-left border-b border-line text-muted">
                  <th className="py-2 pr-3">Pick</th>
                  <th className="py-2 pr-4">Supplier</th>
                  <th className="py-2 pr-4">Platform</th>
                  <th className="py-2 pr-4">City</th>
                  <th className="py-2 pr-4">State</th>
                  <th className="py-2 pr-4">Price</th>
                  <th className="py-2 pr-4">MOQ</th>
                  <th className="py-2 pr-4">Lead</th>
                  <th className="py-2 pr-4">Confidence</th>
                  <th className="py-2 pr-4">Listing</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((supplier) => (
                  <SupplierRow key={supplier.id} supplier={supplier} selected={selectedSupplierIds.includes(supplier.id)} onToggle={toggleSupplier} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h2 className="text-lg font-semibold text-ink mb-3">Contact Actions</h2>
        <div className="flex flex-wrap gap-2 mb-3">
          <button type="button" className={`btn-ghost ${channels.includes("email") ? "btn-ghost-selected" : ""}`} onClick={() => toggleChannel("email")}>Email</button>
          <button type="button" className={`btn-ghost ${channels.includes("whatsapp") ? "btn-ghost-selected" : ""}`} onClick={() => toggleChannel("whatsapp")}>WhatsApp</button>
          <span className="chip chip-muted">Selected suppliers: {selectedSupplierIds.length}</span>
          <span className="chip chip-muted">Drafts: {drafts.length}</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <ActionButton onClick={handlePrepareOutreach} disabled={isBusy("prepareOutreach") || !suppliers.length}>Prepare Outreach</ActionButton>
          <ActionButton onClick={handleSendOutreach} disabled={isBusy("sendOutreach") || !drafts.length}>Send Outreach</ActionButton>
          <ActionButton onClick={handleSyncReplies} disabled={isBusy("syncReplies") || !suppliers.length}>Sync Replies</ActionButton>
        </div>
      </section>

      <section className="panel">
        <h2 className="text-lg font-semibold text-ink mb-3">Reply Parsing</h2>
        <form onSubmit={handleIngestReply} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
            <label className="field">
              <span>Supplier</span>
              <select className="input" value={ingest.supplierId} onChange={(e) => setIngest((prev) => ({ ...prev, supplierId: e.target.value }))}>
                <option value="">Select supplier</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Channel</span>
              <select className="input" value={ingest.channel} onChange={(e) => setIngest((prev) => ({ ...prev, channel: e.target.value }))}>
                <option value="email">Email</option>
                <option value="whatsapp">WhatsApp</option>
              </select>
            </label>
          </div>
          <label className="field">
            <span>Supplier Reply</span>
            <textarea className="input min-h-[120px]" value={ingest.replyText} onChange={(e) => setIngest((prev) => ({ ...prev, replyText: e.target.value }))} placeholder="Price INR 185/kg, MOQ 200kg, lead time 7 days, payment 30% advance..." />
          </label>
          <button type="submit" className="btn-secondary" disabled={isBusy("ingestReply")}>Parse Reply</button>
        </form>
      </section>

      <section className="panel">
        <h2 className="text-lg font-semibold text-ink mb-3">Negotiation</h2>
        <form onSubmit={handleNegotiate} className="grid gap-3 sm:grid-cols-2">
          <label className="field sm:col-span-2">
            <span>Supplier</span>
            <select className="input" value={negotiation.supplierId} onChange={(e) => setNegotiation((prev) => ({ ...prev, supplierId: e.target.value }))}>
              <option value="">Select supplier</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Target Unit Price (INR/kg)</span>
            <input className="input" value={negotiation.unitPriceInrPerKg} onChange={(e) => setNegotiation((prev) => ({ ...prev, unitPriceInrPerKg: e.target.value }))} placeholder="165" />
          </label>
          <label className="field">
            <span>Target MOQ (kg)</span>
            <input className="input" value={negotiation.moqKg} onChange={(e) => setNegotiation((prev) => ({ ...prev, moqKg: e.target.value }))} placeholder="100" />
          </label>
          <label className="field">
            <span>Target Lead Time (days)</span>
            <input className="input" value={negotiation.leadTimeDays} onChange={(e) => setNegotiation((prev) => ({ ...prev, leadTimeDays: e.target.value }))} placeholder="7" />
          </label>
          <label className="field">
            <span>Channel</span>
            <select className="input" value={negotiation.channel} onChange={(e) => setNegotiation((prev) => ({ ...prev, channel: e.target.value }))}>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">Email</option>
            </select>
          </label>
          <label className="field sm:col-span-2">
            <span className="inline-flex items-center gap-2">
              <input type="checkbox" checked={negotiation.sendMessage} onChange={(e) => setNegotiation((prev) => ({ ...prev, sendMessage: e.target.checked }))} />
              Send immediately after draft generation
            </span>
          </label>
          <div className="sm:col-span-2 flex gap-2 justify-end">
            <ActionButton onClick={handleRefreshMetrics} disabled={isBusy("metrics")}>Refresh Metrics</ActionButton>
            <button type="submit" className="btn-primary" disabled={isBusy("negotiate")}>Run Negotiation</button>
          </div>
        </form>
      </section>

      <section className="panel">
        <h2 className="text-lg font-semibold text-ink mb-3">Sourcing Conversation History</h2>
        {!conversations.length ? (
          <p className="text-sm text-muted">No sourcing conversations yet.</p>
        ) : (
          <div className="space-y-2">
            {[...conversations]
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              .map((entry) => {
                const supplier = suppliers.find((row) => row.id === entry.supplierId);
                return (
                  <article key={entry.id} className="timeline-card">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-ink">{entry.direction} · {entry.channel} · {supplier?.name || "Supplier"}</p>
                      <p className="text-xs text-muted font-mono">{new Date(entry.createdAt).toLocaleString()}</p>
                    </div>
                    {entry.subject ? <p className="text-xs text-muted mt-1">{entry.subject}</p> : null}
                    <p className="text-sm text-subtle mt-2 whitespace-pre-wrap">{entry.message}</p>
                    {entry.parsed ? (
                      <p className="mt-2 text-xs text-muted">
                        Parsed: INR {entry.parsed.unitPriceInrPerKg ?? "-"}/kg, MOQ {entry.parsed.moqKg ?? "-"}kg, lead {entry.parsed.leadTimeDays ?? "-"}d
                      </p>
                    ) : null}
                  </article>
                );
              })}
          </div>
        )}
      </section>
    </div>
  );
}
