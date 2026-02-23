import { analyzeProductIdea } from "../services/ideation.service.js";

export async function runIdeationAgent({ idea, constraints, imageContext }) {
  return analyzeProductIdea({ idea, constraints, imageContext });
}
