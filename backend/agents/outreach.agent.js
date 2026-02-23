import { createOutreachDrafts } from "../services/outreach.service.js";

export async function runOutreachAgent({ project, supplierIds }) {
  return createOutreachDrafts({ project, supplierIds });
}
