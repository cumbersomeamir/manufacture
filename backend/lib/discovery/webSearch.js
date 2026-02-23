import axios from "axios";
import * as cheerio from "cheerio";

const HTTP_TIMEOUT_MS = 12000;
const MAX_RESULT_HARD_CAP = 20;

function normalizeWhitespace(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function decodeDuckDuckGoRedirect(url = "") {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("duckduckgo.com")) return url;
    const target = parsed.searchParams.get("uddg");
    return target ? decodeURIComponent(target) : url;
  } catch {
    return url;
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

export async function searchWeb({ query, maxResults = 10 }) {
  const limit = Math.max(1, Math.min(maxResults, MAX_RESULT_HARD_CAP));

  const serperResults = await searchViaSerper({ query, maxResults: limit }).catch(() => []);
  if (serperResults.length > 0) {
    return uniqueByUrl(serperResults).slice(0, limit);
  }

  const ddgResults = await searchViaDuckDuckGo({ query, maxResults: limit });
  return uniqueByUrl(ddgResults).slice(0, limit);
}
