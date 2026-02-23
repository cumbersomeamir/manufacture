export function buildRfqBody({ project, supplier }) {
  const constraints = project.constraints || {};
  const definition = project.productDefinition || {};

  const lines = [
    `Hi ${supplier.contactPerson || "team"},`,
    "",
    "We are evaluating manufacturing partners for a new product and would like an RFQ.",
    "",
    `Product: ${definition.productName || project.name}`,
    `Category: ${definition.manufacturingCategory || "General"}`,
    `Requirements: ${(definition.functionalRequirements || []).join("; ") || "TBD"}`,
    `Materials preference: ${constraints.materialsPreferences || "Open"}`,
    `MOQ target: ${constraints.moqTolerance || "Flexible"}`,
    `Target market: ${constraints.country || "United States"}`,
    `Compliance notes: ${constraints.complianceRequirements || "Share standard compliance package"}`,
    "",
    "Please share:",
    "1) Unit pricing across quantity tiers",
    "2) MOQ",
    "3) Lead time for samples and production",
    "4) Tooling/setup cost",
    "5) Export terms and Incoterms",
    "",
    "Best regards,",
    "Manufacture AI",
  ];

  return lines.join("\n");
}
