import { randomUUID } from "crypto";
import { sendEmail } from "../../lib/email/smtpClient.js";
import { sendWhatsAppMessage } from "../../lib/messaging/twilioWhatsApp.js";
import {
  createSourcingConversation,
  ensureSourcingState,
  lastOutboundAt,
  normalizeEmail,
  nowIso,
  recentOutboundSignature,
} from "./shared.js";

const MAX_SEND_PER_RUN = 25;
const COOLDOWN_HOURS = 12;

function buildOutreachMessage({ project, supplier, brief }) {
  const lines = [
    `Hi ${supplier.contactPerson || supplier.name || "team"},`,
    "",
    "We are sourcing ingredient supply for a new product pilot and would like a quick quotation.",
    "",
    `Ingredient: ${brief.searchTerm || project.idea}`,
    `Specification: ${brief.ingredientSpec || "Food grade suitable for commercial snack production"}`,
    `Quantity target: ${brief.quantityTargetKg || "To be finalized"} kg`,
    `Delivery location: ${[brief.targetCity, brief.targetState, brief.country].filter(Boolean).join(", ") || "India"}`,
    brief.maxBudgetInrPerKg ? `Target price: <= INR ${brief.maxBudgetInrPerKg}/kg` : "Target price: please share your best INR/kg quote",
    "",
    "Please confirm:",
    "1) Unit price (INR/kg)",
    "2) MOQ (kg)",
    "3) Lead time (days)",
    "4) Food-grade/compliance documents available",
    "5) Payment terms",
    "",
    "Regards,",
    project.name,
  ];

  return lines.join("\n");
}

export function createSourcingOutreachDrafts({ project, supplierIds = [], channels = ["email", "whatsapp"] }) {
  const sourcing = ensureSourcingState(project);
  const normalizedChannels = Array.from(new Set((Array.isArray(channels) ? channels : []).map((item) => String(item || "").toLowerCase())))
    .filter((channel) => ["email", "whatsapp"].includes(channel));

  const resolvedChannels = normalizedChannels.length ? normalizedChannels : ["email", "whatsapp"];

  const candidates = sourcing.suppliers.filter(
    (supplier) => supplierIds.length === 0 || supplierIds.includes(supplier.id),
  );

  const drafts = [];
  for (const supplier of candidates) {
    const message = buildOutreachMessage({ project, supplier, brief: sourcing.brief });

    for (const channel of resolvedChannels) {
      const to = channel === "email" ? normalizeEmail(supplier.email) : supplier.whatsappNumber || supplier.phone || "";
      if (!to) continue;

      drafts.push({
        id: randomUUID(),
        supplierId: supplier.id,
        supplierName: supplier.name,
        channel,
        to,
        subject: `Ingredient RFQ: ${sourcing.brief.searchTerm || project.name}`,
        body: message,
        status: "draft",
        createdAt: nowIso(),
      });
    }
  }

  return drafts;
}

export async function sendSourcingOutreachDrafts({
  project,
  drafts,
  draftIds = [],
  autoSend = true,
}) {
  if (!autoSend) {
    return {
      sentConversations: [],
      failures: [{ supplierId: "", reason: "autoSend disabled" }],
      sentDraftIds: [],
    };
  }

  const sourcing = ensureSourcingState(project);
  const selected = drafts.filter((draft) => draftIds.length === 0 || draftIds.includes(draft.id)).slice(0, MAX_SEND_PER_RUN);

  const sentConversations = [];
  const failures = [];
  const sentDraftIds = [];

  for (const draft of selected) {
    const supplier = sourcing.suppliers.find((entry) => entry.id === draft.supplierId);
    if (!supplier) {
      failures.push({ supplierId: draft.supplierId, reason: "Supplier not found" });
      continue;
    }

    const dupe = recentOutboundSignature(project, draft.supplierId, draft.channel, draft.body, COOLDOWN_HOURS);
    if (dupe) {
      failures.push({ supplierId: draft.supplierId, reason: `Duplicate outbound within ${COOLDOWN_HOURS}h cooldown` });
      continue;
    }

    const lastSent = lastOutboundAt(project, draft.supplierId, draft.channel);
    if (lastSent && Date.now() - lastSent < COOLDOWN_HOURS * 3600 * 1000) {
      failures.push({ supplierId: draft.supplierId, reason: `Cooldown active for ${COOLDOWN_HOURS}h` });
      continue;
    }

    try {
      let providerMeta = null;
      const mockSend = String(process.env.SOURCING_OUTREACH_MOCK_SEND || "").toLowerCase() === "true";

      if (mockSend) {
        providerMeta = {
          provider: draft.channel === "email" ? "smtp_mock" : "twilio_whatsapp_mock",
          status: "sent",
          providerMessageId: `mock-${draft.channel}-${draft.supplierId}`,
        };
      } else {
        if (draft.channel === "email") {
          const sent = await sendEmail({
            to: draft.to,
            subject: draft.subject,
            text: draft.body,
          });
          providerMeta = {
            provider: "smtp",
            status: "sent",
            providerMessageId: sent.messageId,
            accepted: sent.accepted,
            rejected: sent.rejected,
          };
        } else {
          const sent = await sendWhatsAppMessage({
            to: draft.to,
            body: draft.body,
          });
          providerMeta = {
            provider: "twilio_whatsapp",
            status: sent.status,
            providerMessageId: sent.sid,
            to: sent.to,
          };
        }
      }

      const convo = createSourcingConversation({
        supplierId: draft.supplierId,
        direction: "outbound",
        channel: draft.channel,
        subject: draft.channel === "email" ? draft.subject : "",
        message: draft.body,
        metadata: {
          source: "sourcing_outreach",
          ...providerMeta,
        },
      });

      sentConversations.push(convo);
      sentDraftIds.push(draft.id);
    } catch (error) {
      failures.push({
        supplierId: draft.supplierId,
        reason: error instanceof Error ? error.message : "Send failed",
      });
    }
  }

  return {
    sentConversations,
    failures,
    sentDraftIds,
  };
}
