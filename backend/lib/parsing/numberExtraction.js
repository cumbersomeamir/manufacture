function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function extractPrice(text = "") {
  const normalized = String(text);
  const scoped = normalized.match(/(?:price|unit cost|cost)\D{0,20}(\$?\d+(?:\.\d+)?)/i);
  if (scoped) {
    return toNumber(scoped[1].replace("$", ""));
  }
  const firstDollar = normalized.match(/\$(\d+(?:\.\d+)?)/);
  return firstDollar ? toNumber(firstDollar[1]) : null;
}

export function extractMOQ(text = "") {
  const normalized = String(text);
  const scoped = normalized.match(/(?:moq|minimum order|minimum quantity)\D{0,20}(\d+)/i);
  return scoped ? toNumber(scoped[1]) : null;
}

export function extractToolingCost(text = "") {
  const normalized = String(text);
  const scoped = normalized.match(/(?:tooling|mold|setup)\D{0,20}(\$?\d+(?:\.\d+)?)/i);
  return scoped ? toNumber(scoped[1].replace("$", "")) : null;
}

export function extractLeadTimeDays(text = "") {
  const normalized = String(text);
  const match = normalized.match(/(\d+)\s*(day|days|week|weeks)/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  const unit = match[2].toLowerCase();
  return unit.startsWith("week") ? value * 7 : value;
}
