import { randomUUID } from "crypto";

export const SOURCING_DEFAULTS = {
  country: "India",
  currency: "INR",
  targetCity: "",
  targetState: "",
  searchTerm: "",
  ingredientSpec: "",
  quantityTargetKg: null,
  maxBudgetInrPerKg: null,
};

export function nowIso() {
  return new Date().toISOString();
}

export function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function normalizeEmail(value = "") {
  return normalizeText(value).toLowerCase();
}

export function normalizePhone(value = "") {
  const raw = normalizeText(value);
  if (!raw) return "";
  const digits = raw.replace(/[^\d+]/g, "");
  const noPlus = digits.replace(/\+/g, "");

  if (noPlus.startsWith("91") && noPlus.length >= 12) {
    return `+${noPlus.slice(0, 12)}`;
  }

  if (/^[6-9]\d{9}$/.test(noPlus)) {
    return `+91${noPlus}`;
  }

  if (raw.startsWith("+") && raw.replace(/[^\d]/g, "").length >= 10) {
    return `+${raw.replace(/[^\d]/g, "")}`;
  }

  return "";
}

export function extractDomain(url = "") {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

export function ensureSourcingState(project) {
  if (!project.sourcing || typeof project.sourcing !== "object") {
    project.sourcing = {};
  }

  if (typeof project.sourcing.enabled !== "boolean") {
    project.sourcing.enabled = false;
  }

  if (!project.sourcing.brief || typeof project.sourcing.brief !== "object") {
    project.sourcing.brief = { ...SOURCING_DEFAULTS };
  } else {
    project.sourcing.brief = {
      ...SOURCING_DEFAULTS,
      ...project.sourcing.brief,
    };
  }

  if (!project.sourcing.moduleStatus || typeof project.sourcing.moduleStatus !== "object") {
    project.sourcing.moduleStatus = {
      discovery: "pending",
      outreach: "pending",
      responses: "pending",
      negotiation: "pending",
    };
  }

  if (!Array.isArray(project.sourcing.suppliers)) project.sourcing.suppliers = [];
  if (!Array.isArray(project.sourcing.outreachDrafts)) project.sourcing.outreachDrafts = [];
  if (!Array.isArray(project.sourcing.conversations)) project.sourcing.conversations = [];
  if (!Array.isArray(project.sourcing.inboxQueue)) project.sourcing.inboxQueue = [];
  if (!project.sourcing.lastReplySyncAt) project.sourcing.lastReplySyncAt = null;
  if (!project.sourcing.metrics || typeof project.sourcing.metrics !== "object") {
    project.sourcing.metrics = null;
  }

  return project.sourcing;
}

export function createSourcingConversation({
  supplierId,
  direction,
  channel,
  message,
  subject = "",
  parsed = null,
  metadata = null,
}) {
  return {
    id: randomUUID(),
    supplierId,
    direction,
    channel,
    subject,
    message,
    parsed,
    metadata,
    createdAt: nowIso(),
  };
}

export function findSourcingSupplier(project, supplierId) {
  const sourcing = ensureSourcingState(project);
  return sourcing.suppliers.find((entry) => entry.id === supplierId) || null;
}

export function setSourcingModuleStatus(project, moduleName, status) {
  const sourcing = ensureSourcingState(project);
  sourcing.moduleStatus[moduleName] = status;
}

export function recentOutboundSignature(project, supplierId, channel, text, hours = 12) {
  const sourcing = ensureSourcingState(project);
  const cutoff = Date.now() - hours * 3600 * 1000;
  return sourcing.conversations.find((entry) => {
    if (entry.supplierId !== supplierId) return false;
    if (entry.direction !== "outbound") return false;
    if (entry.channel !== channel) return false;
    if (normalizeText(entry.message) !== normalizeText(text)) return false;
    const createdAt = new Date(entry.createdAt).getTime();
    return Number.isFinite(createdAt) && createdAt >= cutoff;
  }) || null;
}

export function lastOutboundAt(project, supplierId, channel) {
  const sourcing = ensureSourcingState(project);
  const rows = sourcing.conversations
    .filter((entry) => entry.supplierId === supplierId && entry.direction === "outbound" && entry.channel === channel)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (!rows.length) return null;
  const time = new Date(rows[0].createdAt).getTime();
  return Number.isFinite(time) ? time : null;
}

export function coercePlatforms(platforms = []) {
  const allowed = new Set(["indiamart", "tradeindia", "justdial"]);
  const cleaned = (Array.isArray(platforms) ? platforms : [])
    .map((item) => String(item || "").toLowerCase())
    .filter((item) => allowed.has(item));

  return cleaned.length ? cleaned : ["indiamart", "tradeindia", "justdial"];
}
