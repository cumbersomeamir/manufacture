import { runOutreachAgent } from "../agents/outreach.agent.js";
import { runNegotiationAgent } from "../agents/negotiation.agent.js";
import { createConversationModel } from "../models/Conversation.js";
import { discoverManufacturers } from "../services/manufacturerDiscovery.service.js";
import { sendOutreachDrafts } from "../services/outreach.service.js";
import { CHECKLIST_KEYS } from "../services/checklist.service.js";
import { setChecklistItem, setModuleStatus } from "../services/projectState.service.js";
import { getProjectById, patchProject } from "../store/project.store.js";

function pickBestSupplierFromResponses(suppliers = []) {
  const responded = suppliers.filter((supplier) => supplier.status === "responded");
  if (!responded.length) return null;

  let best = null;
  let bestScore = -Infinity;

  for (const supplier of responded) {
    const price = Number.isFinite(supplier?.pricing?.unitPrice) ? supplier.pricing.unitPrice : 999;
    const moq = Number.isFinite(supplier?.moq) ? supplier.moq : 99999;
    const lead = Number.isFinite(supplier?.leadTimeDays) ? supplier.leadTimeDays : 999;
    const confidence = Number.isFinite(supplier?.confidenceScore) ? supplier.confidenceScore : 0;

    const score = (1 / Math.max(1, price)) * 40 + (1 / Math.max(1, moq)) * 3200 + (1 / Math.max(1, lead)) * 36 + confidence * 12;
    if (score > bestScore) {
      bestScore = score;
      best = supplier;
    }
  }

  return best;
}

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

  return { unitPrice, moq, leadTimeDays };
}

export async function runAutopilotHandler(req, res) {
  const { projectId } = req.params;
  const {
    forceDiscover = false,
    forceOutreach = false,
    sendEmails = true,
    runNegotiation = true,
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
        `Discovered ${suppliers.length} suppliers from live web search.`,
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
        `Prepared ${drafts.length} outreach drafts.`,
      );
      return draft;
    });
    summary.push(`prepared_${drafts.length}_drafts`);
  }

  if (sendEmails) {
    const unsentDrafts = project.outreachDrafts.filter((entry) => entry.status !== "sent");
    if (unsentDrafts.length) {
      try {
        const { sentConversations, failures } = await sendOutreachDrafts({
          projectId,
          drafts: unsentDrafts,
          suppliers: project.suppliers,
        });

        project = await patchProject(projectId, (draft) => {
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
            const failed = failures.some((item) => item.supplierId === supplier.id);
            const sent = sentConversations.some((conv) => conv.supplierId === supplier.id);
            return {
              ...supplier,
              status: sent ? "contacted" : failed ? "outreach_failed" : supplier.status,
              updatedAt: new Date().toISOString(),
            };
          });

          if (sentConversations.length > 0) {
            setModuleStatus(draft, "outreach", "validated");
            setChecklistItem(
              draft,
              CHECKLIST_KEYS.OUTREACH_RFQ,
              "validated",
              `Sent ${sentConversations.length} RFQs.`,
            );
            setModuleStatus(draft, "responses", "in_progress");
          } else {
            setModuleStatus(draft, "outreach", "blocked");
            setChecklistItem(
              draft,
              CHECKLIST_KEYS.OUTREACH_RFQ,
              "blocked",
              "Autopilot could not send any outreach messages.",
              "Configure SMTP and retry outreach.",
            );
          }

          return draft;
        });

        summary.push(`sent_${sentConversations.length}_emails`);
        if (failures.length) summary.push(`failed_${failures.length}_emails`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown send error";
        project = await patchProject(projectId, (draft) => {
          setModuleStatus(draft, "outreach", "blocked");
          setChecklistItem(
            draft,
            CHECKLIST_KEYS.OUTREACH_RFQ,
            "blocked",
            `Autopilot outreach failed: ${message}`,
            "Configure SMTP credentials and retry sending.",
          );
          return draft;
        });
        summary.push("outreach_send_failed");
      }
    }
  }

  if (runNegotiation) {
    const bestSupplier = pickBestSupplierFromResponses(project.suppliers || []);
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
        metadata: {
          source: "autopilot_negotiation_draft",
        },
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
          `Generated negotiation draft for ${bestSupplier.name}.`,
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

      summary.push(`prepared_negotiation_${bestSupplier.id}`);
    }
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
