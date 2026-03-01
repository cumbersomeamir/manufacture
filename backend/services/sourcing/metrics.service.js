import { ensureSourcingState } from "./shared.js";

function min(values = []) {
  const clean = values.filter((value) => Number.isFinite(Number(value))).map(Number);
  if (!clean.length) return null;
  return Math.min(...clean);
}

function median(values = []) {
  const clean = values.filter((value) => Number.isFinite(Number(value))).map(Number).sort((a, b) => a - b);
  if (!clean.length) return null;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 === 1 ? clean[mid] : Number(((clean[mid - 1] + clean[mid]) / 2).toFixed(2));
}

export function computeSourcingMetrics(project) {
  const sourcing = ensureSourcingState(project);
  const suppliers = sourcing.suppliers || [];
  const conversations = sourcing.conversations || [];

  const quotedPrices = suppliers.map((supplier) => supplier.priceInrPerKg).filter((value) => Number.isFinite(Number(value)));
  const replied = suppliers.filter((supplier) => supplier.status === "responded" || supplier.status === "negotiating" || supplier.status === "shortlisted");

  const outbound = conversations.filter((entry) => entry.direction === "outbound");
  const inbound = conversations.filter((entry) => entry.direction === "inbound");

  return {
    generatedAt: new Date().toISOString(),
    moduleStatus: sourcing.moduleStatus,
    funnel: {
      suppliersIdentified: suppliers.length,
      suppliersContacted: suppliers.filter((entry) => ["contacted", "responded", "negotiating", "shortlisted"].includes(entry.status)).length,
      suppliersResponded: replied.length,
      negotiationsSent: outbound.filter((entry) => entry.metadata?.source === "sourcing_negotiation").length,
    },
    economics: {
      minUnitPriceInrPerKg: min(quotedPrices),
      medianUnitPriceInrPerKg: median(quotedPrices),
      bestMoqKg: min(suppliers.map((entry) => entry.moqKg)),
      bestLeadTimeDays: min(suppliers.map((entry) => entry.leadTimeDays)),
    },
    communications: {
      outboundCount: outbound.length,
      inboundCount: inbound.length,
      whatsappOutbound: outbound.filter((entry) => entry.channel === "whatsapp").length,
      emailOutbound: outbound.filter((entry) => entry.channel === "email").length,
    },
  };
}
