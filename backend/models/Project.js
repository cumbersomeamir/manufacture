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
    moduleStatus: { ...DEFAULT_MODULE_STATUS },
    createdAt: now,
    updatedAt: now,
  };
}
