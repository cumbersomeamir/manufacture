export const MODULE_LABELS = {
  ideation: "Ideation",
  checklist: "Checklist",
  discovery: "Discovery",
  outreach: "Outreach",
  responses: "Responses",
  negotiation: "Negotiation",
  success: "Success",
};

export function statusTone(status) {
  const normalized = String(status || "pending").toLowerCase();
  if (normalized === "validated") return "status-ok";
  if (normalized === "in_progress") return "status-progress";
  if (normalized === "blocked") return "status-blocked";
  return "status-pending";
}
