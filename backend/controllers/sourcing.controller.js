import { getProjectById, listProjects, patchProject } from "../store/project.store.js";
import { discoverLocalIngredientSuppliers } from "../services/sourcing/discovery.service.js";
import {
  createSourcingOutreachDrafts,
  sendSourcingOutreachDrafts,
} from "../services/sourcing/outreach.service.js";
import {
  applyReplyRecords,
  ingestManualSourcingReply,
  syncSourcingReplies,
} from "../services/sourcing/replies.service.js";
import { computeSourcingMetrics } from "../services/sourcing/metrics.service.js";
import { generateAndOptionallySendNegotiation } from "../services/sourcing/negotiation.service.js";
import {
  ensureSourcingState,
  findSourcingSupplier,
  normalizePhone,
  setSourcingModuleStatus,
  toNumber,
} from "../services/sourcing/shared.js";
import {
  isTwilioConfigured,
  parseTwilioInbound,
  verifyWebhookToken,
} from "../lib/messaging/twilioWhatsApp.js";

function asPositiveInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.round(parsed);
}

function xmlResponse() {
  return '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
}

function supplierPhoneMatches(supplier, from) {
  const a = normalizePhone(supplier?.whatsappNumber || supplier?.phone || "");
  const b = normalizePhone(from || "");
  return Boolean(a && b && a === b);
}

export async function updateSourcingBriefHandler(req, res) {
  const { projectId } = req.params;
  const project = await getProjectById(projectId);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const {
    searchTerm,
    ingredientSpec = "",
    quantityTargetKg = null,
    targetCity = "",
    targetState = "",
    maxBudgetInrPerKg = null,
  } = req.body || {};

  if (!String(searchTerm || "").trim()) {
    return res.status(400).json({ error: "searchTerm is required" });
  }

  const updated = await patchProject(projectId, (draft) => {
    const sourcing = ensureSourcingState(draft);
    sourcing.enabled = true;
    sourcing.brief = {
      ...sourcing.brief,
      searchTerm: String(searchTerm).trim(),
      ingredientSpec: String(ingredientSpec || "").trim(),
      quantityTargetKg: toNumber(quantityTargetKg),
      targetCity: String(targetCity || "").trim(),
      targetState: String(targetState || "").trim(),
      maxBudgetInrPerKg: toNumber(maxBudgetInrPerKg),
      country: "India",
      currency: "INR",
    };

    setSourcingModuleStatus(draft, "discovery", "pending");
    setSourcingModuleStatus(draft, "outreach", "pending");
    setSourcingModuleStatus(draft, "responses", "pending");
    setSourcingModuleStatus(draft, "negotiation", "pending");
    return draft;
  });

  return res.json({
    project: updated,
    sourcing: updated.sourcing,
  });
}

