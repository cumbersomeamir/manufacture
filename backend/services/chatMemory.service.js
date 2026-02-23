import { CHAT_CONSTANTS } from "../constants/chat.js";
import { loadHistory, loadSummary, saveHistory, saveSummary } from "./memory.js";
import { generateText, isLlmConfigured } from "./llm.service.js";

function clip(text, maxChars) {
  if (!text) return "";
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

function textFromHistoryEntry(entry) {
  return String(
    (entry?.parts || [])
      .map((part) => part?.text || "")
      .join(" "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function trimHistory(history) {
  if (history.length <= CHAT_CONSTANTS.MAX_MESSAGES) return history;
  return history.slice(-CHAT_CONSTANTS.MAX_MESSAGES);
}

async function maybeSummarize({ sessionId, history }) {
  if (history.length <= CHAT_CONSTANTS.MAX_MESSAGES) {
    return { history, summary: await loadSummary(sessionId) };
  }

  const existingSummary = await loadSummary(sessionId);
  const overflowCount = history.length - CHAT_CONSTANTS.MAX_MESSAGES;
  const toSummarize = history.slice(0, overflowCount);
  const keep = history.slice(overflowCount);

  const transcript = toSummarize
    .map((item) => `${String(item.role || "user").toUpperCase()}: ${textFromHistoryEntry(item)}`)
    .join("\n");

  let newSummary = "";
  try {
    newSummary = await generateText({
      system: "You maintain concise conversation memory.",
      prompt: [
        "Summarize this conversation into durable facts, preferences, constraints, decisions, and open tasks.",
        "Keep it concise and actionable.",
        existingSummary ? `Existing summary:\n${existingSummary}` : "",
        `Recent turns:\n${transcript}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
      temperature: CHAT_CONSTANTS.SUMMARY_TEMPERATURE,
      maxOutputTokens: CHAT_CONSTANTS.SUMMARY_MAX_TOKENS,
    });
  } catch {
    const fallbackLines = toSummarize
      .filter((item) => textFromHistoryEntry(item))
      .slice(-8)
      .map((item) => `${String(item.role || "user").toUpperCase()}: ${textFromHistoryEntry(item)}`);
    newSummary = fallbackLines.join(" | ");
  }

  const merged = existingSummary ? `${existingSummary}\n${newSummary}` : newSummary;
  await saveSummary(sessionId, merged);

  return { history: keep, summary: merged };
}

export async function generateChatWithMemory({
  sessionId,
  message,
  system = "",
  apiKey,
}) {
  if (!isLlmConfigured() && !apiKey) {
    throw new Error("No LLM configured for memory chat. Set GEMINI_API_KEY or NVIDIA_API_KEY.");
  }

  let history = await loadHistory(sessionId);
  history.push({
    role: "user",
    parts: [{ text: clip(message, CHAT_CONSTANTS.MAX_CHARS_PER_MSG) }],
  });
  history = trimHistory(history);

  const { history: compressedHistory, summary } = await maybeSummarize({
    sessionId,
    history,
  });

  const transcript = compressedHistory
    .map((item) => `${String(item.role || "user").toUpperCase()}: ${textFromHistoryEntry(item)}`)
    .join("\n");

  const text = await generateText({
    apiKey,
    system,
    prompt: [
      "Continue this conversation. Reply to the latest USER turn.",
      summary ? `Memory summary:\n${summary}` : "",
      `Recent turns:\n${transcript}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
    temperature: CHAT_CONSTANTS.TEMPERATURE,
    maxOutputTokens: CHAT_CONSTANTS.MAX_OUTPUT_TOKENS,
  });

  compressedHistory.push({ role: "model", parts: [{ text: clip(text, 4000) }] });
  await saveHistory(sessionId, trimHistory(compressedHistory));

  return {
    text,
    usage: null,
  };
}
