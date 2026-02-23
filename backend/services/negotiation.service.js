import { generateTextWithFallback } from "./llm.service.js";
import { buildRfqBody } from "../lib/email/rfqTemplate.js";
import { runAgentLlmWithMemory } from "../agents/tools/llm/withMemory.js";

function fallbackNegotiation({ project, supplier, target }) {
  const currentUnit = supplier?.pricing?.unitPrice;
  const currentMoq = supplier?.moq;
  const currentLead = supplier?.leadTimeDays;

  return [
    `Hi ${supplier.contactPerson || "team"},`,
    "",
    "Thanks for sharing your quotation.",
    "",
    "We are interested in moving forward and would like to align on pilot terms:",
    target?.unitPrice
      ? `- Unit price target: ${target.unitPrice} ${supplier?.pricing?.currency || "USD"} (currently ${currentUnit ?? "N/A"})`
      : currentUnit
        ? `- Unit price: can we improve from ${currentUnit} ${supplier?.pricing?.currency || "USD"} for initial run?`
        : "- Unit price: please confirm your best pilot quote",
    target?.moq
      ? `- MOQ target: ${target.moq} units (currently ${currentMoq ?? "N/A"})`
      : currentMoq
        ? `- MOQ: can we reduce from ${currentMoq} units for first batch?`
        : "- MOQ: please share lowest viable initial quantity",
    target?.leadTimeDays
      ? `- Lead time target: ${target.leadTimeDays} days (currently ${currentLead ?? "N/A"})`
      : "- Lead time: please share fastest sample + production schedule",
    "",
    "If aligned, we can proceed quickly with sample confirmation.",
    "",
    "Best regards,",
    project.name,
  ].join("\n");
}

export async function generateNegotiationDraft({ project, supplier, target = {} }) {
  const system =
    "You negotiate professionally with suppliers. Be precise, respectful, and anchor terms clearly.";

  const prompt = [
    "Draft a negotiation follow-up email.",
    "Must focus on MOQ, price, and lead time.",
    "Keep under 220 words.",
    `Supplier quote context: ${JSON.stringify({
      unitPrice: supplier?.pricing?.unitPrice,
      moq: supplier?.moq,
      leadTimeDays: supplier?.leadTimeDays,
      toolingCost: supplier?.toolingCost,
    })}`,
    `Target terms: ${JSON.stringify(target)}`,
    `Project context: ${JSON.stringify(project.productDefinition)}`,
  ].join("\n\n");

  const memorySessionId = `manufacture:negotiation:${project.id}:${supplier.id}`;

  const body = await generateTextWithFallback({
    prompt,
    system,
    fallback: () => fallbackNegotiation({ project, supplier, target }),
  });

  let memoryBody = body;
  try {
    const memoryResponse = await runAgentLlmWithMemory({
      sessionId: memorySessionId,
      message: prompt,
      system,
    });
    if (memoryResponse?.text?.trim()) {
      memoryBody = memoryResponse.text.trim();
    }
  } catch {
    // Keep non-memory body fallback.
  }

  return {
    subject: `Negotiation Follow-up: ${project.productDefinition?.productName || project.name}`,
    body: memoryBody || body || buildRfqBody({ project, supplier }),
  };
}