export async function discoverSourcingSuppliersHandler(req, res) {
  const { projectId } = req.params;
  const project = await getProjectById(projectId);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const { platforms = [], limit = 30 } = req.body || {};

  try {
    const { suppliers, platformStats } = await discoverLocalIngredientSuppliers({
      project,
      platforms,
      limit: asPositiveInteger(limit, 30),
    });

    const updated = await patchProject(projectId, (draft) => {
      const sourcing = ensureSourcingState(draft);
      sourcing.enabled = true;
      sourcing.suppliers = suppliers;
      sourcing.platformStats = platformStats;
      sourcing.lastDiscoveryAt = new Date().toISOString();

      setSourcingModuleStatus(draft, "discovery", suppliers.length ? "validated" : "blocked");
      if (suppliers.length) setSourcingModuleStatus(draft, "outreach", "in_progress");
      return draft;
    });

    return res.json({
      project: updated,
      suppliers,
      platformStats,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Sourcing discovery failed",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export async function prepareSourcingOutreachHandler(req, res) {
  const { projectId } = req.params;
  const project = await getProjectById(projectId);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const { supplierIds = [], channels = ["email", "whatsapp"] } = req.body || {};
  const sourcing = ensureSourcingState(project);
  if (!sourcing.suppliers.length) {
    return res.status(400).json({ error: "Run sourcing discovery first" });
  }

  const drafts = createSourcingOutreachDrafts({
    project,
    supplierIds: Array.isArray(supplierIds) ? supplierIds : [],
    channels: Array.isArray(channels) ? channels : ["email", "whatsapp"],
  });

  const updated = await patchProject(projectId, (draft) => {
    const editable = ensureSourcingState(draft);
    editable.outreachDrafts = drafts;
    setSourcingModuleStatus(draft, "outreach", drafts.length ? "in_progress" : "blocked");
    return draft;
  });

  return res.json({
    project: updated,
    drafts,
  });
}

export async function sendSourcingOutreachHandler(req, res) {
  const { projectId } = req.params;
  const project = await getProjectById(projectId);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const sourcing = ensureSourcingState(project);
  if (!sourcing.outreachDrafts.length) {
    return res.status(400).json({ error: "No sourcing outreach drafts available" });
  }

  const { draftIds = [], autoSend = true } = req.body || {};

  try {
    const { sentConversations, failures, sentDraftIds } = await sendSourcingOutreachDrafts({
      project,
      drafts: sourcing.outreachDrafts,
      draftIds: Array.isArray(draftIds) ? draftIds : [],
      autoSend: Boolean(autoSend),
    });

    const updated = await patchProject(projectId, (draft) => {
      const editable = ensureSourcingState(draft);
      editable.conversations = [...sentConversations, ...editable.conversations];

      editable.outreachDrafts = editable.outreachDrafts.map((entry) => {
        if (sentDraftIds.includes(entry.id)) {
          return {
            ...entry,
            status: "sent",
            sentAt: new Date().toISOString(),
          };
        }
        const failed = failures.find((row) => row.supplierId === entry.supplierId);
        if (failed) {
          return {
            ...entry,
            status: "failed",
            error: failed.reason,
          };
        }
        return entry;
      });

      editable.suppliers = editable.suppliers.map((supplier) => {
        const contacted = sentConversations.some((entry) => entry.supplierId === supplier.id);
        if (!contacted) return supplier;
        return {
          ...supplier,
          status: supplier.status === "responded" ? "responded" : "contacted",
          updatedAt: new Date().toISOString(),
        };
      });

      setSourcingModuleStatus(draft, "outreach", sentConversations.length ? "validated" : "blocked");
      if (sentConversations.length) setSourcingModuleStatus(draft, "responses", "in_progress");
      return draft;
    });

    return res.json({
      project: updated,
      sentCount: sentConversations.length,
      failures,
    });
  } catch (error) {
    return res.status(503).json({
      error: "Failed to send sourcing outreach",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export async function syncSourcingRepliesHandler(req, res) {
  const { projectId } = req.params;
  const project = await getProjectById(projectId);
  if (!project) return res.status(404).json({ error: "Project not found" });

  try {
    const records = await syncSourcingReplies({ project });
    const updated = await patchProject(projectId, (draft) => {
      applyReplyRecords(draft, records);

      if (records.length) {
        setSourcingModuleStatus(draft, "responses", "validated");
        setSourcingModuleStatus(draft, "negotiation", "in_progress");
      }

      return draft;
    });

    return res.json({
      project: updated,
      syncedCount: records.length,
    });
  } catch (error) {
    return res.status(503).json({
      error: "Failed to sync sourcing replies",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export async function ingestSourcingReplyHandler(req, res) {
  const { projectId } = req.params;
  const project = await getProjectById(projectId);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const { supplierId, channel = "email", replyText } = req.body || {};
  if (!supplierId || !String(replyText || "").trim()) {
    return res.status(400).json({ error: "supplierId and replyText are required" });
  }

  try {
    const result = await ingestManualSourcingReply({
      project,
      supplierId,
      channel,
      replyText,
    });

    const updated = await patchProject(projectId, (draft) => {
      const sourcing = ensureSourcingState(draft);
      sourcing.conversations.unshift(result.conversation);
      sourcing.suppliers = sourcing.suppliers.map((supplier) =>
        supplier.id === result.supplier.id ? result.supplier : supplier,
      );

      setSourcingModuleStatus(draft, "responses", "validated");
      setSourcingModuleStatus(draft, "negotiation", "in_progress");
      return draft;
    });

    return res.json({
      project: updated,
      parsed: result.parsed,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to ingest sourcing reply",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export async function negotiateSourcingHandler(req, res) {
  const { projectId } = req.params;
  const project = await getProjectById(projectId);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const {
    supplierId,
    target = {},
    sendMessage = true,
    channel = "whatsapp",
  } = req.body || {};

  const supplier = findSourcingSupplier(project, supplierId)
    || ensureSourcingState(project).suppliers.find((entry) => entry.status === "responded")
    || ensureSourcingState(project).suppliers[0];

  if (!supplier) {
    return res.status(400).json({ error: "No sourcing supplier available for negotiation" });
  }

  try {
    const outcome = await generateAndOptionallySendNegotiation({
      project,
      supplier,
      target,
      sendMessage: Boolean(sendMessage),
      channel: String(channel || "whatsapp").toLowerCase() === "email" ? "email" : "whatsapp",
    });

    const updated = await patchProject(projectId, (draft) => {
      const sourcing = ensureSourcingState(draft);
      sourcing.conversations.unshift(outcome.conversation);
      sourcing.suppliers = sourcing.suppliers.map((entry) => {
        if (entry.id !== supplier.id) return entry;

        const status = outcome.stopDecision.stop
          ? outcome.stopDecision.reason === "Target terms reached"
            ? "shortlisted"
            : "negotiating"
          : "negotiating";

        return {
          ...entry,
          status,
          updatedAt: new Date().toISOString(),
        };
      });

      setSourcingModuleStatus(draft, "negotiation", outcome.stopDecision.stop ? "validated" : "in_progress");
      return draft;
    });

    return res.json({
      project: updated,
      draft: {
        subject: outcome.subject,
        body: outcome.body,
      },
      counter: outcome.counter,
      stopDecision: outcome.stopDecision,
      delivery: outcome.delivery,
      supplier,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to negotiate sourcing terms",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export async function getSourcingMetricsHandler(req, res) {
  const { projectId } = req.params;
  const project = await getProjectById(projectId);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const metrics = computeSourcingMetrics(project);
  const updated = await patchProject(projectId, (draft) => {
    const sourcing = ensureSourcingState(draft);
    sourcing.metrics = metrics;
    return draft;
  });

  return res.json({
    project: updated,
    metrics,
  });
}

export async function twilioWhatsAppWebhookHandler(req, res) {
  if (!verifyWebhookToken(req.headers, req.body || {})) {
    return res.status(401).type("text/xml").send(xmlResponse());
  }

  if (!isTwilioConfigured()) {
    return res.status(200).type("text/xml").send(xmlResponse());
  }

  const inbound = parseTwilioInbound(req.body || {});
  if (!inbound.from || !inbound.message) {
    return res.status(200).type("text/xml").send(xmlResponse());
  }

  const projects = await listProjects();
  let matchedProject = null;
  let matchedSupplier = null;

  for (const project of projects) {
    const sourcing = ensureSourcingState(project);
    const supplier = sourcing.suppliers.find((entry) => supplierPhoneMatches(entry, inbound.from));
    if (supplier) {
      matchedProject = project;
      matchedSupplier = supplier;
      break;
    }
  }

  if (!matchedProject || !matchedSupplier) {
    return res.status(200).type("text/xml").send(xmlResponse());
  }

  await patchProject(matchedProject.id, (draft) => {
    const sourcing = ensureSourcingState(draft);

    const exists = sourcing.inboxQueue.some((entry) => String(entry.messageSid) === String(inbound.messageSid));
    if (!exists) {
      sourcing.inboxQueue.unshift({
        supplierId: matchedSupplier.id,
        ...inbound,
      });
      sourcing.inboxQueue = sourcing.inboxQueue.slice(0, 200);
    }

    return draft;
  });

  return res.status(200).type("text/xml").send(xmlResponse());
}
