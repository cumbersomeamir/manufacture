import { randomUUID } from "crypto";

export function createSupplierModel(input = {}) {
  return {
    id: input.id || randomUUID(),
    name: input.name || "Unknown supplier",
    email: input.email || "",
    contactPerson: input.contactPerson || "",
    location: input.location || "",
    country: input.country || "",
    website: input.website || "",
    sourceUrl: input.sourceUrl || "",
    sourceSnippet: input.sourceSnippet || "",
    exportCapability: input.exportCapability || "Unknown",
    distanceComplexity: input.distanceComplexity || "Unknown",
    importFeasibility: input.importFeasibility || "Unknown",
    reasons: Array.isArray(input.reasons) ? input.reasons : [],
    pricing: {
      unitPrice: Number.isFinite(input?.pricing?.unitPrice)
        ? input.pricing.unitPrice
        : null,
      currency: input?.pricing?.currency || "USD",
    },
    moq: Number.isFinite(input.moq) ? input.moq : null,
    leadTimeDays: Number.isFinite(input.leadTimeDays) ? input.leadTimeDays : null,
    toolingCost: Number.isFinite(input.toolingCost) ? input.toolingCost : null,
    confidenceScore: Number.isFinite(input.confidenceScore)
      ? Math.min(1, Math.max(0, input.confidenceScore))
      : 0.5,
    riskFlags: Array.isArray(input.riskFlags) ? input.riskFlags : [],
    selected: Boolean(input.selected),
    status: input.status || "identified",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
