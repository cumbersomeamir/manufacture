import { createSupplierModel } from "../models/Supplier.js";
import { assessCompliance } from "./compliance.service.js";
import { computeSupplierConfidence } from "../lib/scoring/supplierScore.js";
import { searchWeb } from "../lib/discovery/webSearch.js";
import { enrichSearchResultToSupplier } from "../lib/discovery/contactExtraction.js";

const GENERIC_NAME_REGEX = /^(contact us|about us|contact information|our|home|services|products?)$/i;

function normalizeCountry(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function marketplaceDomainsForCountry(countryHint = "") {
  const normalized = normalizeCountry(countryHint);
  const common = ["alibaba.com", "globalsources.com", "made-in-china.com"];

  if (normalized.includes("india")) {
    return [...common, "indiamart.com", "justdial.com", "tradeindia.com"];
  }
  if (normalized.includes("united states") || normalized === "usa" || normalized === "us") {
    return [...common, "thomasnet.com"];
  }
  return common;
}

function buildDiscoveryQueries(project) {
  const definition = project?.productDefinition || {};
  const constraints = project?.constraints || {};

  const product = definition.productName || project.name || project.idea || "consumer product";
  const category = definition.manufacturingCategory || "manufacturer";
  const materials = Array.isArray(definition.keyMaterials)
    ? definition.keyMaterials.slice(0, 3).join(" ")
    : "";

  const countryHint = constraints.country || "United States";
  const domains = marketplaceDomainsForCountry(countryHint);

  const genericQueries = [
    `${product} ${category} OEM manufacturer RFQ email ${countryHint}`,
    `${product} contract manufacturer contact email ${countryHint}`,
    `${category} factory supplier inquiry email ${countryHint}`,
    `${materials} ${product} private label manufacturer email ${countryHint}`,
    `${product} wholesale producer factory website contact`,
  ];

  const domainQueries = domains.map((domain) =>
    `site:${domain} ${product} ${category} manufacturer supplier RFQ ${countryHint}`,
  );

  return Array.from(new Set([...domainQueries, ...genericQueries]));
}

function safeHost(url = "") {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function isLikelySupplierCandidate(candidate) {
  const name = String(candidate?.name || "").trim();
  if (!name || GENERIC_NAME_REGEX.test(name)) return false;
  if (!candidate?.email) return false;
  return true;
}

function uniqueSupplierCandidates(candidates) {
  const byIdentity = new Map();
  for (const candidate of candidates) {
    if (!isLikelySupplierCandidate(candidate)) continue;
    const email = String(candidate.email || "").toLowerCase();
    const host = safeHost(candidate.website || candidate.sourceUrl || "");
    const key = email || host;
    if (!key) continue;
    if (!byIdentity.has(key)) {
      byIdentity.set(key, candidate);
      continue;
    }

    const existing = byIdentity.get(key);
    const existingHasMarketplace = existing?.marketplace && existing.marketplace !== "web";
    const incomingHasMarketplace = candidate?.marketplace && candidate.marketplace !== "web";
    if (!existingHasMarketplace && incomingHasMarketplace) {
      byIdentity.set(key, candidate);
    }
  }
  return Array.from(byIdentity.values());
}

export async function discoverManufacturers({ project }) {
  const queries = buildDiscoveryQueries(project);
  let searchResults = [];

  for (const query of queries) {
    const batch = await searchWeb({ query, maxResults: 8 }).catch(() => []);
    if (batch.length) {
      searchResults = [...searchResults, ...batch];
    }
    if (searchResults.length >= 28) break;
  }

  const dedupedResults = Array.from(
    new Map(searchResults.map((item) => [item.url, item])).values(),
  ).slice(0, 28);

  if (!dedupedResults.length) {
    throw new Error(
      "No web search results found for supplier discovery. Configure SERPER_API_KEY for stronger discovery or refine product details.",
    );
  }

  const enriched = [];
  for (const result of dedupedResults) {
    const supplier = await enrichSearchResultToSupplier(result, {
      targetCountry: project?.constraints?.country || "United States",
    }).catch(() => null);
    if (supplier) enriched.push(supplier);
    if (enriched.length >= 16) break;
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
