import { createSupplierModel } from "../models/Supplier.js";
import { assessCompliance } from "./compliance.service.js";
import { computeSupplierConfidence } from "../lib/scoring/supplierScore.js";
import { searchWeb } from "../lib/discovery/webSearch.js";
import { enrichSearchResultToSupplier } from "../lib/discovery/contactExtraction.js";

function buildDiscoveryQuery(project) {
  const definition = project?.productDefinition || {};
  const constraints = project?.constraints || {};

  const product = definition.productName || project.name || project.idea || "consumer product";
  const category = definition.manufacturingCategory || "manufacturer";
  const materials = Array.isArray(definition.keyMaterials)
    ? definition.keyMaterials.slice(0, 3).join(" ")
    : "";

  const countryHint = constraints.country || "United States";
  return `${product} ${category} ${materials} OEM manufacturer RFQ email ${countryHint}`;
}

function uniqueSupplierCandidates(candidates) {
  const byEmail = new Map();
  for (const candidate of candidates) {
    const key = String(candidate.email || "").toLowerCase();
    if (!key) continue;
    if (!byEmail.has(key)) {
      byEmail.set(key, candidate);
    }
  }
  return Array.from(byEmail.values());
}

export async function discoverManufacturers({ project }) {
  const query = buildDiscoveryQuery(project);
  const searchResults = await searchWeb({ query, maxResults: 16 });

  if (!searchResults.length) {
    throw new Error(
      "No web search results found for supplier discovery. Configure SERPER_API_KEY for stronger discovery or refine product details.",
    );
  }

  const enriched = [];
  for (const result of searchResults) {
    const supplier = await enrichSearchResultToSupplier(result, {
      targetCountry: project?.constraints?.country || "United States",
    }).catch(() => null);
    if (supplier) enriched.push(supplier);
    if (enriched.length >= 12) break;
  }

  const unique = uniqueSupplierCandidates(enriched).slice(0, 8);
  if (!unique.length) {
    throw new Error(
      "No supplier emails were found from live web results. Provide SERPER_API_KEY or manually add suppliers for outreach.",
    );
  }

  const category = project?.productDefinition?.manufacturingCategory || "General Consumer Product";
  const compliance = assessCompliance({
    country: project?.constraints?.country,
    category,
    materials: project?.productDefinition?.keyMaterials,
  });

  return unique.map((candidate) => {
    const supplier = createSupplierModel({
      ...candidate,
      importFeasibility: candidate.importFeasibility || compliance.importFeasibility,
      riskFlags: Array.from(new Set([...(candidate.riskFlags || []), ...compliance.redFlags])),
      status: "identified",
    });

    supplier.confidenceScore = computeSupplierConfidence(supplier);
    return supplier;
  });
}
