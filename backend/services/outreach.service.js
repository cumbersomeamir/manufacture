import { createConversationModel } from "../models/Conversation.js";
import { buildRfqBody } from "../lib/email/rfqTemplate.js";
import { generateTextWithFallback } from "./llm.service.js";

async function buildSingleDraft({ project, supplier }) {
  const system =
    "You write concise supplier outreach emails with clear RFQ asks. Keep tone professional and direct.";
  const prompt = [
    "Write an outreach email for this supplier.",
    "Include product summary, material hints, MOQ preference, and ask for price/MOQ/lead time/tooling/terms.",
    "Output only email body.",
    `Supplier: ${JSON.stringify(supplier)}`,
    `Project: ${JSON.stringify(project.productDefinition)}`,
    `Constraints: ${JSON.stringify(project.constraints)}`,
  ].join("\n\n");

  const body = await generateTextWithFallback({
    prompt,
    system,
    fallback: () => buildRfqBody({ project, supplier }),
  });

  return {
    supplierId: supplier.id,
    supplierName: supplier.name,
    subject: `RFQ Request: ${project.productDefinition?.productName || project.name}`,
    body,
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

export function sendOutreachDrafts({ projectId, drafts }) {
  return drafts.map((draft) =>
    createConversationModel({
      projectId,
      supplierId: draft.supplierId,
      direction: "outbound",
      channel: "email",
      subject: draft.subject,
      message: draft.body,
    }),
  );
}
