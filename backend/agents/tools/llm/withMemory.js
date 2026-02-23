import { generateChatWithMemory } from "../../../services/chatMemory.service.js";

const DEFAULT_NAMESPACE = "manufacture_agents";

function cleanSegment(value, fallback) {
  const clean = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return clean || fallback;
}

export function buildAgentMemorySessionId({
  namespace = DEFAULT_NAMESPACE,
  userId = "default-user",
  agentKey = "generic_agent",
  agentId = "global",
  sessionId,
}) {
  if (sessionId) return sessionId;

  const ns = cleanSegment(namespace, DEFAULT_NAMESPACE);
  const user = cleanSegment(userId, "default-user");
  const key = cleanSegment(agentKey, "generic_agent");
  const id = cleanSegment(agentId, "global");
  return `${ns}:${user}:${key}:${id}`;
}

export async function runAgentLlmWithMemory({
  message,
  system,
  namespace,
  userId,
  agentKey,
  agentId,
  sessionId,
}) {
  const resolvedSessionId = buildAgentMemorySessionId({
    namespace,
    userId,
    agentKey,
    agentId,
    sessionId,
  });

  return generateChatWithMemory({
    sessionId: resolvedSessionId,
    message,
    system,
  });
}
