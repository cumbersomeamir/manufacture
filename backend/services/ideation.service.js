import { generateJsonWithFallback } from "./llm.service.js";

function pickCategory(idea = "") {
  const text = idea.toLowerCase();
  if (/(charger|battery|sensor|wearable|device|electronic)/.test(text)) {
    return "Consumer Electronics";
  }
  if (/(bottle|cup|kitchen|food|drink)/.test(text)) {
    return "Food Contact Consumer Goods";
  }
  if (/(bag|wallet|shoe|fashion|apparel)/.test(text)) {
    return "Soft Goods";
  }
  if (/(furniture|chair|table|lamp)/.test(text)) {
    return "Home Goods";
  }
  return "General Consumer Product";
}

function fallbackDefinition({ idea, constraints }) {
  const conciseIdea = idea.trim().slice(0, 220);
  const productName = conciseIdea
    .split(/[.!?]/)[0]
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60) || "Manufacture Concept";

  const category = pickCategory(idea);
  const complexityLevel = /electronic|battery|sensor|compliance/i.test(`${idea} ${constraints.complianceRequirements || ""}`)
    ? "high"
    : /custom|precision|tooling/i.test(idea)
      ? "medium"
      : "low";

  return {
    productName,
    summary: conciseIdea,
    manufacturingCategory: category,
    functionalRequirements: [
      "Meet intended user function and durability expectations",
      "Be feasible within early-stage pilot manufacturing",
      "Allow iterative sample testing before first production batch",
    ],
    keyMaterials:
      constraints.materialsPreferences
        ?.split(",")
        .map((part) => part.trim())
        .filter(Boolean) || ["Material to be validated during supplier discovery"],
    complexityLevel,
    risks: [
      "Supplier capability mismatch",
      "Compliance documentation gaps",
      "Unexpected tooling and sampling costs",
    ],
    assumptions: [
      "Prototype-first approach before volume production",
      "Initial suppliers are open to sampling and negotiation",
    ],
  };
}

export async function analyzeProductIdea({ idea, constraints = {}, imageContext = "" }) {
  const prompt = [
    "Analyze this physical product idea for pre-manufacturing execution.",
    "Return strict JSON with keys:",
    "productName, summary, manufacturingCategory, functionalRequirements (array), keyMaterials (array), complexityLevel (low|medium|high), risks (array), assumptions (array)",
    `Idea: ${idea}`,
    `Constraints: ${JSON.stringify(constraints)}`,
    imageContext ? `Image context: ${imageContext}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return generateJsonWithFallback({
    prompt,
    fallback: () => fallbackDefinition({ idea, constraints }),
  });
}
