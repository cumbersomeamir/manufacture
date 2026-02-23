import { GoogleGenAI } from "@google/genai";
import { CHAT_CONSTANTS } from "../constants/chat.js";

function safeTextFromResp(resp) {
  if (typeof resp?.text === "string" && resp.text.trim()) return resp.text.trim();
  const parts = resp?.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((part) => part?.text || "")
    .join("")
    .trim();
}

function extractJson(text) {
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/```json\s*([\s\S]*?)\s*```/i) || text.match(/({[\s\S]*}|\[[\s\S]*\])/);
    if (!match) return null;
    try {
      return JSON.parse(match[1]);
    } catch {
      return null;
    }
  }
}

function normalizeProviderName(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "gemini") return "gemini";
  if (normalized === "nvidia") return "nvidia";
  return "";
}

function resolveConfiguredProvider({ provider = "", apiKey = "" } = {}) {
  const requested = normalizeProviderName(provider || process.env.LLM_PROVIDER);
  if (requested === "gemini") {
    return {
      provider: "gemini",
      apiKey: apiKey || process.env.GEMINI_API_KEY || "",
    };
  }
  if (requested === "nvidia") {
    return {
      provider: "nvidia",
      apiKey: apiKey || process.env.NVIDIA_API_KEY || "",
    };
  }

  if (apiKey) {
    return {
      provider: "gemini",
      apiKey,
    };
  }

  if (process.env.GEMINI_API_KEY) {
    return {
      provider: "gemini",
      apiKey: process.env.GEMINI_API_KEY,
    };
  }

  if (process.env.NVIDIA_API_KEY) {
    return {
      provider: "nvidia",
      apiKey: process.env.NVIDIA_API_KEY,
    };
  }

  return {
    provider: "",
    apiKey: "",
  };
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function asNvidiaText(content) {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (typeof part?.text === "string") return part.text;
        return "";
      })
      .join("")
      .trim();
  }
  return "";
}

async function callNvidiaChat({
  apiKey,
  model = process.env.NVIDIA_MODEL || "meta/llama-3.1-70b-instruct",
  system = "",
  prompt,
  temperature = CHAT_CONSTANTS.TEMPERATURE,
  maxOutputTokens = CHAT_CONSTANTS.MAX_OUTPUT_TOKENS,
  responseFormat,
}) {
  const baseUrl = (process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1").replace(/\/+$/, "");
  const body = {
    model,
    messages: [
      ...(system ? [{ role: "system", content: system }] : []),
      { role: "user", content: prompt },
    ],
    temperature,
    max_tokens: maxOutputTokens,
    stream: false,
    ...(responseFormat ? { response_format: responseFormat } : {}),
  };

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const raw = await response.text();
  const payload = safeJsonParse(raw);

  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || raw || "Unknown NVIDIA API error";
    throw new Error(`NVIDIA API error: ${String(message).slice(0, 400)}`);
  }

  const text = asNvidiaText(payload?.choices?.[0]?.message?.content);
  if (!text) {
    throw new Error("NVIDIA API returned empty response");
  }
  return text;
}

async function generateTextWithGemini({
  prompt,
  system = "",
  apiKey,
  model = CHAT_CONSTANTS.MODEL,
  temperature = CHAT_CONSTANTS.TEMPERATURE,
  maxOutputTokens = CHAT_CONSTANTS.MAX_OUTPUT_TOKENS,
}) {
  const client = new GoogleGenAI({ apiKey });
  const fullPrompt = system
    ? `System instructions:\n${system}\n\nUser request:\n${prompt}`
    : prompt;

  const response = await client.models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
    config: {
      temperature,
      maxOutputTokens,
    },
  });

  const text = safeTextFromResp(response);
  if (!text) {
    throw new Error("LLM returned empty response");
  }
  return text;
}

async function generateTextWithNvidia({
  prompt,
  system = "",
  apiKey,
  model = process.env.NVIDIA_MODEL || "meta/llama-3.1-70b-instruct",
  temperature = CHAT_CONSTANTS.TEMPERATURE,
  maxOutputTokens = CHAT_CONSTANTS.MAX_OUTPUT_TOKENS,
}) {
  return callNvidiaChat({
    apiKey,
    model,
    system,
    prompt,
    temperature,
    maxOutputTokens,
  });
}

