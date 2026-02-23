function includesKeyword(value = "", keywords = []) {
  const normalized = String(value).toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword));
}

export function assessCompliance({ country = "United States", category = "", materials = [] }) {
  const normalizedCountry = String(country || "United States").toLowerCase();
  const allText = `${category} ${(materials || []).join(" ")}`.toLowerCase();

  const requiredChecks = [];
  const redFlags = [];
  let importFeasibility = "High";

  if (includesKeyword(allText, ["electronic", "battery", "charger", "device"])) {
    requiredChecks.push("FCC/EMC", "Battery transport", "UL or equivalent safety listing");
    redFlags.push("High testing dependency before launch");
    importFeasibility = "Medium";
  }

  if (includesKeyword(allText, ["food", "bottle", "drink", "kitchen", "utensil"])) {
    requiredChecks.push("Food-contact material declaration", "FDA/EFSA suitability checks");
    redFlags.push("Material migration compliance must be documented");
    importFeasibility = importFeasibility === "High" ? "Medium" : importFeasibility;
  }

  if (includesKeyword(allText, ["cosmetic", "skin", "chemical", "fragrance"])) {
    requiredChecks.push("Ingredient disclosure", "Labeling compliance", "MSDS availability");
    redFlags.push("Regulatory labeling can delay import clearance");
    importFeasibility = "Low";
  }

  if (normalizedCountry.includes("united states")) {
    requiredChecks.push("HTS code validation", "CBP import documentation readiness");
  } else {
    requiredChecks.push("Destination-country import code validation");
  }

  return {
    importFeasibility,
    requiredChecks,
    redFlags,
  };
}
