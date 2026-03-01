import axios from "axios";
import * as cheerio from "cheerio";
import { createSupplierModel } from "../../models/Supplier.js";
import { searchWeb } from "../../lib/discovery/webSearch.js";
import {
  coercePlatforms,
  ensureSourcingState,
  extractDomain,
  normalizeEmail,
  normalizePhone,
  normalizeText,
} from "./shared.js";
import { parseSnippetHints } from "./parsing.service.js";

const HTTP_TIMEOUT_MS = 12000;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const PLATFORM_DOMAIN = {
  indiamart: "indiamart.com",
  tradeindia: "tradeindia.com",
  justdial: "justdial.com",
};

function phoneCandidates(text = "") {
  const matches = String(text).match(/(?:\+?91[-\s]?)?[6-9]\d{9}/g) || [];
  return Array.from(new Set(matches.map((entry) => normalizePhone(entry)).filter(Boolean)));
}

function emailCandidates(text = "") {
  const regex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const matches = String(text).match(regex) || [];
  return Array.from(new Set(matches.map((entry) => normalizeEmail(entry)).filter(Boolean)));
}

function inferCityState(text = "") {
  const normalized = normalizeText(text);
  if (!normalized) return { city: "", state: "" };

  const split = normalized.match(/([A-Za-z\s]+),\s*([A-Za-z\s]+),\s*India/i)
    || normalized.match(/([A-Za-z\s]+),\s*([A-Za-z\s]+)$/);

  if (split) {
    return {
      city: normalizeText(split[1]),
      state: normalizeText(split[2]),
    };
  }

  return { city: "", state: "" };
}

function buildPlatformQuery({ platform, term, brief }) {
  const domain = PLATFORM_DOMAIN[platform] || "";
  const location = [brief?.targetCity, brief?.targetState, "India"].filter(Boolean).join(" ").trim();
  const spec = brief?.ingredientSpec || "food grade ingredient supplier";
  return `site:${domain} ${term} ${spec} wholesale supplier ${location}`.trim();
}

