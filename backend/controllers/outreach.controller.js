import { runOutreachAgent } from "../agents/outreach.agent.js";
import { classifyHumanIntervention } from "../agents/classifier.agent.js";
import { createConversationModel } from "../models/Conversation.js";
import { sendOutreachDrafts } from "../services/outreach.service.js";
import { parseSupplierReply } from "../services/responseIntelligence.service.js";
import { simulateSupplierReplies } from "../services/supplierSimulation.service.js";
import { getProjectById, patchProject } from "../store/project.store.js";
import { setChecklistItem, setModuleStatus } from "../services/projectState.service.js";
import { CHECKLIST_KEYS } from "../services/checklist.service.js";

function resolveIntervention(parsed, replyText) {
  return classifyHumanIntervention({
    confidence: parsed.confidence,
    uncertainties: parsed.uncertainties,
    legalRisk: parsed.uncertainties.some((value) => /legal|compliance/i.test(value)),
    nonStandardTerms: /exclusive|non-cancelable|advance payment/i.test(replyText),
  });
}

async function applyParsedReplies({ projectId, replyRecords }) {
  if (!replyRecords.length) return project;

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
      anyRequiresHuman
        ? "Some supplier replies need human review."
        : `Parsed ${replyRecords.length} supplier replies.`,
      anyRequiresHuman ? "Review flagged replies for constraints and legal terms." : "",
    );
    setModuleStatus(draft, "responses", anyRequiresHuman ? "in_progress" : "validated");

    if (!anyRequiresHuman) {
      setModuleStatus(draft, "negotiation", "in_progress");
      setChecklistItem(
        draft,
        CHECKLIST_KEYS.NEGOTIATION,
        "in_progress",
        "Ready to negotiate with top suppliers.",
      );
    }

    return draft;
  });
}

export async function prepareOutreachHandler(req, res) {
  const { projectId } = req.params;
  const { supplierIds = [] } = req.body || {};
  const project = await getProjectById(projectId);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  if (!Array.isArray(project.suppliers) || project.suppliers.length === 0) {
    return res.status(400).json({ error: "Run supplier discovery first" });
  }

  try {
    const drafts = await runOutreachAgent({
      project,
      supplierIds: Array.isArray(supplierIds) ? supplierIds : [],
    });

    const updated = await patchProject(projectId, (draft) => {
      draft.outreachDrafts = drafts;
      setModuleStatus(draft, "outreach", "in_progress");
      setChecklistItem(
        draft,
        CHECKLIST_KEYS.OUTREACH_RFQ,
        "in_progress",
        `Prepared ${drafts.length} outreach drafts.`,
      );
      return draft;
    });

    return res.json(updated);
  } catch (error) {
    return res.status(500).json({
      error: "Failed to prepare outreach",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export async function sendOutreachHandler(req, res) {
  const { projectId } = req.params;
  const autoSimulate = req.body?.autoSimulate !== false;
  const project = await getProjectById(projectId);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }
  if (!project.outreachDrafts.length) {
    return res.status(400).json({ error: "No drafts prepared" });
  }

  const messages = sendOutreachDrafts({
    projectId,
    drafts: project.outreachDrafts,
  });

  const updated = await patchProject(projectId, (draft) => {
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
      `Sent ${messages.length} RFQ messages.`,
    );
    setModuleStatus(draft, "responses", "in_progress");
    return draft;
  });

  if (!autoSimulate) {
    return res.json(updated);
  }

  const simulated = simulateSupplierReplies({
    project: updated,
    supplierIds: updated.outreachDrafts.map((entry) => entry.supplierId),
  });

  const replyRecords = [];
  for (const item of simulated) {
    const supplier = updated.suppliers.find((candidate) => candidate.id === item.supplierId);
    if (!supplier) continue;

    const parsed = await parseSupplierReply({
      project: updated,
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

  const finalProject = await applyParsedReplies({ projectId, replyRecords });

  return res.json({
    project: finalProject,
    simulatedReplies: simulated.length,
  });
}

export async function ingestReplyHandler(req, res) {
  const { projectId } = req.params;
  const { supplierId, replyText, subject = "Supplier Response" } = req.body || {};

  const project = await getProjectById(projectId);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }
  if (!supplierId || !replyText) {
    return res.status(400).json({ error: "supplierId and replyText are required" });
  }

  const supplier = project.suppliers.find((candidate) => candidate.id === supplierId);
  if (!supplier) {
    return res.status(404).json({ error: "Supplier not found" });
  }

  try {
    const parsed = await parseSupplierReply({
      project,
      supplier,
      replyText,
    });

    const intervention = resolveIntervention(parsed, replyText);

    const conversation = createConversationModel({
      projectId,
      supplierId,
      direction: "inbound",
      channel: "email",
      subject,
      message: replyText,
      parsed,
    });

    const updated = await applyParsedReplies({
      projectId,
      replyRecords: [
        {
          supplierId,
          parsed,
          intervention,
          conversation,
        },
      ],
    });

    return res.json({
      project: updated,
      parsed,
      intervention,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to parse supplier reply",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export async function simulateRepliesHandler(req, res) {
  const { projectId } = req.params;
  const project = await getProjectById(projectId);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }
  if (!project.suppliers?.length) {
    return res.status(400).json({ error: "No suppliers available to simulate replies" });
  }

  const simulated = simulateSupplierReplies({
    project,
    supplierIds: req.body?.supplierIds || [],
  });

  const replyRecords = [];
  for (const item of simulated) {
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

  const updated = await applyParsedReplies({ projectId, replyRecords });

  return res.json({
    project: updated,
    simulatedReplies: replyRecords.length,
  });
}
