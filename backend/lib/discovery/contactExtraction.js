import axios from "axios";
import * as cheerio from "cheerio";

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const HTTP_TIMEOUT_MS = 10000;
const GENERIC_TITLE_REGEX = /^(contact us|contact|about us|about|contact information|home|our|products|services|inquiry)$/i;

function normalizeWhitespace(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function isLikelyBusinessEmail(email = "") {
  const normalized = String(email).toLowerCase();
  if (!normalized || normalized.endsWith(".png") || normalized.endsWith(".jpg")) return false;
  if (/(example\.com|sentry\.io|wixpress\.com|cloudflare\.com)/i.test(normalized)) return false;
  if (normalized.includes("noreply") || normalized.includes("no-reply")) return false;
  return true;
}

function pickBestEmail(candidates = [], domain = "") {
  const cleaned = Array.from(
    new Set(
      candidates
        .map((email) => String(email).toLowerCase())
        .filter(isLikelyBusinessEmail),
    ),
  );

  if (!cleaned.length) return "";
  const preferred = cleaned.find((email) => domain && email.endsWith(`@${domain}`));
  if (preferred) return preferred;

  const priorities = ["sales@", "rfq@", "quote@", "inquiry@", "contact@", "info@"];
  for (const prefix of priorities) {
    const hit = cleaned.find((email) => email.startsWith(prefix));
    if (hit) return hit;
  }

  return cleaned[0];
}

function safeUrl(value = "") {
  try {
    const url = new URL(value);
    return url;
  } catch {
    return null;
  }
}

function textFromHtml(html = "") {
  const $ = cheerio.load(html);
  return normalizeWhitespace($.text());
}

function deriveNameFromTitle(title = "", hostname = "") {
  const cleanTitle = normalizeWhitespace(title).replace(/\s*[-|].*$/, "").trim();
  if (cleanTitle && !GENERIC_TITLE_REGEX.test(cleanTitle)) {
    return cleanTitle.slice(0, 120);
  }

  if (!hostname) return "Unknown supplier";
  return hostname
    .replace(/^www\./i, "")
    .split(".")[0]
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function inferMarketplace(url = "") {
  const host = String(url).toLowerCase();
  if (host.includes("alibaba.com")) return "alibaba";
  if (host.includes("indiamart.com")) return "indiamart";
  if (host.includes("justdial.com")) return "justdial";
  if (host.includes("tradeindia.com")) return "tradeindia";
  if (host.includes("globalsources.com")) return "globalsources";
  if (host.includes("made-in-china.com")) return "made-in-china";
  if (host.includes("thomasnet.com")) return "thomasnet";
  return "web";
}

function inferCountry(text = "", fallback = "") {
  const haystack = String(text).toLowerCase();
  const map = [
    ["united states", "United States"],
    ["usa", "United States"],
    ["china", "China"],
    ["vietnam", "Vietnam"],
    ["india", "India"],
    ["mexico", "Mexico"],
    ["malaysia", "Malaysia"],
    ["taiwan", "Taiwan"],
    ["turkey", "Turkey"],
    ["germany", "Germany"],
    ["italy", "Italy"],
    ["portugal", "Portugal"],
  ];

  for (const [needle, country] of map) {
    if (haystack.includes(needle)) return country;
  }
  return fallback || "Unknown";
}

async function fetchHtml(url) {
  const response = await axios.get(url, {
    timeout: HTTP_TIMEOUT_MS,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
    maxRedirects: 5,
  });
  return typeof response.data === "string" ? response.data : "";
}

export async function enrichSearchResultToSupplier(result, { targetCountry = "United States" } = {}) {
  const parsed = safeUrl(result.url);
  if (!parsed) return null;

  const baseUrl = `${parsed.protocol}//${parsed.host}`;
  const host = parsed.hostname.replace(/^www\./i, "");

  let html = "";
  let contactHtml = "";

  try {
    html = await fetchHtml(result.url);
  } catch {
    try {
      html = await fetchHtml(baseUrl);
    } catch {
      html = "";
    }
  }

  try {
    contactHtml = await fetchHtml(`${baseUrl}/contact`);
  } catch {
    contactHtml = "";
  }

  const joinedContent = `${html}\n${contactHtml}\n${result.snippet || ""}`;
  const emailMatches = joinedContent.match(EMAIL_REGEX) || [];
  const email = pickBestEmail(emailMatches, host);

  if (!email) return null;

  const textSnapshot = textFromHtml(joinedContent).slice(0, 2000);
  const country = inferCountry(textSnapshot, targetCountry);
  const isDomestic = country.toLowerCase() === String(targetCountry).toLowerCase();

  return {
    name: deriveNameFromTitle(result.title, host),
    email,
    contactPerson: "",
    location: country,
    country,
    website: baseUrl,
    marketplace: inferMarketplace(result.url),
    sourceUrl: result.url,
    sourceSnippet: result.snippet || "",
    exportCapability: isDomestic ? "Medium" : "High",
    distanceComplexity: isDomestic ? "Low" : "High",
    importFeasibility: isDomestic ? "High" : "Medium",
    reasons: [
      `Discovered via ${result.source}`,
      result.snippet ? result.snippet.slice(0, 160) : "Manufacturer profile found on public web.",
    ].filter(Boolean),
  };
}
