import { normalizeText, toNumber } from "./shared.js";

function parseValueAndUnit(text, fallbackUnit = "kg") {
  const normalized = normalizeText(text).toLowerCase();
  const match = normalized.match(/(\d+(?:\.\d+)?)\s*(kg|kgs|kilogram|kilograms|ton|tons|tonne|tonnes|quintal|quintals)?/i);
  if (!match) return null;

  const value = Number(match[1]);
  const unit = (match[2] || fallbackUnit).toLowerCase();
  if (!Number.isFinite(value)) return null;
  return { value, unit };
}

function toKg(value, unit) {
  const normalized = String(unit || "kg").toLowerCase();
  if (["kg", "kgs", "kilogram", "kilograms"].includes(normalized)) return value;
  if (["ton", "tons", "tonne", "tonnes"].includes(normalized)) return value * 1000;
  if (["quintal", "quintals"].includes(normalized)) return value * 100;
  return value;
}

function toInrPerKg(value, unit) {
  const normalized = String(unit || "kg").toLowerCase();
  if (["kg", "kgs", "kilogram", "kilograms"].includes(normalized)) return value;
  if (["ton", "tons", "tonne", "tonnes"].includes(normalized)) return value / 1000;
  if (["quintal", "quintals"].includes(normalized)) return value / 100;
  return value;
}

export function extractPriceInrPerKg(text = "") {
  const normalized = normalizeText(text);
  if (!normalized) return null;

  const strict = normalized.match(/(?:inr|rs\.?|₹)\s*(\d+(?:\.\d+)?)\s*\/?\s*(kg|kgs|kilogram|kilograms|ton|tons|tonne|tonnes|quintal|quintals)/i)
    || normalized.match(/(\d+(?:\.\d+)?)\s*(?:inr|rs\.?|₹)\s*\/?\s*(kg|kgs|kilogram|kilograms|ton|tons|tonne|tonnes|quintal|quintals)/i)
    || normalized.match(/(\d+(?:\.\d+)?)\s*\/?\s*(kg|kgs|kilogram|kilograms|ton|tons|tonne|tonnes|quintal|quintals)\s*(?:inr|rs\.?|₹)/i);

  if (strict) {
    const price = Number(strict[1]);
    const unit = strict[2];
    if (Number.isFinite(price)) {
      return Number(toInrPerKg(price, unit).toFixed(2));
    }
  }

  const loose = normalized.match(/(?:inr|rs\.?|₹)\s*(\d+(?:\.\d+)?)/i);
  if (loose && Number.isFinite(Number(loose[1]))) {
    return Number(Number(loose[1]).toFixed(2));
  }

  return null;
}

export function extractMoqKg(text = "") {
  const normalized = normalizeText(text).toLowerCase();
  if (!normalized) return null;

  const explicit = normalized.match(/(?:moq|minimum order(?: quantity)?|min\.?(?:imum)?\s*order)\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(kg|kgs|kilogram|kilograms|ton|tons|tonne|tonnes|quintal|quintals)?/i);

  if (explicit) {
    const value = Number(explicit[1]);
    const unit = explicit[2] || "kg";
    if (Number.isFinite(value)) {
      return Math.round(toKg(value, unit));
    }
  }

  const generic = parseValueAndUnit(normalized, "kg");
  if (generic && /moq|min(?:imum)?\s*order|order quantity|first order/i.test(normalized)) {
    return Math.round(toKg(generic.value, generic.unit));
  }

  return null;
}

export function extractLeadTimeDays(text = "") {
  const normalized = normalizeText(text).toLowerCase();
  if (!normalized) return null;

  const days = normalized.match(/(\d+(?:\.\d+)?)\s*(day|days)/i);
  if (days && Number.isFinite(Number(days[1]))) {
    return Math.round(Number(days[1]));
  }

  const weeks = normalized.match(/(\d+(?:\.\d+)?)\s*(week|weeks)/i);
  if (weeks && Number.isFinite(Number(weeks[1]))) {
    return Math.round(Number(weeks[1]) * 7);
  }

  return null;
}

export function extractPaymentTerms(text = "") {
  const normalized = normalizeText(text);
  if (!normalized) return null;

  const paymentMatch = normalized.match(/((?:\d{1,3}%\s*(?:advance|deposit).{0,40}\d{1,3}%\s*(?:before shipment|against dispatch|after delivery))|(?:net\s*\d+))/i);
  return paymentMatch ? paymentMatch[1] : null;
}

export function parseIngredientReply(replyText = "") {
  const unitPriceInrPerKg = extractPriceInrPerKg(replyText);
  const moqKg = extractMoqKg(replyText);
  const leadTimeDays = extractLeadTimeDays(replyText);
  const paymentTerms = extractPaymentTerms(replyText);

  const uncertainties = [];
  if (!Number.isFinite(unitPriceInrPerKg)) uncertainties.push("Unit price missing");
  if (!Number.isFinite(moqKg)) uncertainties.push("MOQ missing");
  if (!Number.isFinite(leadTimeDays)) uncertainties.push("Lead time missing");

  if (!/food\s*grade|fssai|iso|haccp/i.test(replyText)) {
    uncertainties.push("Food-grade/compliance proof not mentioned");
  }

  const extractedCount = [unitPriceInrPerKg, moqKg, leadTimeDays, paymentTerms].filter((value) => value !== null).length;
  const confidence = Number(Math.min(1, extractedCount / 4).toFixed(2));

  return {
    unitPriceInrPerKg: toNumber(unitPriceInrPerKg),
    moqKg: toNumber(moqKg),
    leadTimeDays: toNumber(leadTimeDays),
    paymentTerms: paymentTerms || null,
    uncertainties,
    confidence,
  };
}

export function parseSnippetHints(text = "") {
  return {
    unitPriceInrPerKg: extractPriceInrPerKg(text),
    moqKg: extractMoqKg(text),
    leadTimeDays: extractLeadTimeDays(text),
  };
}
