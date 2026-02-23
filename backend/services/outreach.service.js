import { createConversationModel } from "../models/Conversation.js";
import { buildRfqBody } from "../lib/email/rfqTemplate.js";
import { generateTextWithFallback } from "./llm.service.js";
import { isSmtpConfigured, sendEmail } from "../lib/email/smtpClient.js";
import { renderStructuredRfqText } from "./rfqContract.service.js";

async function buildSingleDraft({ project, supplier }) {
  const system =
    "You write concise supplier outreach emails with clear RFQ asks. Keep tone professional and direct.";
  const structuredRfq = project?.outcomeEngine?.structuredRfq || null;
  const rfqText = structuredRfq ? renderStructuredRfqText(structuredRfq) : "";
  const prompt = [
    "Write an outreach email for this supplier.",
    "Include product summary, material hints, MOQ preference, and ask for price/MOQ/lead time/tooling/terms.",
    "If structured RFQ terms are provided, include them as fixed requirements.",
    "Output only email body.",
    `Supplier: ${JSON.stringify(supplier)}`,
    `Project: ${JSON.stringify(project.productDefinition)}`,
    `Constraints: ${JSON.stringify(project.constraints)}`,
    rfqText ? `Structured RFQ:\n${rfqText}` : "",
  ].join("\n\n");

  const body = await generateTextWithFallback({
    prompt,
    system,
    fallback: () => [
      buildRfqBody({ project, supplier }),
      rfqText ? `\n\nStructured RFQ Terms:\n${rfqText}` : "",
    ].join(""),
  });

  return {
    supplierId: supplier.id,
    supplierName: supplier.name,
    supplierEmail: supplier.email || "",
    subject: `RFQ Request: ${project.productDefinition?.productName || project.name}`,
    body,
    structuredRfq: structuredRfq || undefined,
    status: "draft",
    createdAt: new Date().toISOString(),
  };
}

export async function createOutreachDrafts({ project, supplierIds = [] }) {
  const targetSuppliers = project.suppliers.filter(
    (supplier) => supplierIds.length === 0 || supplierIds.includes(supplier.id),
  );

  const drafts = [];
  for (const supplier of targetSuppliers) {
    drafts.push(await buildSingleDraft({ project, supplier }));
  }

  return drafts;
}

export async function sendOutreachDrafts({ projectId, drafts, suppliers }) {
  if (!isSmtpConfigured()) {
    throw new Error(
      "SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM before sending outreach.",
    );
  }

  const supplierMap = new Map((suppliers || []).map((supplier) => [supplier.id, supplier]));
  const sentConversations = [];
  const failures = [];

  for (const draft of drafts) {
    const supplier = supplierMap.get(draft.supplierId);
    const toEmail = draft.supplierEmail || supplier?.email || "";

    if (!toEmail) {
      failures.push({
        supplierId: draft.supplierId,
        reason: "Missing supplier email",
      });
      continue;
    }

    try {
      const result = await sendEmail({
        to: toEmail,
        subject: draft.subject,
        text: draft.body,
      });

      sentConversations.push(
        createConversationModel({
          projectId,
          supplierId: draft.supplierId,
          direction: "outbound",
          channel: "email",
          subject: draft.subject,
          message: draft.body,
          parsed: null,
          metadata: {
            to: toEmail,
            provider: "smtp",
            providerMessageId: result.messageId,
            accepted: result.accepted,
            rejected: result.rejected,
            status: "sent",
          },
        }),
      );
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
  };
}
