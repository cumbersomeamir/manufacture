import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";

export function loadProjects() {
  return apiGet("/api/projects");
}

export function createProject(payload) {
  return apiPost("/api/projects", payload);
}

export function getProject(projectId) {
  return apiGet(`/api/projects/${projectId}`);
}

export function discoverSuppliers(projectId) {
  return apiPost(`/api/projects/${projectId}/suppliers/discover`, {});
}

export function addSupplier(projectId, payload) {
  return apiPost(`/api/projects/${projectId}/suppliers`, payload);
}

export function prepareOutreach(projectId, payload = {}) {
  return apiPost(`/api/projects/${projectId}/outreach/prepare`, payload);
}

export function sendOutreach(projectId, payload = {}) {
  return apiPost(`/api/projects/${projectId}/outreach/send`, payload);
}

export function syncReplies(projectId, payload = {}) {
  return apiPost(`/api/projects/${projectId}/replies/sync`, payload);
}

export function sendFollowUps(projectId, payload = {}) {
  return apiPost(`/api/projects/${projectId}/outreach/followup`, payload);
}

export function ingestSupplierReply(projectId, payload) {
  return apiPost(`/api/projects/${projectId}/replies/ingest`, payload);
}

export function negotiateWithSupplier(projectId, payload) {
  return apiPost(`/api/projects/${projectId}/negotiate`, payload);
}

export function selectSupplier(projectId, supplierId) {
  return apiPatch(`/api/projects/${projectId}/suppliers/${supplierId}/select`, {});
}

export function runAutopilot(projectId, payload = {}) {
  return apiPost(`/api/projects/${projectId}/autopilot`, payload);
}

export function generateOutcomePlan(projectId, payload = {}) {
  return apiPost(`/api/projects/${projectId}/outcome/plan`, payload);
}

export function generateStructuredRfq(projectId, payload = {}) {
  return apiPost(`/api/projects/${projectId}/outcome/rfq`, payload);
}

export function runAwardGate(projectId, payload = {}) {
  return apiPost(`/api/projects/${projectId}/outcome/award`, payload);
}

export function refreshOutcomeMetrics(projectId) {
  return apiGet(`/api/projects/${projectId}/outcome/metrics`);
}

export function finalizeSupplier(projectId, supplierId) {
  return apiPatch(`/api/projects/${projectId}/finalize/${supplierId}`, {});
}

export function deleteProject(projectId) {
  return apiDelete(`/api/projects/${projectId}`);
}

export async function generateConceptImage(projectId, payload) {
  const response = await apiPost(`/api/projects/${projectId}/generate-image`, payload);
  return response.project || response;
}
