import axios from "axios";
import * as cheerio from "cheerio";

const HTTP_TIMEOUT_MS = 12000;
const MAX_RESULT_HARD_CAP = 20;

function normalizeWhitespace(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function decodeDuckDuckGoRedirect(url = "") {
  let normalizedUrl = url;
  if (normalizedUrl.startsWith("//")) {
    normalizedUrl = `https:${normalizedUrl}`;
  }

  try {
    const parsed = new URL(normalizedUrl);
    if (!parsed.hostname.includes("duckduckgo.com")) return normalizedUrl;
    const target = parsed.searchParams.get("uddg");
    return target ? decodeURIComponent(target) : normalizedUrl;
  } catch {
    return normalizedUrl;
  }
}

function isHttpUrl(url = "") {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function decodeBingRedirect(rawUrl = "") {
  try {
    const parsed = new URL(rawUrl);
    if (!parsed.hostname.includes("bing.com")) return rawUrl;

    const encoded = parsed.searchParams.get("u");
    if (!encoded) return rawUrl;

    const cleaned = encoded.startsWith("a1") ? encoded.slice(2) : encoded;
    const decoded = Buffer.from(cleaned, "base64").toString("utf8");
    return decoded.startsWith("http://") || decoded.startsWith("https://")
      ? decoded
      : rawUrl;
  } catch {
    return rawUrl;
  }
}

function uniqueByUrl(items = []) {
  const seen = new Set();
  const output = [];

  for (const item of items) {
    const key = item.url;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }

  return output;
}

async function searchViaSerper({ query, maxResults }) {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) return [];

  const response = await axios.post(
    "https://google.serper.dev/search",
    {
      q: query,
      num: Math.min(maxResults, MAX_RESULT_HARD_CAP),
    },
    {
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      timeout: HTTP_TIMEOUT_MS,
    },
  );

  const organic = Array.isArray(response.data?.organic) ? response.data.organic : [];
  return organic
    .map((item) => ({
      title: normalizeWhitespace(item.title),
      url: normalizeWhitespace(item.link),
      snippet: normalizeWhitespace(item.snippet),
      source: "serper",
    }))
    .filter((item) => isHttpUrl(item.url))
    .slice(0, maxResults);
}

async function searchViaDuckDuckGo({ query, maxResults }) {
  const response = await axios.get("https://html.duckduckgo.com/html/", {
    params: { q: query },
    timeout: HTTP_TIMEOUT_MS,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    },
  });

  const $ = cheerio.load(response.data || "");
  const results = [];

  $(".result").each((_, element) => {
    const title = normalizeWhitespace($(element).find(".result__a").text());
    const href = normalizeWhitespace($(element).find(".result__a").attr("href") || "");
    const snippet = normalizeWhitespace($(element).find(".result__snippet").text());

    const url = decodeDuckDuckGoRedirect(href);
    if (!isHttpUrl(url)) return;

    results.push({
      title,
      url,
      snippet,
      source: "duckduckgo",
    });
  });

  return uniqueByUrl(results).slice(0, maxResults);
}

async function searchViaBingHtml({ query, maxResults }) {
  const response = await axios.get("https://www.bing.com/search", {
    params: { q: query },
    timeout: HTTP_TIMEOUT_MS,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
  });

  const $ = cheerio.load(response.data || "");
  const results = [];

  $("li.b_algo").each((_, element) => {
    const title = normalizeWhitespace($(element).find("h2").text());
    const href = normalizeWhitespace($(element).find("h2 a").attr("href") || "");
    const snippet = normalizeWhitespace($(element).find(".b_caption p").text());

    const decodedHref = decodeBingRedirect(href);
    if (!isHttpUrl(decodedHref)) return;

    results.push({
      title,
      url: decodedHref,
      snippet,
      source: "bing_html",
    });
  });

  return uniqueByUrl(results).slice(0, maxResults);
}

export async function searchWeb({ query, maxResults = 10 }) {
  const limit = Math.max(1, Math.min(maxResults, MAX_RESULT_HARD_CAP));

  const serperResults = await searchViaSerper({ query, maxResults: limit }).catch(() => []);
  if (serperResults.length > 0) {
    return uniqueByUrl(serperResults).slice(0, limit);
  }

  const bingResults = await searchViaBingHtml({ query, maxResults: limit }).catch(() => []);
  if (bingResults.length > 0) {
    return uniqueByUrl(bingResults).slice(0, limit);
  }

  const ddgResults = await searchViaDuckDuckGo({ query, maxResults: limit });
  return uniqueByUrl(ddgResults).slice(0, limit);
}