async function generateJsonWithNvidia({
  prompt,
  system = "",
  apiKey,
  model = process.env.NVIDIA_MODEL || "meta/llama-3.1-70b-instruct",
  temperature = CHAT_CONSTANTS.TEMPERATURE,
  maxOutputTokens = CHAT_CONSTANTS.MAX_OUTPUT_TOKENS,
}) {
  try {
    const text = await callNvidiaChat({
      apiKey,
      model,
      system,
      prompt,
      temperature,
      maxOutputTokens,
      responseFormat: { type: "json_object" },
    });
    const parsed = safeJsonParse(text) || extractJson(text);
    if (parsed) return parsed;
  } catch {
    // Some hosted models ignore/deny response_format, so we retry without it.
  }

  const text = await generateTextWithNvidia({
    prompt,
    system: `${system}\nReturn strict JSON with no markdown fences.`,
    apiKey,
    model,
    temperature,
    maxOutputTokens,
  });

  let parsed = safeJsonParse(text) || extractJson(text);
  if (parsed) return parsed;

  const retryText = await generateTextWithNvidia({
    prompt,
    system: `${system}\nReturn strict JSON with no markdown fences.`,
    apiKey,
    model,
    temperature: Math.min(temperature, 0.2),
    maxOutputTokens: Math.max(maxOutputTokens, 1200),
  });

  parsed = safeJsonParse(retryText) || extractJson(retryText);
  if (!parsed) {
    throw new Error("Failed to parse JSON from NVIDIA response");
  }
  return parsed;
}

export function getConfiguredLlmProvider() {
  const { provider, apiKey } = resolveConfiguredProvider();
  if (!provider || !apiKey) return null;
  return provider;
}

export function isLlmConfigured() {
  return Boolean(getConfiguredLlmProvider());
}

export async function generateText({
  prompt,
  system = "",
  apiKey,
  provider,
  model,
  temperature = CHAT_CONSTANTS.TEMPERATURE,
  maxOutputTokens = CHAT_CONSTANTS.MAX_OUTPUT_TOKENS,
}) {
  const resolved = resolveConfiguredProvider({ provider, apiKey });
  if (!resolved.provider || !resolved.apiKey) {
    throw new Error("No LLM provider configured. Set GEMINI_API_KEY or NVIDIA_API_KEY.");
  }

  if (resolved.provider === "gemini") {
    return generateTextWithGemini({
      prompt,
      system,
      apiKey: resolved.apiKey,
      model: model || CHAT_CONSTANTS.MODEL,
      temperature,
      maxOutputTokens,
    });
  }

  return generateTextWithNvidia({
    prompt,
    system,
    apiKey: resolved.apiKey,
    model: model || process.env.NVIDIA_MODEL || "meta/llama-3.1-70b-instruct",
    temperature,
    maxOutputTokens,
  });
}

export async function generateJson({
  prompt,
  system = "",
  apiKey,
  provider,
  model,
  temperature = CHAT_CONSTANTS.TEMPERATURE,
  maxOutputTokens = CHAT_CONSTANTS.MAX_OUTPUT_TOKENS,
}) {
  const resolved = resolveConfiguredProvider({ provider, apiKey });
  if (!resolved.provider || !resolved.apiKey) {
    throw new Error("No LLM provider configured. Set GEMINI_API_KEY or NVIDIA_API_KEY.");
  }

  if (resolved.provider === "nvidia") {
    return generateJsonWithNvidia({
      prompt,
      system,
      apiKey: resolved.apiKey,
      model: model || process.env.NVIDIA_MODEL || "meta/llama-3.1-70b-instruct",
      temperature,
      maxOutputTokens,
    });
  }

  const text = await generateTextWithGemini({
    prompt,
    system: `${system}\nReturn strict JSON with no markdown fences.`,
    apiKey: resolved.apiKey,
    model: model || CHAT_CONSTANTS.MODEL,
    temperature,
    maxOutputTokens,
  });

  const parsed = safeJsonParse(text) || extractJson(text);
  if (!parsed) {
    throw new Error("Failed to parse JSON from LLM response");
  }
  return parsed;
}

export async function generateTextWithFallback({ prompt, system, fallback, ...rest }) {
  try {
    return await generateText({ prompt, system, ...rest });
  } catch {
    return fallback();
  }
}

export async function generateJsonWithFallback({ prompt, system, fallback, ...rest }) {
  try {
    return await generateJson({ prompt, system, ...rest });
  } catch {
    return fallback();
  }
}
