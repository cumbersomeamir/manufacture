export const CHAT_CONSTANTS = {
  MAX_MESSAGES: 20,
  MAX_CHARS_PER_MSG: 1200,
  MAX_OUTPUT_TOKENS: 500,
  TEMPERATURE: 0.3,
  MODEL: "gemini-2.0-flash",
  TTL_SEC: 60 * 60 * 24 * 7,
  SUMMARY_TEMPERATURE: 0.2,
  SUMMARY_MAX_TOKENS: 260,
};

export const CHAT_KEYS = {
  history: (sessionId) => `chat:${sessionId}:history`,
  summary: (sessionId) => `chat:${sessionId}:summary`,
};
