import { fetchInboxMessages, isImapConfigured } from "../../lib/email/imapClient.js";
import { parseIngredientReply } from "./parsing.service.js";
import {
  createSourcingConversation,
  ensureSourcingState,
  normalizeEmail,
  normalizePhone,
} from "./shared.js";

function extractDomain(email = "") {
  const normalized = normalizeEmail(email);
  const idx = normalized.lastIndexOf("@");
  return idx >= 0 ? normalized.slice(idx + 1) : "";
}

function findSupplierByEmail(sourcing, from = "") {
  const normalized = normalizeEmail(from);
  if (!normalized) return null;

  const direct = sourcing.suppliers.find((supplier) => normalizeEmail(supplier.email) === normalized);
  if (direct) return direct;

  const domain = extractDomain(normalized);
  if (!domain) return null;

  return sourcing.suppliers.find((supplier) => extractDomain(supplier.email) === domain) || null;
}

function alreadyIngestedSourcing(sourcing, signature = "") {
  if (!signature) return false;
  return sourcing.conversations.some((entry) => entry?.metadata?.signature && String(entry.metadata.signature) === signature);
}

function applyParsedToSupplier(supplier, parsed) {
  return {
    ...supplier,
    priceInrPerKg: parsed.unitPriceInrPerKg,
    moqKg: parsed.moqKg,
    leadTimeDays: parsed.leadTimeDays,
    pricing: {
      unitPrice: parsed.unitPriceInrPerKg,
      currency: "INR",
    },
    moq: parsed.moqKg,
    status: "responded",
    riskFlags: parsed.uncertainties,
    updatedAt: new Date().toISOString(),
  };
}

export async function ingestManualSourcingReply({ project, supplierId, channel = "email", replyText }) {
  const sourcing = ensureSourcingState(project);
  const supplier = sourcing.suppliers.find((entry) => entry.id === supplierId);
  if (!supplier) {
    throw new Error("Supplier not found");
  }

  const parsed = parseIngredientReply(replyText);
  const conversation = createSourcingConversation({
    supplierId,
    direction: "inbound",
    channel,
    message: replyText,
    parsed,
    metadata: {
      source: "sourcing_manual_ingest",
      signature: `manual:${supplierId}:${Date.now()}`,
    },
  });

  return {
    parsed,
    conversation,
    supplier: applyParsedToSupplier(supplier, parsed),
  };
}

export async function syncSourcingReplies({ project }) {
  const sourcing = ensureSourcingState(project);
  const records = [];

  if (isImapConfigured()) {
    const messages = await fetchInboxMessages({
      since: sourcing.lastReplySyncAt || project.createdAt,
      limit: 200,
    });

    for (const message of messages) {
      const supplier = findSupplierByEmail(sourcing, message.from);
      if (!supplier) continue;

      const signature = `imap:${message.messageId || ""}:${message.uid || ""}`;
      if (alreadyIngestedSourcing(sourcing, signature)) continue;

      const parsed = parseIngredientReply(message.text);
      records.push({
        supplierId: supplier.id,
        parsed,
        conversation: createSourcingConversation({
          supplierId: supplier.id,
          direction: "inbound",
          channel: "email",
          subject: message.subject || "Supplier Reply",
          message: message.text,
          parsed,
          metadata: {
            source: "sourcing_imap_sync",
            from: message.from,
            inboundMessageId: message.messageId,
            imapUid: message.uid,
            signature,
          },
        }),
      });
    }
  }

  for (const queued of sourcing.inboxQueue || []) {
    const supplier = sourcing.suppliers.find((entry) => entry.id === queued.supplierId)
      || sourcing.suppliers.find((entry) => normalizePhone(entry.whatsappNumber || entry.phone) === normalizePhone(queued.from));

    if (!supplier) continue;

    const signature = `twilio:${queued.messageSid}`;
    if (alreadyIngestedSourcing(sourcing, signature)) continue;

    const parsed = parseIngredientReply(queued.message || "");
    records.push({
      supplierId: supplier.id,
      parsed,
      conversation: createSourcingConversation({
        supplierId: supplier.id,
        direction: "inbound",
        channel: "whatsapp",
        message: queued.message,
        parsed,
        metadata: {
          source: "sourcing_twilio_sync",
          from: queued.from,
          to: queued.to,
          messageSid: queued.messageSid,
          signature,
        },
      }),
    });
  }

  const uniqueRecords = [];
  const seen = new Set();
  for (const record of records) {
    const sig = record?.conversation?.metadata?.signature;
    if (!sig || seen.has(sig)) continue;
    seen.add(sig);
    uniqueRecords.push(record);
  }

  return uniqueRecords;
}

export function applyReplyRecords(project, records = []) {
  const sourcing = ensureSourcingState(project);
  if (!records.length) {
    sourcing.lastReplySyncAt = new Date().toISOString();
    sourcing.inboxQueue = [];
    return project;
  }

  for (const record of records) {
    sourcing.conversations.unshift(record.conversation);
  }

  sourcing.suppliers = sourcing.suppliers.map((supplier) => {
    const hit = records.find((record) => record.supplierId === supplier.id);
    if (!hit) return supplier;
    return applyParsedToSupplier(supplier, hit.parsed);
  });

  const consumedSids = new Set(
    records
      .map((record) => record?.conversation?.metadata?.messageSid)
      .filter(Boolean),
  );

  sourcing.inboxQueue = sourcing.inboxQueue.filter((entry) => !consumedSids.has(entry.messageSid));
  sourcing.lastReplySyncAt = new Date().toISOString();
  return project;
}
