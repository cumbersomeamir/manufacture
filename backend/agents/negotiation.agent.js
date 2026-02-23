import { generateNegotiationDraft } from "../services/negotiation.service.js";

export async function runNegotiationAgent({ project, supplier, target }) {
  return generateNegotiationDraft({ project, supplier, target });
}
