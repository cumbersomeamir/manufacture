import { fetchInboxMessages, isImapConfigured } from "../lib/email/imapClient.js";

function normalizeEmail(value = "") {
  return String(value).trim().toLowerCase();
}

function extractDomain(email = "") {
  const normalized = normalizeEmail(email);
  const idx = normalized.lastIndexOf("@");
  return idx >= 0 ? normalized.slice(idx + 1) : "";
}

function findSupplierForMessage(project, message) {
  const from = normalizeEmail(message.from);
  if (!from) return null;

  const direct = project.suppliers.find((supplier) => normalizeEmail(supplier.email) === from);
  if (direct) return direct;

  const fromDomain = extractDomain(from);
  if (!fromDomain) return null;

  return project.suppliers.find((supplier) => extractDomain(supplier.email) === fromDomain) || null;
}

function alreadyIngested(project, message) {
  const messageId = String(message.messageId || "").trim();
  const uid = String(message.uid || "").trim();

  return project.conversations.some((entry) => {
    const meta = entry.metadata || {};
    if (messageId && meta.inboundMessageId && String(meta.inboundMessageId) === messageId) return true;
    if (uid && meta.imapUid && String(meta.imapUid) === uid) return true;
    return false;
  });
}

export function canSyncInbox() {
  return isImapConfigured();
}

export async function loadProjectRepliesFromInbox({ project, since }) {
  if (!isImapConfigured()) {
    throw new Error(
      "IMAP is not configured. Set IMAP_HOST, IMAP_PORT, IMAP_USER, IMAP_PASS, IMAP_MAILBOX.",
    );
  }

  const messages = await fetchInboxMessages({
    since,
    limit: 300,
  });

  const matched = [];
  for (const message of messages) {
    if (alreadyIngested(project, message)) continue;

    const supplier = findSupplierForMessage(project, message);
    if (!supplier) continue;

    matched.push({
      supplier,
      message,
    });
  }

  return matched;
}
