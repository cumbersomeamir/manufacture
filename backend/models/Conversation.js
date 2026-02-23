import { randomUUID } from "crypto";

export function createConversationModel({
  projectId,
  supplierId,
  direction,
  channel = "email",
  subject = "",
  message,
  parsed = null,
}) {
  return {
    id: randomUUID(),
    projectId,
    supplierId,
    direction,
    channel,
    subject,
    message,
    parsed,
    createdAt: new Date().toISOString(),
  };
}
