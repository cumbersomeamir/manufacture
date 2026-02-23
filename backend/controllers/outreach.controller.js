import { runOutreachAgent } from "../agents/outreach.agent.js";
import { classifyHumanIntervention } from "../agents/classifier.agent.js";
import { createConversationModel } from "../models/Conversation.js";
import { sendOutreachDrafts } from "../services/outreach.service.js";
import { parseSupplierReply } from "../services/responseIntelligence.service.js";
import { loadProjectRepliesFromInbox } from "../services/inboxSync.service.js";
import { sendSupplierFollowUps } from "../services/followup.service.js";
import { computeProjectOutcomeMetrics } from "../services/outcomeMetrics.service.js";
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
      anyRequiresHuman
        ? "Some supplier replies require human review."
        : `Parsed ${replyRecords.length} supplier replies from inbox/manual ingest.`,
      anyRequiresHuman ? "Review flagged replies for constraints and legal terms." : "",
    );
    setModuleStatus(draft, "responses", anyRequiresHuman ? "in_progress" : "validated");

    if (!anyRequiresHuman) {
      setModuleStatus(draft, "negotiation", "in_progress");
      setChecklistItem(
        draft,
        CHECKLIST_KEYS.NEGOTIATION,
        "in_progress",
        "Supplier responses are ready for negotiation.",
      );
    }

    draft.lastReplySyncAt = new Date().toISOString();
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
  const project = await getProjectById(projectId);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }
  if (!project.outreachDrafts.length) {
    return res.status(400).json({ error: "No drafts prepared" });
  }

  try {
    const { sentConversations, failures } = await sendOutreachDrafts({
      projectId,
      drafts: project.outreachDrafts,
      suppliers: project.suppliers,
    });

    const updated = await patchProject(projectId, (draft) => {
      draft.conversations = [...sentConversations, ...draft.conversations];
      draft.outreachDrafts = draft.outreachDrafts.map((entry) => {
        const failed = failures.find((item) => item.supplierId === entry.supplierId);
        return {
          ...entry,
          status: failed ? "failed" : "sent",
          sentAt: failed ? entry.sentAt : new Date().toISOString(),
          error: failed ? failed.reason : undefined,
        };
      });

      draft.suppliers = draft.suppliers.map((supplier) => {
        const wasDrafted = draft.outreachDrafts.some((entry) => entry.supplierId === supplier.id);
        const failed = failures.some((item) => item.supplierId === supplier.id);
        return {
          ...supplier,
          status: wasDrafted ? (failed ? "outreach_failed" : "contacted") : supplier.status,
          updatedAt: new Date().toISOString(),
        };
      });

      if (sentConversations.length > 0) {
        setModuleStatus(draft, "outreach", "validated");
        setChecklistItem(
          draft,
          CHECKLIST_KEYS.OUTREACH_RFQ,
          "validated",
          `Sent ${sentConversations.length} RFQ messages.`,
        );
        setModuleStatus(draft, "responses", "in_progress");
      } else {
        setModuleStatus(draft, "outreach", "blocked");
        setChecklistItem(
          draft,
          CHECKLIST_KEYS.OUTREACH_RFQ,
          "blocked",
          "No outreach emails were sent due to delivery failures.",
          "Fix SMTP or supplier emails and retry outreach.",
        );
      }

      return draft;
    });

    return res.json({
      project: updated,
      sentCount: sentConversations.length,
      failures,
    });
  } catch (error) {
    return res.status(503).json({
      error: "Failed to send outreach",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export async function sendFollowUpHandler(req, res) {
  const { projectId } = req.params;
  const {
    responseSlaHours,
    cadenceHours,
    maxFollowUps,
  } = req.body || {};

  const project = await getProjectById(projectId);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  const policy = project?.outcomeEngine?.followUpPolicy || {
    responseSlaHours: 24,
    cadenceHours: 24,
    maxFollowUps: 2,
  };

  try {
    const { eligibleCount, sentConversations, failures } = await sendSupplierFollowUps({
      projectId,
      project,
      responseSlaHours: Number.isFinite(responseSlaHours) ? responseSlaHours : policy.responseSlaHours,
      cadenceHours: Number.isFinite(cadenceHours) ? cadenceHours : policy.cadenceHours,
      maxFollowUps: Number.isFinite(maxFollowUps) ? maxFollowUps : policy.maxFollowUps,
    });

    const updated = await patchProject(projectId, (draft) => {
      draft.conversations = [...sentConversations, ...draft.conversations];

      draft.suppliers = draft.suppliers.map((supplier) => {
        const sentForSupplier = sentConversations.filter((entry) => entry.supplierId === supplier.id).length;
        if (!sentForSupplier) return supplier;
        const followUpsSent = Number(supplier.followUpsSent || 0) + sentForSupplier;
        return {
          ...supplier,
          followUpsSent,
          status: supplier.status === "responded" ? "responded" : "contacted",
          updatedAt: new Date().toISOString(),
        };
      });

      if (!draft.outcomeEngine || typeof draft.outcomeEngine !== "object") {
        draft.outcomeEngine = {};
      }
      draft.outcomeEngine.followUpPolicy = {
        responseSlaHours: Number.isFinite(responseSlaHours) ? responseSlaHours : policy.responseSlaHours,
        cadenceHours: Number.isFinite(cadenceHours) ? cadenceHours : policy.cadenceHours,
        maxFollowUps: Number.isFinite(maxFollowUps) ? maxFollowUps : policy.maxFollowUps,
      };
      draft.outcomeEngine.kpiSnapshot = computeProjectOutcomeMetrics(draft);
      return draft;
    });

    return res.json({
      project: updated,
      eligibleCount,
      sentCount: sentConversations.length,
      failures,
    });
  } catch (error) {
    return res.status(503).json({
      error: "Failed to send follow-up emails",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
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
      metadata: {
        source: "manual_ingest",
      },
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

export async function syncRepliesHandler(req, res) {
  const { projectId } = req.params;
  const project = await getProjectById(projectId);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  try {
    const matched = await loadProjectRepliesFromInbox({
      project,
      since: project.lastReplySyncAt || project.createdAt,
    });

    if (!matched.length) {
      const updated = await patchProject(projectId, {
        lastReplySyncAt: new Date().toISOString(),
      });
      return res.json({
        project: updated,
        syncedCount: 0,
      });
    }

    const replyRecords = [];
    for (const item of matched) {
      const parsed = await parseSupplierReply({
        project,
        supplier: item.supplier,
        replyText: item.message.text,
      });
      const intervention = resolveIntervention(parsed, item.message.text);
      const conversation = createConversationModel({
        projectId,
        supplierId: item.supplier.id,
        direction: "inbound",
        channel: "email",
        subject: item.message.subject || "Supplier Response",
        message: item.message.text,
        parsed,
        metadata: {
          source: "imap_sync",
          inboundMessageId: item.message.messageId || undefined,
          imapUid: item.message.uid,
          from: item.message.from,
          date: item.message.date,
        },
      });

      replyRecords.push({
        supplierId: item.supplier.id,
        parsed,
        intervention,
        conversation,
      });
    }

    const updated = await applyParsedReplies({
      projectId,
      replyRecords,
    });

    return res.json({
      project: updated,
      syncedCount: replyRecords.length,
    });
  } catch (error) {
    return res.status(503).json({
      error: "Failed to sync inbox replies",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
