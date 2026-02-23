import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

function getImapConfig() {
  return {
    host: process.env.IMAP_HOST || "",
    port: Number(process.env.IMAP_PORT || 0),
    secure: String(process.env.IMAP_SECURE || "true").toLowerCase() === "true",
    user: process.env.IMAP_USER || "",
    pass: process.env.IMAP_PASS || "",
    mailbox: process.env.IMAP_MAILBOX || "INBOX",
  };
}

export function isImapConfigured() {
  const cfg = getImapConfig();
  return Boolean(cfg.host && cfg.port && cfg.user && cfg.pass && cfg.mailbox);
}

function asDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeEmail(value = "") {
  return String(value).trim().toLowerCase();
}

export async function fetchInboxMessages({ since, limit = 200 }) {
  if (!isImapConfigured()) {
    throw new Error("IMAP is not configured. Set IMAP_HOST, IMAP_PORT, IMAP_USER, IMAP_PASS.");
  }

  const cfg = getImapConfig();
  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: {
      user: cfg.user,
      pass: cfg.pass,
    },
    logger: false,
  });

  await client.connect();

  try {
    await client.mailboxOpen(cfg.mailbox);

    const criteria = ["ALL"];
    const sinceDate = asDate(since);
    if (sinceDate) {
      criteria.push(["SINCE", sinceDate]);
    }

    const uids = await client.search(criteria);
    const recent = uids.slice(-Math.max(1, limit));

    const messages = [];
    for await (const message of client.fetch(recent, {
      uid: true,
      envelope: true,
      source: true,
      internalDate: true,
    })) {
      const parsed = await simpleParser(message.source);
      const text = String(parsed.text || parsed.html || "").trim();
      if (!text) continue;

      const from = parsed.from?.value?.[0]?.address || message.envelope?.from?.[0]?.address || "";
      const to = parsed.to?.value?.map((entry) => entry.address).filter(Boolean) || [];

      messages.push({
        uid: message.uid,
        messageId: parsed.messageId || "",
        subject: parsed.subject || message.envelope?.subject || "",
        from: normalizeEmail(from),
        to: to.map((entry) => normalizeEmail(entry)),
        text,
        date: parsed.date ? parsed.date.toISOString() : message.internalDate?.toISOString(),
      });
    }

    return messages;
  } finally {
    await client.logout().catch(() => {});
  }
}