function parseSupplierName(title = "", url = "") {
  const cleaned = normalizeText(title).replace(/\s*[-|].*$/, "").trim();
  if (cleaned && !/^(contact us|home|about us|products?|services?)$/i.test(cleaned)) return cleaned;
  const domain = extractDomain(url);
  if (!domain) return "Unknown Supplier";
  return domain
    .split(".")[0]
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function fetchListingSnapshot(url = "") {
  try {
    const response = await axios.get(url, {
      timeout: HTTP_TIMEOUT_MS,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
      maxRedirects: 5,
    });

    const html = typeof response.data === "string" ? response.data : "";
    if (!html) return { text: "", phones: [], emails: [] };
    const $ = cheerio.load(html);
    const text = normalizeText($.text()).slice(0, 30000);

    return {
      text,
      phones: phoneCandidates(text),
      emails: emailCandidates(text),
    };
  } catch {
    return { text: "", phones: [], emails: [] };
  }
}

function platformScore(platform) {
  if (platform === "indiamart") return 0.75;
  if (platform === "tradeindia") return 0.7;
  if (platform === "justdial") return 0.65;
  return 0.5;
}

function scoreSupplierForPrototype(supplier) {
  const price = Number(supplier.priceInrPerKg);
  const moq = Number(supplier.moqKg);
  const lead = Number(supplier.leadTimeDays);

  const costScore = Number.isFinite(price)
    ? Math.max(0, Math.min(1, 1 - (price - 100) / 500))
    : 0.45;
  const moqScore = Number.isFinite(moq)
    ? Math.max(0, Math.min(1, 1 - Math.max(0, moq - 100) / 900))
    : 0.5;
  const leadScore = Number.isFinite(lead)
    ? Math.max(0, Math.min(1, 1 - Math.max(0, lead - 7) / 28))
    : 0.5;
  const confidenceBase =
    platformScore(supplier.platform || supplier.marketplace) +
    (supplier.email ? 0.1 : 0) +
    (supplier.phone ? 0.1 : 0) +
    (supplier.website ? 0.05 : 0);
  const confidenceScore = Math.max(0, Math.min(1, Number(confidenceBase.toFixed(2))));

  const totalScore = Number(
    (costScore * 0.65 + moqScore * 0.2 + leadScore * 0.1 + confidenceScore * 0.05).toFixed(4),
  );

  return {
    totalScore,
    confidenceScore,
  };
}

export function dedupeLocalSuppliers(candidates = []) {
  const seen = new Set();
  const output = [];

  for (const item of candidates) {
    const phoneKey = normalizePhone(item.phone || item.whatsappNumber || "");
    const emailKey = normalizeEmail(item.email || "");
    const domainKey = extractDomain(item.website || item.listingUrl || "");
    const key = phoneKey || emailKey || domainKey;
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }

  return output;
}

async function discoverFromPlatformFallback({ platform, term, brief, limit }) {
  const query = buildPlatformQuery({ platform, term, brief });
  const searchResults = await searchWeb({ query, maxResults: Math.max(4, Math.min(20, limit)) }).catch(() => []);

  const normalized = [];
  for (const result of searchResults) {
    const snapshot = await fetchListingSnapshot(result.url);
    const snippet = normalizeText(`${result.snippet || ""} ${snapshot.text.slice(0, 1200)}`);
    const hints = parseSnippetHints(snippet);
    const cityState = inferCityState(snippet);

    const phone = snapshot.phones[0] || "";
    const email = snapshot.emails[0] || "";

    const supplier = createSupplierModel({
      name: parseSupplierName(result.title, result.url),
      email,
      phone,
      whatsappNumber: phone,
      city: cityState.city,
      state: cityState.state,
      country: "India",
      location: [cityState.city, cityState.state, "India"].filter(Boolean).join(", "),
      website: result.url,
      listingUrl: result.url,
      marketplace: platform,
      platform,
      sourceUrl: result.url,
      sourceSnippet: result.snippet || "",
      reasons: [`Discovered on ${platform} via live web search`, result.snippet || ""].filter(Boolean),
      priceInrPerKg: hints.unitPriceInrPerKg,
      moqKg: hints.moqKg,
      moq: hints.moqKg,
      leadTimeDays: hints.leadTimeDays,
      pricing: {
        unitPrice: hints.unitPriceInrPerKg,
        currency: "INR",
      },
      status: "identified",
      distanceComplexity: "Low",
      importFeasibility: "High",
      exportCapability: "N/A",
    });

    const score = scoreSupplierForPrototype(supplier);
    supplier.confidenceScore = score.confidenceScore;
    supplier.prototypeScore = score.totalScore;
    normalized.push(supplier);
  }

  return normalized;
}

async function discoverFromPlatformApi({ platform, term, brief, limit }) {
  // Credential-ready API stubs. Fallback discovery remains primary path until keys are configured.
  if (platform === "tradeindia" && process.env.TRADEINDIA_API_KEY && process.env.TRADEINDIA_USER_ID) {
    // Placeholder for direct authenticated API integration; returns [] so fallback still runs.
    return [];
  }

  if (platform === "indiamart" && process.env.INDIAMART_API_KEY) {
    // Placeholder for direct authenticated API integration; returns [] so fallback still runs.
    return [];
  }

  return [];
}

export async function discoverLocalIngredientSuppliers({ project, platforms = [], limit = 30 }) {
  const sourcing = ensureSourcingState(project);
  const selectedPlatforms = coercePlatforms(platforms);
  const perPlatformLimit = Math.max(4, Math.ceil(limit / Math.max(1, selectedPlatforms.length)));
  const term = sourcing.brief.searchTerm || project.idea || "snack ingredient supplier";

  if (String(process.env.SOURCING_DISCOVERY_MOCK || "").toLowerCase() === "true") {
    const mockSuppliers = selectedPlatforms.map((platform, idx) =>
      createSupplierModel({
        name: `${platform.toUpperCase()} Ingredient Supplier ${idx + 1}`,
        email: `sales${idx + 1}@${platform}-supplier.example`,
        phone: `+91910000000${idx + 1}`,
        whatsappNumber: `+91910000000${idx + 1}`,
        city: sourcing.brief.targetCity || "Lucknow",
        state: sourcing.brief.targetState || "Uttar Pradesh",
        country: "India",
        location: [sourcing.brief.targetCity || "Lucknow", sourcing.brief.targetState || "Uttar Pradesh", "India"].join(", "),
        website: `https://www.${platform}.com/mock-supplier-${idx + 1}`,
        listingUrl: `https://www.${platform}.com/mock-supplier-${idx + 1}`,
        marketplace: platform,
        platform,
        sourceSnippet: `Mock listing for ${term}`,
        priceInrPerKg: 180 + idx * 10,
        moqKg: 100 + idx * 50,
        moq: 100 + idx * 50,
        leadTimeDays: 7 + idx * 2,
        pricing: { unitPrice: 180 + idx * 10, currency: "INR" },
        status: "identified",
      }),
    );

    return {
      suppliers: mockSuppliers.slice(0, Math.max(1, limit)),
      platformStats: selectedPlatforms.map((platform) => ({
        platform,
        discovered: 1,
        apiUsed: false,
      })),
    };
  }

  const allCandidates = [];
  const platformStats = [];

  for (const platform of selectedPlatforms) {
    const fromApi = await discoverFromPlatformApi({ platform, term, brief: sourcing.brief, limit: perPlatformLimit });
    const fromFallback = await discoverFromPlatformFallback({ platform, term, brief: sourcing.brief, limit: perPlatformLimit });

    const merged = dedupeLocalSuppliers([...fromApi, ...fromFallback]);
    allCandidates.push(...merged);

    platformStats.push({
      platform,
      discovered: merged.length,
      apiUsed: fromApi.length > 0,
    });
  }

  const deduped = dedupeLocalSuppliers(allCandidates)
    .map((entry) => {
      const score = scoreSupplierForPrototype(entry);
      return {
        ...entry,
        confidenceScore: score.confidenceScore,
        prototypeScore: score.totalScore,
      };
    })
    .sort((a, b) => Number(b.prototypeScore || 0) - Number(a.prototypeScore || 0))
    .slice(0, Math.max(1, limit));

  if (!deduped.length) {
    throw new Error("No local suppliers found. Refine searchTerm/ingredientSpec or increase limit.");
  }

  return {
    suppliers: deduped,
    platformStats,
  };
}
