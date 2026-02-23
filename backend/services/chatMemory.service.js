import { GoogleGenAI } from "@google/genai";
import { CHAT_CONSTANTS } from "../constants/chat.js";
import { loadHistory, loadSummary, saveHistory, saveSummary } from "./memory.js";

function clip(text, maxChars) {
  if (!text) return "";
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

function safeTextFromResp(resp) {
  if (typeof resp?.text === "string" && resp.text.trim()) return resp.text.trim();
  const parts = resp?.candidates?.[0]?.content?.parts ?? [];
  return parts.map((part) => part.text ?? "").join("").trim();
}

function trimHistory(history) {
  if (history.length <= CHAT_CONSTANTS.MAX_MESSAGES) return history;
  return history.slice(-CHAT_CONSTANTS.MAX_MESSAGES);
}

async function maybeSummarize({ ai, sessionId, history }) {
  if (history.length <= CHAT_CONSTANTS.MAX_MESSAGES) {
    return { history, summary: await loadSummary(sessionId) };
  }

  const existingSummary = await loadSummary(sessionId);
  const overflowCount = history.length - CHAT_CONSTANTS.MAX_MESSAGES;
  const toSummarize = history.slice(0, overflowCount);
  const keep = history.slice(overflowCount);

  const summaryPrompt = [
    "Summarize this conversation history into stable facts, preferences, constraints, decisions, and open tasks.",
    "Keep it concise and actionable.",
    JSON.stringify(toSummarize),
  ].join("\n\n");

  const contents = [];
  if (existingSummary) {
    contents.push({ role: "user", parts: [{ text: `Existing summary:\n${existingSummary}` }] });
  }
  contents.push({ role: "user", parts: [{ text: summaryPrompt }] });

  const resp = await ai.models.generateContent({
    model: CHAT_CONSTANTS.MODEL,
    contents,
    config: {
      temperature: CHAT_CONSTANTS.SUMMARY_TEMPERATURE,
      maxOutputTokens: CHAT_CONSTANTS.SUMMARY_MAX_TOKENS,
    },
  });

  const newSummary = safeTextFromResp(resp);
  const merged = existingSummary ? `${existingSummary}\n${newSummary}` : newSummary;
  await saveSummary(sessionId, merged);

  return { history: keep, summary: merged };
}

export async function generateChatWithMemory({
  sessionId,
  message,
  system = "",
  apiKey = process.env.GEMINI_API_KEY,
}) {
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not configured");
  }
  const ai = new GoogleGenAI({ apiKey });

  let history = await loadHistory(sessionId);
  history.push({
    role: "user",
    parts: [{ text: clip(message, CHAT_CONSTANTS.MAX_CHARS_PER_MSG) }],
  });
  history = trimHistory(history);

  const { history: compressedHistory, summary } = await maybeSummarize({
    ai,
    sessionId,
    history,
  });

  const contents = [];
  if (system?.trim()) {
    contents.push({ role: "user", parts: [{ text: `Instruction:\n${clip(system, 1000)}` }] });
  }
  if (summary?.trim()) {
    contents.push({ role: "user", parts: [{ text: `Conversation summary:\n${summary}` }] });
  }
  contents.push(...compressedHistory);

  const resp = await ai.models.generateContent({
    model: CHAT_CONSTANTS.MODEL,
    contents,
    config: {
      temperature: CHAT_CONSTANTS.TEMPERATURE,
      maxOutputTokens: CHAT_CONSTANTS.MAX_OUTPUT_TOKENS,
    },
  });

  const text = safeTextFromResp(resp);
  compressedHistory.push({ role: "model", parts: [{ text: clip(text, 4000) }] });
  await saveHistory(sessionId, trimHistory(compressedHistory));

  return {
    text,
    usage: resp?.usageMetadata,
  };
}
