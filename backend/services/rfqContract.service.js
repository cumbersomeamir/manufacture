import { randomUUID } from "crypto";
import { generateJsonWithFallback } from "./llm.service.js";

function parseMoqTolerance(value = "") {
  const matches = String(value).match(/\d+(?:\.\d+)?/g) || [];
  if (!matches.length) return 500;
  return Number(matches[0]);
}

function parseBudgetTarget(value = "") {
  const matches = String(value).match(/\d+(?:\.\d+)?/g) || [];
  if (!matches.length) return null;
  return Number(matches[0]);
}

function fallbackStructuredRfq({ project, shouldCost, variant }) {
  const issueDate = new Date();
  const responseDeadline = new Date(issueDate.getTime() + 1000 * 60 * 60 * 24 * 3);
  const targetUnitPriceUsd =
    parseBudgetTarget(project?.constraints?.budgetRange) ||
    Number((shouldCost?.costBreakdown?.landedUnitCostUsd || 10).toFixed(2));
  const targetMoq = parseMoqTolerance(project?.constraints?.moqTolerance);
  const targetLeadTimeDays = variant?.timeline?.productionDays || 30;

  return {
    rfqId: randomUUID(),
    issueDate: issueDate.toISOString(),
    responseDeadline: responseDeadline.toISOString(),
    product: {
      name: project?.productDefinition?.productName || project.name,
      summary: project?.productDefinition?.summary || project.idea,
      category: project?.productDefinition?.manufacturingCategory || "General Consumer Product",
      keyMaterials: project?.productDefinition?.keyMaterials || [],
    },
    variantKey: variant?.key || "pilot",
    commercialTerms: {
      currency: "USD",
      targetUnitPriceUsd,
      targetMoq,
      targetLeadTimeDays,
      sampleLeadTimeDays: Math.max(7, Math.round(targetLeadTimeDays * 0.4)),
      incoterm: "EXW",
      paymentTerms: "30% deposit, 70% before shipment",
    },
    deliverables: [
      "Pilot/sample units with functional test report",
      "Final BOM with manufacturer part numbers",
      "Process flow summary and QC checkpoints",
      "Packing configuration and carton dimensions",
    ],
    qualityPlan: {
      aqlLevel: "Critical 0 / Major 2.5 / Minor 4.0",
      criticalChecks: [
        "Dimensional fit and assembly integrity",
        "Functional operation over 30-minute continuous run",
        "Visual/cosmetic defect screening",
      ],
    },
    complianceRequirements: [
      ...(project?.constraints?.complianceRequirements
        ? project.constraints.complianceRequirements
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean)
        : []),
      "Material declarations for restricted substances where applicable",
    ],
    quoteTemplateFields: [
      "Unit price by MOQ tiers (EXW)",
      "Tooling/NRE cost and amortization options",
      "Sample lead time and mass production lead time",
      "Packaging cost and carton specs",
      "Payment terms and validity period",
    ],
    attachmentsRequired: [
      "Capability statement and relevant past projects",
      "Factory location and export ports",
      "Proposed production timeline (Gantt or milestone list)",
    ],
    supplierQuestions: [
      "What is your minimum engineering change turnaround time?",
      "Can you support alternate part sourcing if one component is constrained?",
      "What in-line QC checks are standard at your line?",
    ],
    negotiationGuardrails: [
      "No non-cancelable blanket POs before sample validation",
      "All changes to MOQ/lead-time must be written and versioned",
      "Explicit definition of defect handling and rework responsibility",
    ],
  };
}

function normalizeArray(value, fallback) {
  return Array.isArray(value) && value.length ? value : fallback;
}

