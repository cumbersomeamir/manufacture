import { randomUUID } from "crypto";

export const CHECKLIST_STATUS = {
  PENDING: "pending",
  IN_PROGRESS: "in_progress",
  VALIDATED: "validated",
  BLOCKED: "blocked",
};

export function createChecklistItem({
  key,
  title,
  description,
  module,
  dependsOn = [],
  status = CHECKLIST_STATUS.PENDING,
  nextAction = "",
  evidence = "",
}) {
  return {
    id: randomUUID(),
    key,
    title,
    description,
    module,
    dependsOn,
    status,
    nextAction,
    evidence,
    updatedAt: new Date().toISOString(),
  };
}
