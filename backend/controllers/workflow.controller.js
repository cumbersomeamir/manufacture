import { runOutreachAgent } from "../agents/outreach.agent.js";
import { runNegotiationAgent } from "../agents/negotiation.agent.js";
import { classifyHumanIntervention } from "../agents/classifier.agent.js";
import { createConversationModel } from "../models/Conversation.js";
import { discoverManufacturers } from "../services/manufacturerDiscovery.service.js";
import { sendOutreachDrafts } from "../services/outreach.service.js";
import { parseSupplierReply } from "../services/responseIntelligence.service.js";
import {
  pickBestSupplier,
  simulateSupplierReplies,
} from "../services/supplierSimulation.service.js";
import { CHECKLIST_KEYS } from "../services/checklist.service.js";
import { setChecklistItem, setModuleStatus } from "../services/projectState.service.js";
import { getProjectById, patchProject } from "../store/project.store.js";

function buildNegotiationTarget(supplier) {
  const unitPrice = Number.isFinite(supplier?.pricing?.unitPrice)
    ? Number((supplier.pricing.unitPrice * 0.9).toFixed(2))
    : undefined;
  const moq = Number.isFinite(supplier?.moq)
    ? Math.max(100, Math.round(supplier.moq * 0.8))
    : undefined;
  const leadTimeDays = Number.isFinite(supplier?.leadTimeDays)
    ? Math.max(10, Math.round(supplier.leadTimeDays * 0.85))
    : undefined;

  return {
    unitPrice,
    moq,
    leadTimeDays,
  };
}

function resolveIntervention(parsed, replyText) {
  return classifyHumanIntervention({
    confidence: parsed.confidence,
    uncertainties: parsed.uncertainties,
    legalRisk: parsed.uncertainties.some((value) => /legal|compliance/i.test(value)),
    nonStandardTerms: /exclusive|non-cancelable|advance payment/i.test(replyText),
  });
}

async function applyReplyRecords({ projectId, replyRecords }) {
  if (!replyRecords.length) return getProjectById(projectId);

  const anyRequiresHuman = replyRecords.some((record) => record.intervention.requiresHuman);

  return patchProject(projectId, (draft) => {
    for (const record of replyRecords) {
      draft.conversations.unshift(record.conversation);
    }

    draft.suppliers = draft.suppliers.map((supplier) => {
      const hit = replyRecords.find((record) => record.supplierId === supplier.id);
      if (!hit) return supplier;

      return {
        ...supplier,
        pricing: {
          unitPrice: hit.parsed.unitPrice,
          currency: hit.parsed.currency || "USD",
        },
        moq: hit.parsed.moq,
        leadTimeDays: hit.parsed.leadTimeDays,
        toolingCost: hit.parsed.toolingCost,
        confidenceScore: hit.parsed.confidence,
        riskFlags: hit.parsed.uncertainties,
        status: "responded",
        updatedAt: new Date().toISOString(),
      };
    });

    setChecklistItem(
      draft,
      CHECKLIST_KEYS.RESPONSE_ANALYSIS,
      anyRequiresHuman ? "in_progress" : "validated",
      anyRequiresHuman ? "Some replies require human review." : `Parsed ${replyRecords.length} replies.`,
      anyRequiresHuman ? "Review flagged constraints before negotiation." : "",
    );
    setModuleStatus(draft, "responses", anyRequiresHuman ? "in_progress" : "validated");

    if (!anyRequiresHuman) {
      setModuleStatus(draft, "negotiation", "in_progress");
      setChecklistItem(
        draft,
        CHECKLIST_KEYS.NEGOTIATION,
        "in_progress",
        "Negotiation can begin with top supplier candidates.",
      );
    }

    return draft;
  });
}

