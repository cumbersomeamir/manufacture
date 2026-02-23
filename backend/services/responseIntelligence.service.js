import {
  extractLeadTimeDays,
  extractMOQ,
  extractPrice,
  extractToolingCost,
} from "../lib/parsing/numberExtraction.js";
import { generateJsonWithFallback } from "./llm.service.js";

function fallbackParse(replyText) {
  const unitPrice = extractPrice(replyText);
  const moq = extractMOQ(replyText);
  const leadTimeDays = extractLeadTimeDays(replyText);
  const toolingCost = extractToolingCost(replyText);

  const extractedCount = [unitPrice, moq, leadTimeDays, toolingCost].filter((value) =>
    Number.isFinite(value),
  ).length;

  const uncertainties = [];
  if (!Number.isFinite(unitPrice)) uncertainties.push("Unit price missing");
  if (!Number.isFinite(moq)) uncertainties.push("MOQ missing");
  if (!Number.isFinite(leadTimeDays)) uncertainties.push("Lead time missing");

  return {
    unitPrice,
    currency: "USD",
    moq,
    leadTimeDays,
    toolingCost,
    uncertainties,
    followUpQuestions: uncertainties.map((item) => `Can you clarify: ${item.toLowerCase()}?`),
    confidence: Number((extractedCount / 4).toFixed(2)),
  };
}

export async function parseSupplierReply({ project, supplier, replyText }) {
  const prompt = [
    "Extract supplier response details from this message.",
    "Return strict JSON object with keys:",
    "unitPrice (number|null), currency, moq (number|null), leadTimeDays (number|null), toolingCost (number|null), uncertainties (array), followUpQuestions (array), confidence (0-1)",
    `Project: ${JSON.stringify(project.productDefinition)}`,
    `Supplier: ${JSON.stringify({ name: supplier.name, country: supplier.country })}`,
    `Reply: ${replyText}`,
  ].join("\n\n");

  const parsed = await generateJsonWithFallback({
    prompt,
    fallback: () => fallbackParse(replyText),
  });

  return {
    unitPrice: Number.isFinite(parsed?.unitPrice) ? parsed.unitPrice : null,
    currency: parsed?.currency || "USD",
    moq: Number.isFinite(parsed?.moq) ? parsed.moq : null,
    leadTimeDays: Number.isFinite(parsed?.leadTimeDays) ? parsed.leadTimeDays : null,
    toolingCost: Number.isFinite(parsed?.toolingCost) ? parsed.toolingCost : null,
    uncertainties: Array.isArray(parsed?.uncertainties) ? parsed.uncertainties : [],
    followUpQuestions: Array.isArray(parsed?.followUpQuestions)
      ? parsed.followUpQuestions
      : [],
    confidence: Number.isFinite(parsed?.confidence)
      ? Math.min(1, Math.max(0, parsed.confidence))
      : 0.4,
  };
}
