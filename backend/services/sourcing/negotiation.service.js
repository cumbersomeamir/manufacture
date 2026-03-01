import { sendEmail } from "../../lib/email/smtpClient.js";
import { sendWhatsAppMessage } from "../../lib/messaging/twilioWhatsApp.js";
import {
  createSourcingConversation,
  ensureSourcingState,
  normalizeEmail,
} from "./shared.js";

const MAX_AUTOMATED_ROUNDS = 2;

function countNegotiationRounds(project, supplierId) {
  const sourcing = ensureSourcingState(project);
  return sourcing.conversations.filter(
    (entry) =>
      entry.supplierId === supplierId
      && entry.direction === "outbound"
      && entry.metadata?.source === "sourcing_negotiation",
  ).length;
}

function resolveCounterTarget({ supplier, target = {} }) {
  const current = Number(supplier?.priceInrPerKg || supplier?.pricing?.unitPrice);
  const requested = Number(target.unitPriceInrPerKg);

  const floorGuardrail = Number.isFinite(current) ? Number((current * 0.82).toFixed(2)) : requested;
  const minOfKnown = [current, requested].filter(Number.isFinite);
  const baseline = minOfKnown.length ? Math.min(...minOfKnown) : floorGuardrail;
  const finalUnitPrice = Number.isFinite(baseline)
    ? Number(Math.max(floorGuardrail || baseline, baseline).toFixed(2))
    : null;

  const currentMoq = Number(supplier?.moqKg || supplier?.moq);
  const targetMoq = Number(target.moqKg);
  const finalMoq = Number.isFinite(targetMoq)
    ? targetMoq
    : Number.isFinite(currentMoq)
      ? Math.max(25, Math.round(currentMoq * 0.75))
      : null;

  const currentLead = Number(supplier?.leadTimeDays);
  const targetLead = Number(target.leadTimeDays);
  const finalLead = Number.isFinite(targetLead)
    ? targetLead
    : Number.isFinite(currentLead)
      ? Math.max(3, Math.round(currentLead * 0.85))
      : null;

  return {
    unitPriceInrPerKg: Number.isFinite(finalUnitPrice) ? finalUnitPrice : null,
    moqKg: Number.isFinite(finalMoq) ? finalMoq : null,
    leadTimeDays: Number.isFinite(finalLead) ? finalLead : null,
    floorGuardrail: Number.isFinite(floorGuardrail) ? floorGuardrail : null,
  };
}

function buildNegotiationMessage({ project, supplier, counter }) {
  const sourcing = ensureSourcingState(project);
  const lines = [
    `Hi ${supplier.contactPerson || supplier.name || "team"},`,
    "",
    "Thank you for sharing your quotation. We are finalizing an initial prototype batch and would like to align on final pilot terms:",
    "",
    counter.unitPriceInrPerKg
      ? `- Unit price target: INR ${counter.unitPriceInrPerKg}/kg`
      : "- Unit price: please share your best final INR/kg for this first batch",
    counter.moqKg ? `- MOQ target: ${counter.moqKg} kg` : "- MOQ: request lowest possible initial quantity",
    counter.leadTimeDays
      ? `- Lead time target: ${counter.leadTimeDays} days`
      : "- Lead time: request fastest achievable dispatch timeline",
    "",
    `Ingredient brief: ${sourcing.brief.searchTerm || project.idea}`,
    `Specification: ${sourcing.brief.ingredientSpec || "Food grade requirement"}`,
    "",
    "Please confirm if these terms are workable. If close, share your best possible revised offer and payment terms.",
    "",
    "Regards,",
    project.name,
  ];

  return lines.join("\n");
}

export function evaluateNegotiationStop({ supplier, target = {}, rounds, latestParsed }) {
  if (rounds >= MAX_AUTOMATED_ROUNDS) {
    return {
      stop: true,
      reason: "Max automated negotiation rounds reached",
    };
  }

  if (latestParsed) {
    const priceOk = Number.isFinite(target.unitPriceInrPerKg)
      ? Number(latestParsed.unitPriceInrPerKg) <= Number(target.unitPriceInrPerKg)
      : false;
    const moqOk = Number.isFinite(target.moqKg)
      ? Number(latestParsed.moqKg) <= Number(target.moqKg)
      : false;
    const leadOk = Number.isFinite(target.leadTimeDays)
      ? Number(latestParsed.leadTimeDays) <= Number(target.leadTimeDays)
      : false;

    if (priceOk && moqOk && leadOk) {
      return { stop: true, reason: "Target terms reached" };
    }

    if (Array.isArray(latestParsed.uncertainties) && latestParsed.uncertainties.some((item) => /legal|exclusive|advance payment|non-cancelable/i.test(item))) {
      return {
        stop: true,
        reason: "Ambiguous legal/commercial term detected, requires human review",
      };
    }
  }

  if (supplier?.status === "shortlisted") {
    return { stop: true, reason: "Supplier already shortlisted" };
  }

  return { stop: false, reason: "continue" };
}

export async function generateAndOptionallySendNegotiation({
  project,
  supplier,
  target = {},
  sendMessage = true,
  channel = "whatsapp",
}) {
  const rounds = countNegotiationRounds(project, supplier.id);
  const latestInbound = ensureSourcingState(project).conversations
    .filter((entry) => entry.supplierId === supplier.id && entry.direction === "inbound")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

  const stopDecision = evaluateNegotiationStop({
    supplier,
    target,
    rounds,
    latestParsed: latestInbound?.parsed || null,
  });

  const counter = resolveCounterTarget({ supplier, target });
  const body = buildNegotiationMessage({ project, supplier, counter });
  const subject = `Negotiation Update: ${ensureSourcingState(project).brief.searchTerm || project.name}`;

  let delivery = {
    status: "draft_only",
    error: null,
    providerMessageId: null,
  };

  if (sendMessage && !stopDecision.stop) {
    try {
      const mockSend = String(process.env.SOURCING_NEGOTIATION_MOCK_SEND || "").toLowerCase() === "true";

      if (mockSend) {
        delivery = {
          status: "sent",
          providerMessageId: `mock-negotiation-${supplier.id}-${rounds + 1}`,
          error: null,
        };
      } else {
        if (channel === "email") {
          const to = normalizeEmail(supplier.email || "");
          if (!to) {
            throw new Error("Supplier email missing");
          }
          const sent = await sendEmail({ to, subject, text: body });
          delivery = {
            status: "sent",
            providerMessageId: sent.messageId,
            error: null,
          };
        } else {
          const to = supplier.whatsappNumber || supplier.phone || "";
          const sent = await sendWhatsAppMessage({ to, body });
          delivery = {
            status: sent.status || "queued",
            providerMessageId: sent.sid,
            error: null,
          };
        }
      }
    } catch (error) {
      delivery = {
        status: "failed",
        providerMessageId: null,
        error: error instanceof Error ? error.message : "send failed",
      };
    }
  }

  const conversation = createSourcingConversation({
    supplierId: supplier.id,
    direction: "outbound",
    channel,
    subject: channel === "email" ? subject : "",
    message: body,
    metadata: {
      source: "sourcing_negotiation",
      round: rounds + 1,
      stopReason: stopDecision.reason,
      status: delivery.status,
      error: delivery.error,
      providerMessageId: delivery.providerMessageId,
      counter,
    },
  });

  return {
    subject,
    body,
    counter,
    stopDecision,
    delivery,
    conversation,
  };
}