export async function runAutopilotHandler(req, res) {
  const { projectId } = req.params;
  const {
    forceDiscover = false,
    forceOutreach = false,
    forceReplySimulation = false,
  } = req.body || {};

  let project = await getProjectById(projectId);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  const summary = [];

  if (forceDiscover || !project.suppliers?.length) {
    const suppliers = await discoverManufacturers({ project });
    project = await patchProject(projectId, (draft) => {
      draft.suppliers = suppliers;
      setModuleStatus(draft, "discovery", "validated");
      setChecklistItem(
        draft,
        CHECKLIST_KEYS.SUPPLIER_DISCOVERY,
        "validated",
        `Autopilot discovered ${suppliers.length} suppliers.`,
      );
      return draft;
    });
    summary.push(`discovered_${suppliers.length}_suppliers`);
  }

  const needsDrafts = forceOutreach || !project.outreachDrafts?.length;
  if (needsDrafts) {
    const drafts = await runOutreachAgent({
      project,
      supplierIds: project.suppliers.map((supplier) => supplier.id),
    });

    project = await patchProject(projectId, (draft) => {
      draft.outreachDrafts = drafts;
      setModuleStatus(draft, "outreach", "in_progress");
      setChecklistItem(
        draft,
        CHECKLIST_KEYS.OUTREACH_RFQ,
        "in_progress",
        `Autopilot prepared ${drafts.length} outreach drafts.`,
      );
      return draft;
    });
    summary.push(`prepared_${drafts.length}_drafts`);
  }

  const unsentDrafts = project.outreachDrafts.filter((entry) => entry.status !== "sent");
  if (unsentDrafts.length) {
    const messages = sendOutreachDrafts({
      projectId,
      drafts: unsentDrafts,
    });

    project = await patchProject(projectId, (draft) => {
      draft.conversations = [...messages, ...draft.conversations];
      draft.outreachDrafts = draft.outreachDrafts.map((entry) => ({
        ...entry,
        status: "sent",
        sentAt: new Date().toISOString(),
      }));
      draft.suppliers = draft.suppliers.map((supplier) => ({
        ...supplier,
        status: draft.outreachDrafts.some((entry) => entry.supplierId === supplier.id)
          ? "contacted"
          : supplier.status,
        updatedAt: new Date().toISOString(),
      }));

      setModuleStatus(draft, "outreach", "validated");
      setChecklistItem(
        draft,
        CHECKLIST_KEYS.OUTREACH_RFQ,
        "validated",
        `Autopilot sent ${messages.length} RFQs.`,
      );
      setModuleStatus(draft, "responses", "in_progress");
      return draft;
    });
    summary.push(`sent_${messages.length}_rfqs`);
  }

  if (forceReplySimulation || project.suppliers.some((supplier) => supplier.status === "contacted")) {
    const simulatedReplies = simulateSupplierReplies({
      project,
      supplierIds: project.suppliers.map((supplier) => supplier.id),
    });

    const replyRecords = [];
    for (const item of simulatedReplies) {
      const supplier = project.suppliers.find((candidate) => candidate.id === item.supplierId);
      if (!supplier) continue;

      const parsed = await parseSupplierReply({
        project,
        supplier,
        replyText: item.replyText,
      });
      const intervention = resolveIntervention(parsed, item.replyText);
      const conversation = createConversationModel({
        projectId,
        supplierId: item.supplierId,
        direction: "inbound",
        channel: "email",
        subject: item.subject,
        message: item.replyText,
        parsed,
      });

      replyRecords.push({
        supplierId: item.supplierId,
        parsed,
        intervention,
        conversation,
      });
    }

    project = await applyReplyRecords({ projectId, replyRecords });
    summary.push(`simulated_${replyRecords.length}_replies`);
  }

  const bestSupplier = pickBestSupplier(project.suppliers || []);
  if (bestSupplier) {
    const target = buildNegotiationTarget(bestSupplier);
    const draft = await runNegotiationAgent({
      project,
      supplier: bestSupplier,
      target,
    });
    const message = createConversationModel({
      projectId,
      supplierId: bestSupplier.id,
      direction: "outbound",
      channel: "email",
      subject: draft.subject,
      message: draft.body,
    });

    project = await patchProject(projectId, (editable) => {
      editable.conversations.unshift(message);
      editable.suppliers = editable.suppliers.map((supplier) => ({
        ...supplier,
        selected: supplier.id === bestSupplier.id,
        updatedAt: new Date().toISOString(),
      }));

      setModuleStatus(editable, "negotiation", "validated");
      setChecklistItem(
        editable,
        CHECKLIST_KEYS.NEGOTIATION,
        "validated",
        `Autopilot generated negotiation for ${bestSupplier.name}.`,
      );

      setModuleStatus(editable, "success", "in_progress");
      setChecklistItem(
        editable,
        CHECKLIST_KEYS.MANUFACTURER_SELECTION,
        "in_progress",
        `${bestSupplier.name} is current front-runner. Finalize to complete workflow.`,
      );

      return editable;
    });

    summary.push(`negotiated_with_${bestSupplier.id}`);
  }

  return res.json({
    project,
    summary,
  });
}

export async function finalizeSupplierHandler(req, res) {
  const { projectId, supplierId } = req.params;
  const project = await getProjectById(projectId);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  const supplier = project.suppliers.find((entry) => entry.id === supplierId);
  if (!supplier) {
    return res.status(404).json({ error: "Supplier not found" });
  }

  const updated = await patchProject(projectId, (draft) => {
    draft.suppliers = draft.suppliers.map((entry) => ({
      ...entry,
      selected: entry.id === supplierId,
      status: entry.id === supplierId ? "finalized" : entry.status,
      updatedAt: new Date().toISOString(),
    }));

    setChecklistItem(
      draft,
      CHECKLIST_KEYS.MANUFACTURER_SELECTION,
      "validated",
      `${supplier.name} finalized as selected manufacturer.`,
    );
    setModuleStatus(draft, "success", "validated");

    return draft;
  });

  return res.json(updated);
}
