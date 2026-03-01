import { randomUUID } from "crypto";

export const DEFAULT_MODULE_STATUS = {
  ideation: "pending",
  checklist: "pending",
  discovery: "pending",
  outreach: "pending",
  responses: "pending",
  negotiation: "pending",
  success: "pending",
};

export function createProjectModel({
  name,
  idea,
  ideaImagePrompt = "",
  constraints = {},
  productDefinition,
  checklist,
}) {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    name: name?.trim() || "Untitled product",
    idea,
    ideaImagePrompt,
    constraints: {
      country: constraints.country || "United States",
      budgetRange: constraints.budgetRange || "",
      moqTolerance: constraints.moqTolerance || "",
      materialsPreferences: constraints.materialsPreferences || "",
      complianceRequirements: constraints.complianceRequirements || "",
    },
    productDefinition,
    checklist,
    suppliers: [],
    outreachDrafts: [],
    conversations: [],
    generatedImages: [],
    outcomeEngine: {
      shouldCost: null,
      variants: [],
      structuredRfq: null,
      awardDecision: null,
      kpiSnapshot: null,
      followUpPolicy: {
        responseSlaHours: 24,
        cadenceHours: 24,
        maxFollowUps: 2,
      },
      lastOutcomePlanAt: null,
    },
    sourcing: {
      enabled: false,
      brief: {
        searchTerm: "",
        ingredientSpec: "",
        quantityTargetKg: null,
        targetCity: "",
        targetState: "",
        maxBudgetInrPerKg: null,
        currency: "INR",
        country: "India",
      },
      moduleStatus: {
        discovery: "pending",
        outreach: "pending",
        responses: "pending",
        negotiation: "pending",
      },
      suppliers: [],
      outreachDrafts: [],
      conversations: [],
      inboxQueue: [],
      metrics: null,
      platformStats: [],
      lastDiscoveryAt: null,
      lastReplySyncAt: null,
    },
    moduleStatus: { ...DEFAULT_MODULE_STATUS },
    createdAt: now,
    updatedAt: now,
  };
}
