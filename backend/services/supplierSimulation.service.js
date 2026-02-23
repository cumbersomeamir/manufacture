function hashSeed(input = "") {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function seededValue(seed, min, max) {
  const span = max - min;
  const raw = (Math.sin(seed) + 1) / 2;
  return min + raw * span;
}

function roundCurrency(value) {
  return Math.round(value * 100) / 100;
}

function categoryBasePrice(category = "") {
  const text = String(category).toLowerCase();
  if (text.includes("electronics")) return 18;
  if (text.includes("food")) return 6.5;
  if (text.includes("soft")) return 11;
  if (text.includes("home")) return 14;
  return 9.5;
}

function countryMultiplier(country = "") {
  const text = String(country).toLowerCase();
  if (text.includes("united states")) return 1.35;
  if (text.includes("china")) return 0.84;
  if (text.includes("vietnam")) return 0.8;
  if (text.includes("malaysia")) return 0.9;
  if (text.includes("mexico")) return 0.95;
  return 1;
}

export function generateSyntheticQuote({ project, supplier }) {
  const seed = hashSeed(`${project.id}:${supplier.id}:${project.idea}`);
  const base = categoryBasePrice(project?.productDefinition?.manufacturingCategory);
  const multiplier = countryMultiplier(supplier.country);

  const unitPrice = roundCurrency(
    base * multiplier * seededValue(seed * 1.07, 0.85, 1.22),
  );
  const moq = Math.round(seededValue(seed * 1.23, 320, 2800) / 10) * 10;
  const leadTimeDays = Math.round(seededValue(seed * 1.47, 16, 56));
  const toolingCost = Math.round(seededValue(seed * 1.91, 700, 6800) / 50) * 50;

  return {
    unitPrice,
    currency: "USD",
    moq,
    leadTimeDays,
    toolingCost,
  };
}

export function buildSyntheticReplyText({ supplier, quote }) {
  return [
    `Hi team, this is ${supplier.contactPerson || "our sales team"} from ${supplier.name}.`,
    "",
    "Thanks for your RFQ. Here is our initial offer:",
    `- Unit price: $${quote.unitPrice} ${quote.currency}`,
    `- MOQ: ${quote.moq} units`,
    `- Lead time: ${quote.leadTimeDays} days after artwork confirmation`,
    `- Tooling/setup cost: $${quote.toolingCost}`,
    "",
    "We can discuss adjustments based on target volume and forecast commitment.",
    "Best regards,",
    supplier.contactPerson || "Sales Team",
  ].join("\n");
}

export function simulateSupplierReplies({ project, supplierIds = [] }) {
  const eligible = (project.suppliers || []).filter((supplier) => {
    if (supplierIds.length === 0) return true;
    return supplierIds.includes(supplier.id);
  });

  return eligible.map((supplier) => {
    const quote = generateSyntheticQuote({ project, supplier });
    const replyText = buildSyntheticReplyText({ supplier, quote });

    return {
      supplierId: supplier.id,
      subject: `RE: RFQ ${project.productDefinition?.productName || project.name}`,
      replyText,
      quote,
    };
  });
}

export function pickBestSupplier(suppliers = []) {
  if (!Array.isArray(suppliers) || suppliers.length === 0) return null;

  let best = null;
  let bestScore = -Infinity;

  for (const supplier of suppliers) {
    const unitPrice = Number.isFinite(supplier?.pricing?.unitPrice)
      ? supplier.pricing.unitPrice
      : 999;
    const moq = Number.isFinite(supplier?.moq) ? supplier.moq : 99999;
    const lead = Number.isFinite(supplier?.leadTimeDays) ? supplier.leadTimeDays : 999;
    const confidence = Number.isFinite(supplier?.confidenceScore) ? supplier.confidenceScore : 0;

    const score =
      (1 / unitPrice) * 38 +
      (1 / Math.max(1, moq)) * 2600 +
      (1 / Math.max(1, lead)) * 42 +
      confidence * 12;

    if (score > bestScore) {
      bestScore = score;
      best = supplier;
    }
  }

  return best;
}
