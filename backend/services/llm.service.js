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

export async function generateText({
  prompt,
  system = "",
  apiKey = process.env.GEMINI_API_KEY,
  model = CHAT_CONSTANTS.MODEL,
  temperature = CHAT_CONSTANTS.TEMPERATURE,
  maxOutputTokens = CHAT_CONSTANTS.MAX_OUTPUT_TOKENS,
}) {
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not configured");
  }

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

export async function generateJson({ prompt, system = "", ...rest }) {
  const text = await generateText({
    prompt,
    system: `${system}\nReturn strict JSON with no markdown fences.`,
    ...rest,
  });

  const parsed = extractJson(text);
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
