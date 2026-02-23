import { createChecklistItem, CHECKLIST_STATUS } from "../models/ChecklistItem.js";
import { generateJsonWithFallback } from "./llm.service.js";

export const CHECKLIST_KEYS = {
  DEFINE_PRODUCT: "define-product",
  PROCESS_AND_MATERIALS: "process-and-materials",
  COMPLIANCE_PRECHECK: "compliance-precheck",
  SUPPLIER_DISCOVERY: "supplier-discovery",
  OUTREACH_RFQ: "outreach-rfq",
  RESPONSE_ANALYSIS: "response-analysis",
  NEGOTIATION: "negotiation",
  MANUFACTURER_SELECTION: "manufacturer-selection",
};

function fallbackChecklist() {
  return [
    {
      key: CHECKLIST_KEYS.DEFINE_PRODUCT,
      title: "Lock Product Definition",
      description: "Confirm intended function, user requirements, and quality expectations.",
      module: "ideation",
      dependsOn: [],
    },
    {
      key: CHECKLIST_KEYS.PROCESS_AND_MATERIALS,
      title: "Select Process & Materials",
      description: "Map feasible manufacturing methods and candidate materials.",
      module: "checklist",
      dependsOn: [CHECKLIST_KEYS.DEFINE_PRODUCT],
    },
    {
      key: CHECKLIST_KEYS.COMPLIANCE_PRECHECK,
      title: "Run Compliance Pre-check",
      description: "Identify import and category compliance checks before RFQ.",
      module: "checklist",
      dependsOn: [CHECKLIST_KEYS.PROCESS_AND_MATERIALS],
    },
    {
      key: CHECKLIST_KEYS.SUPPLIER_DISCOVERY,
      title: "Discover Supplier Shortlist",
      description: "Find and score relevant manufacturers with export fit.",
      module: "discovery",
      dependsOn: [CHECKLIST_KEYS.COMPLIANCE_PRECHECK],
    },
    {
      key: CHECKLIST_KEYS.OUTREACH_RFQ,
      title: "Send RFQs",
      description: "Generate and dispatch personalized RFQ outreach to shortlisted suppliers.",
      module: "outreach",
      dependsOn: [CHECKLIST_KEYS.SUPPLIER_DISCOVERY],
    },
    {
      key: CHECKLIST_KEYS.RESPONSE_ANALYSIS,
      title: "Parse Supplier Responses",
      description: "Extract pricing, MOQ, lead times, and missing data from replies.",
      module: "responses",
      dependsOn: [CHECKLIST_KEYS.OUTREACH_RFQ],
    },
    {
      key: CHECKLIST_KEYS.NEGOTIATION,
      title: "Negotiate Commercial Terms",
      description: "Negotiate MOQ, pricing, and lead times with selected suppliers.",
      module: "negotiation",
      dependsOn: [CHECKLIST_KEYS.RESPONSE_ANALYSIS],
    },
    {
      key: CHECKLIST_KEYS.MANUFACTURER_SELECTION,
      title: "Finalize Factory-ready Brief",
      description: "Select supplier and package all validated requirements for production handoff.",
      module: "success",
      dependsOn: [CHECKLIST_KEYS.NEGOTIATION],
    },
  ];
}

const ALLOWED_MODULES = new Set([
  "ideation",
  "checklist",
  "discovery",
  "outreach",
  "responses",
  "negotiation",
  "success",
]);

function asChecklistArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object") return [];

  const commonKeys = [
    "checklist",
    "items",
    "steps",
    "pre-manufacturing-checklist",
    "preManufacturingChecklist",
    "manufacturingChecklist",
    "data",
  ];

  for (const key of commonKeys) {
    if (Array.isArray(raw[key])) return raw[key];
  }

  for (const value of Object.values(raw)) {
    if (Array.isArray(value)) return value;
  }

  return [];
}

function normalizeChecklistItems(raw) {
  const fallback = fallbackChecklist();
  const items = asChecklistArray(raw);
  const merged = [];

  for (let index = 0; index < fallback.length; index += 1) {
    const base = fallback[index];
    const candidate = items[index] || {};

    const key = base.key;
    const title = String(candidate.title || "").trim() || base.title;
    const description = String(candidate.description || "").trim() || base.description;
    const module = ALLOWED_MODULES.has(String(candidate.module || "").trim())
      ? String(candidate.module).trim()
      : base.module;
    const dependsOn = base.dependsOn;

    merged.push({
      key,
      title,
      description,
      module,
      dependsOn,
    });
  }

  return merged;
}

export async function buildChecklist({ productDefinition, constraints }) {
  const prompt = [
    "Create an ordered pre-manufacturing checklist for this product idea.",
    "Return JSON array with exactly 8 items.",
    "Each item must include: key, title, description, module, dependsOn (array).",
    "Allowed module values: ideation, checklist, discovery, outreach, responses, negotiation, success.",
    "Use short kebab-case keys.",
    `Product definition: ${JSON.stringify(productDefinition)}`,
    `Constraints: ${JSON.stringify(constraints)}`,
  ].join("\n\n");

  const items = await generateJsonWithFallback({
    prompt,
    maxOutputTokens: 1400,
    fallback: () => fallbackChecklist(),
  });

  const safe = normalizeChecklistItems(items);

  return safe.map((item, index) =>
    createChecklistItem({
      key: item.key,
      title: item.title,
      description: item.description,
      module: item.module,
      dependsOn: Array.isArray(item.dependsOn) ? item.dependsOn : [],
      status: index === 0 ? CHECKLIST_STATUS.VALIDATED : CHECKLIST_STATUS.PENDING,
      nextAction: index === 1 ? "Validate material/process assumptions" : "",
      evidence: index === 0 ? "Product intent captured." : "",
    }),
  );
}