function normalizeStructuredRfq(raw, fallback) {
  if (!raw || typeof raw !== "object") return fallback;

  const product = raw.product || {};
  const commercialTerms = raw.commercialTerms || {};
  const qualityPlan = raw.qualityPlan || {};

  return {
    rfqId: raw.rfqId || fallback.rfqId,
    issueDate: raw.issueDate || fallback.issueDate,
    responseDeadline: raw.responseDeadline || fallback.responseDeadline,
    product: {
      name: product.name || fallback.product.name,
      summary: product.summary || fallback.product.summary,
      category: product.category || fallback.product.category,
      keyMaterials: normalizeArray(product.keyMaterials, fallback.product.keyMaterials),
    },
    variantKey: raw.variantKey || fallback.variantKey,
    commercialTerms: {
      currency: commercialTerms.currency || fallback.commercialTerms.currency,
      targetUnitPriceUsd:
        Number.isFinite(commercialTerms.targetUnitPriceUsd)
          ? commercialTerms.targetUnitPriceUsd
          : fallback.commercialTerms.targetUnitPriceUsd,
      targetMoq: Number.isFinite(commercialTerms.targetMoq)
        ? commercialTerms.targetMoq
        : fallback.commercialTerms.targetMoq,
      targetLeadTimeDays:
        Number.isFinite(commercialTerms.targetLeadTimeDays)
          ? commercialTerms.targetLeadTimeDays
          : fallback.commercialTerms.targetLeadTimeDays,
      sampleLeadTimeDays:
        Number.isFinite(commercialTerms.sampleLeadTimeDays)
          ? commercialTerms.sampleLeadTimeDays
          : fallback.commercialTerms.sampleLeadTimeDays,
      incoterm: commercialTerms.incoterm || fallback.commercialTerms.incoterm,
      paymentTerms: commercialTerms.paymentTerms || fallback.commercialTerms.paymentTerms,
    },
    deliverables: normalizeArray(raw.deliverables, fallback.deliverables),
    qualityPlan: {
      aqlLevel: qualityPlan.aqlLevel || fallback.qualityPlan.aqlLevel,
      criticalChecks: normalizeArray(qualityPlan.criticalChecks, fallback.qualityPlan.criticalChecks),
    },
    complianceRequirements: normalizeArray(raw.complianceRequirements, fallback.complianceRequirements),
    quoteTemplateFields: normalizeArray(raw.quoteTemplateFields, fallback.quoteTemplateFields),
    attachmentsRequired: normalizeArray(raw.attachmentsRequired, fallback.attachmentsRequired),
    supplierQuestions: normalizeArray(raw.supplierQuestions, fallback.supplierQuestions),
    negotiationGuardrails: normalizeArray(raw.negotiationGuardrails, fallback.negotiationGuardrails),
  };
}

export async function buildStructuredRfqContract({ project, shouldCost, variants, variantKey = "pilot" }) {
  const variant = (variants || []).find((entry) => entry.key === variantKey) || (variants || [])[0] || null;
  const fallback = fallbackStructuredRfq({ project, shouldCost, variant });

  const prompt = [
    "Create a structured RFQ contract packet for a manufacturer.",
    "Return strict JSON with keys: rfqId, issueDate, responseDeadline, product, variantKey, commercialTerms, deliverables, qualityPlan, complianceRequirements, quoteTemplateFields, attachmentsRequired, supplierQuestions, negotiationGuardrails.",
    "product keys: name, summary, category, keyMaterials (array).",
    "commercialTerms keys: currency, targetUnitPriceUsd, targetMoq, targetLeadTimeDays, sampleLeadTimeDays, incoterm, paymentTerms.",
    "qualityPlan keys: aqlLevel, criticalChecks.",
    "Be explicit and execution-oriented, no prose outside JSON.",
    `Project: ${JSON.stringify(project.productDefinition)}`,
    `Constraints: ${JSON.stringify(project.constraints)}`,
    `Should-cost: ${JSON.stringify(shouldCost)}`,
    `Variant selected: ${JSON.stringify(variant)}`,
  ].join("\n\n");

  const generated = await generateJsonWithFallback({
    prompt,
    maxOutputTokens: 1300,
    fallback: () => fallback,
  });

  return normalizeStructuredRfq(generated, fallback);
}

export function renderStructuredRfqText(contract) {
  const lines = [
    `RFQ ID: ${contract.rfqId}`,
    `Issue Date: ${contract.issueDate}`,
    `Response Deadline: ${contract.responseDeadline}`,
    "",
    `Product: ${contract.product.name}`,
    `${contract.product.summary}`,
    "",
    "Commercial Terms:",
    `- Target Unit Price (${contract.commercialTerms.currency}): ${contract.commercialTerms.targetUnitPriceUsd}`,
    `- Target MOQ: ${contract.commercialTerms.targetMoq}`,
    `- Target Lead Time (days): ${contract.commercialTerms.targetLeadTimeDays}`,
    `- Sample Lead Time (days): ${contract.commercialTerms.sampleLeadTimeDays}`,
    `- Incoterm: ${contract.commercialTerms.incoterm}`,
    `- Payment Terms: ${contract.commercialTerms.paymentTerms}`,
    "",
    "Required Deliverables:",
    ...contract.deliverables.map((item) => `- ${item}`),
    "",
    "Quote Template Fields:",
    ...contract.quoteTemplateFields.map((item) => `- ${item}`),
  ];

  return lines.join("\n");
}
