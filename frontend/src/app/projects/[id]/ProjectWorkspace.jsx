"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  addSupplier,
  discoverSuppliers,
  finalizeSupplier,
  generateOutcomePlan,
  generateStructuredRfq,
  generateConceptImage,
  getProject,
  ingestSupplierReply,
  negotiateWithSupplier,
  prepareOutreach,
  refreshOutcomeMetrics,
  runAwardGate,
  runAutopilot,
  sendFollowUps,
  selectSupplier,
  sendOutreach,
  syncReplies,
} from "@/store/project.store";
import { ModuleStatusRail } from "@/components/status/ModuleStatusRail";
import { ChecklistBoard } from "@/components/checklist/ChecklistBoard";
import { SupplierComparison } from "@/components/supplier/SupplierComparison";
import { ConversationTimeline } from "@/components/conversation/ConversationTimeline";
import { OutcomeKpiPanel } from "@/components/outcome/OutcomeKpiPanel";
import { ShouldCostPanel } from "@/components/outcome/ShouldCostPanel";
import { VariantsPanel } from "@/components/outcome/VariantsPanel";
import { StructuredRfqPanel } from "@/components/outcome/StructuredRfqPanel";
import { AwardDecisionPanel } from "@/components/outcome/AwardDecisionPanel";

function ActionButton({ children, onClick, disabled }) {
  return (
    <button type="button" className="btn-secondary" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function ProjectWorkspace({ projectId }) {
  const [project, setProject] = useState(null);
  const [busyActions, setBusyActions] = useState({});
  const [error, setError] = useState("");
  const [reply, setReply] = useState("");
  const [replySupplierId, setReplySupplierId] = useState("");
  const [negotiationTarget, setNegotiationTarget] = useState({
    unitPrice: "",
    moq: "",
    leadTimeDays: "",
  });
  const [imagePrompt, setImagePrompt] = useState("");
  const [manualSupplier, setManualSupplier] = useState({
    name: "",
    email: "",
    website: "",
    country: "",
  });

  async function reloadProject() {
    const data = await getProject(projectId);
    setProject(data);
    setReplySupplierId((current) => current || data.suppliers?.[0]?.id || "");
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError("");
      try {
        const data = await getProject(projectId);
        if (!cancelled) {
          setProject(data);
          setReplySupplierId(data.suppliers?.[0]?.id || "");
          setImagePrompt(data.ideaImagePrompt || data.idea || "");
        }
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load project");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!project?.suppliers?.length) return;
    if (!replySupplierId || !project.suppliers.some((supplier) => supplier.id === replySupplierId)) {
      setReplySupplierId(project.suppliers[0].id);
    }
  }, [project, replySupplierId]);

  const selectedSupplier = useMemo(
    () => project?.suppliers?.find((supplier) => supplier.selected) || project?.suppliers?.[0] || null,
    [project],
  );
  const outcomeEngine = project?.outcomeEngine || {};

  function isActionBusy(actionKey) {
    return Boolean(busyActions[actionKey]);
  }

  async function runAction(actionKey, action) {
    if (!project) return;
    setBusyActions((prev) => ({ ...prev, [actionKey]: true }));
    setError("");
    try {
      const next = await action();
      if (next?.project) {
        setProject(next.project);
      } else if (next?.id) {
        setProject(next);
      }
    } catch (err) {
      setError(err.message || "Action failed");
    } finally {
      setBusyActions((prev) => {
        const next = { ...prev };
        delete next[actionKey];
        return next;
      });
    }
  }

  async function handleDiscover() {
    await runAction("discover", () => discoverSuppliers(projectId));
  }

  async function handlePrepare() {
    await runAction("prepareOutreach", () => prepareOutreach(projectId));
  }

  async function handleSend() {
    await runAction("sendOutreach", () => sendOutreach(projectId));
  }

  async function handleSyncReplies() {
    await runAction("syncReplies", () => syncReplies(projectId));
  }

  async function handleIngestReply(event) {
    event.preventDefault();
    if (!replySupplierId || !reply.trim()) {
      setError("Select supplier and paste a reply.");
      return;
    }

    await runAction("ingestReply", () =>
      ingestSupplierReply(projectId, {
        supplierId: replySupplierId,
        replyText: reply,
      }),
    );
    setReply("");
  }

  async function handleNegotiate() {
    const target = {
      unitPrice: negotiationTarget.unitPrice ? Number(negotiationTarget.unitPrice) : undefined,
      moq: negotiationTarget.moq ? Number(negotiationTarget.moq) : undefined,
      leadTimeDays: negotiationTarget.leadTimeDays ? Number(negotiationTarget.leadTimeDays) : undefined,
    };

    await runAction("negotiate", () =>
      negotiateWithSupplier(projectId, {
        supplierId: selectedSupplier?.id,
        target,
      }),
    );
  }

  async function handleGenerateImage() {
    if (!imagePrompt.trim()) {
      setError("Enter an image prompt first.");
      return;
    }

    await runAction("generateImage", () => generateConceptImage(projectId, { prompt: imagePrompt }));
  }

  async function handleSelectSupplier(supplierId) {
    await runAction("selectSupplier", () => selectSupplier(projectId, supplierId));
  }

  async function handleAutopilot() {
    await runAction("autopilot", () => runAutopilot(projectId));
  }

  async function handleGenerateOutcomePlan() {
    await runAction("outcomePlan", () => generateOutcomePlan(projectId, { variantKey: "pilot" }));
  }

  async function handleGenerateRfqContract() {
    await runAction("structuredRfq", () => generateStructuredRfq(projectId, { variantKey: "pilot" }));
  }

  async function handleRunAwardGate() {
    await runAction("awardGate", () => runAwardGate(projectId, { autoSelect: true }));
  }

  async function handleSendFollowUps() {
    await runAction("followUps", () => sendFollowUps(projectId));
  }

  async function handleRefreshOutcomeMetrics() {
    await runAction("outcomeMetrics", () => refreshOutcomeMetrics(projectId));
  }

  async function handleFinalizeSupplier() {
    if (!selectedSupplier) {
      setError("Select a supplier first.");
      return;
    }
    await runAction("finalizeSupplier", () => finalizeSupplier(projectId, selectedSupplier.id));
  }

  async function handleAddSupplier(event) {
    event.preventDefault();
    if (!manualSupplier.name.trim() || !manualSupplier.email.trim()) {
      setError("Supplier name and email are required.");
      return;
    }

    await runAction("addSupplier", () =>
      addSupplier(projectId, {
        name: manualSupplier.name,
        email: manualSupplier.email,
        website: manualSupplier.website,
        country: manualSupplier.country || "Unknown",
        location: manualSupplier.country || "Unknown",
      }),
    );

    setManualSupplier({
      name: "",
      email: "",
      website: "",
      country: "",
    });
  }

  if (!project) {
    return <p className="text-sm text-muted">Loading project...</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/dashboard" className="text-xs text-muted hover:text-ink">← Back to dashboard</Link>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-ink mt-1">{project.name}</h1>
          <p className="text-sm text-muted">{project.productDefinition?.summary || project.idea}</p>
        </div>
        <p className="text-xs font-mono text-muted">Updated {new Date(project.updatedAt).toLocaleString()}</p>
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <ModuleStatusRail status={project.moduleStatus} />

      <section className="panel">
        <h2 className="text-lg font-semibold text-ink mb-2">Project Definition</h2>
        <p className="text-sm text-subtle">{project.productDefinition?.summary || project.idea}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <span className="chip chip-muted">Category: {project.productDefinition?.manufacturingCategory || "General"}</span>
          <span className="chip chip-muted">Complexity: {project.productDefinition?.complexityLevel || "medium"}</span>
          <span className="chip chip-muted">Suppliers: {project.suppliers?.length || 0}</span>
          {selectedSupplier ? (
            <span className="chip chip-ok">Selected: {selectedSupplier.name}</span>
          ) : null}
        </div>
      </section>

      <section className="panel">
        <h2 className="text-lg font-semibold text-ink mb-3">Agent Actions</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <ActionButton onClick={handleAutopilot} disabled={isActionBusy("autopilot")}>Run Autopilot</ActionButton>
          <ActionButton onClick={handleGenerateOutcomePlan} disabled={isActionBusy("outcomePlan")}>Generate Outcome Plan</ActionButton>
          <ActionButton onClick={handleGenerateRfqContract} disabled={isActionBusy("structuredRfq")}>Generate Structured RFQ</ActionButton>
          <ActionButton onClick={handleRunAwardGate} disabled={isActionBusy("awardGate") || project.suppliers.length === 0}>Run Award Gate</ActionButton>
          <ActionButton onClick={handleSendFollowUps} disabled={isActionBusy("followUps") || project.suppliers.length === 0}>Send Follow-ups</ActionButton>
          <ActionButton onClick={handleRefreshOutcomeMetrics} disabled={isActionBusy("outcomeMetrics")}>Refresh Outcome Metrics</ActionButton>
          <ActionButton onClick={handleDiscover} disabled={isActionBusy("discover")}>Discover Suppliers</ActionButton>
          <ActionButton onClick={handlePrepare} disabled={isActionBusy("prepareOutreach") || project.suppliers.length === 0}>Prepare Outreach</ActionButton>
          <ActionButton onClick={handleSend} disabled={isActionBusy("sendOutreach") || project.outreachDrafts.length === 0}>Send Outreach</ActionButton>
          <ActionButton onClick={handleSyncReplies} disabled={isActionBusy("syncReplies") || project.suppliers.length === 0}>Sync Inbox Replies</ActionButton>
          <ActionButton onClick={handleNegotiate} disabled={isActionBusy("negotiate") || !selectedSupplier}>Generate Negotiation</ActionButton>
          <ActionButton onClick={handleFinalizeSupplier} disabled={isActionBusy("finalizeSupplier") || !selectedSupplier}>Finalize Supplier</ActionButton>
          <ActionButton onClick={() => runAction("refreshProject", () => reloadProject())} disabled={isActionBusy("refreshProject")}>Refresh</ActionButton>
        </div>
      </section>

      <ChecklistBoard checklist={project.checklist} />

      <OutcomeKpiPanel metrics={outcomeEngine.kpiSnapshot} />
      <ShouldCostPanel shouldCost={outcomeEngine.shouldCost} />
      <VariantsPanel variants={outcomeEngine.variants || []} />
      <StructuredRfqPanel contract={outcomeEngine.structuredRfq} />
      <AwardDecisionPanel decision={outcomeEngine.awardDecision} />

      <section className="panel">
        <h2 className="text-lg font-semibold text-ink mb-3">Nano Banana Product Concept</h2>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <input
            className="input"
            value={imagePrompt}
            onChange={(e) => setImagePrompt(e.target.value)}
            placeholder="Describe the product concept render"
          />
          <button type="button" className="btn-secondary" onClick={handleGenerateImage} disabled={isActionBusy("generateImage")}>
            Generate Image
          </button>
        </div>
        {project.generatedImages?.[0]?.image ? (
          <img
            src={project.generatedImages[0].image}
            alt="Latest generated concept"
            className="mt-3 w-full rounded-xl border border-line object-cover"
          />
        ) : (
          <p className="text-sm text-muted mt-2">No concept image yet.</p>
        )}
      </section>

      <SupplierComparison suppliers={project.suppliers} onSelectSupplier={handleSelectSupplier} />

      <section className="panel">
        <h2 className="text-lg font-semibold text-ink mb-3">Add Supplier Manually</h2>
        <form onSubmit={handleAddSupplier} className="grid gap-3 sm:grid-cols-2">
          <input
            className="input"
            value={manualSupplier.name}
            onChange={(e) => setManualSupplier((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Supplier name"
          />
          <input
            className="input"
            value={manualSupplier.email}
            onChange={(e) => setManualSupplier((prev) => ({ ...prev, email: e.target.value }))}
            placeholder="supplier@company.com"
          />
          <input
            className="input"
            value={manualSupplier.website}
            onChange={(e) => setManualSupplier((prev) => ({ ...prev, website: e.target.value }))}
            placeholder="https://company.com"
          />
          <input
            className="input"
            value={manualSupplier.country}
            onChange={(e) => setManualSupplier((prev) => ({ ...prev, country: e.target.value }))}
            placeholder="Country"
          />
          <div className="sm:col-span-2 flex justify-end">
            <button type="submit" className="btn-secondary" disabled={isActionBusy("addSupplier")}>Add Supplier</button>
          </div>
        </form>
      </section>

      <section className="panel">
        <h2 className="text-lg font-semibold text-ink mb-3">Ingest Supplier Reply</h2>
        <form onSubmit={handleIngestReply} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
            <select
              className="input"
              value={replySupplierId}
              onChange={(e) => setReplySupplierId(e.target.value)}
            >
              <option value="">Select supplier</option>
              {(project.suppliers || []).map((supplier) => (
                <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
              ))}
            </select>
            <textarea
              className="input min-h-[110px]"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Paste supplier email reply to extract price/MOQ/lead time"
            />
          </div>
          <button type="submit" className="btn-secondary" disabled={isActionBusy("ingestReply")}>Parse Reply</button>
        </form>
      </section>

      <section className="panel">
        <h2 className="text-lg font-semibold text-ink mb-3">Negotiation Targets</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="field">
            <span>Target Unit Price</span>
            <input
              className="input"
              value={negotiationTarget.unitPrice}
              onChange={(e) => setNegotiationTarget((prev) => ({ ...prev, unitPrice: e.target.value }))}
              placeholder="10.5"
            />
          </label>
          <label className="field">
            <span>Target MOQ</span>
            <input
              className="input"
              value={negotiationTarget.moq}
              onChange={(e) => setNegotiationTarget((prev) => ({ ...prev, moq: e.target.value }))}
              placeholder="800"
            />
          </label>
          <label className="field">
            <span>Target Lead Time (days)</span>
            <input
              className="input"
              value={negotiationTarget.leadTimeDays}
              onChange={(e) => setNegotiationTarget((prev) => ({ ...prev, leadTimeDays: e.target.value }))}
              placeholder="25"
            />
          </label>
        </div>
      </section>

      <ConversationTimeline conversations={project.conversations} suppliers={project.suppliers} />
    </div>
  );
}
