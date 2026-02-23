import { CHECKLIST_STATUS } from "../models/ChecklistItem.js";

export function setModuleStatus(project, moduleName, status) {
  project.moduleStatus[moduleName] = status;
}

export function setChecklistItem(project, key, status, evidence = "", nextAction = "") {
  const item = project.checklist.find((entry) => entry.key === key);
  if (!item) return;
  item.status = status;
  item.evidence = evidence || item.evidence;
  item.nextAction = nextAction;
  item.updatedAt = new Date().toISOString();
}

export function validateChecklistIfReady(project, key, evidence) {
  const item = project.checklist.find((entry) => entry.key === key);
  if (!item) return;

  const depsValid = item.dependsOn.every((dependencyKey) => {
    const dep = project.checklist.find((entry) => entry.key === dependencyKey);
    return dep && dep.status === CHECKLIST_STATUS.VALIDATED;
  });

  item.status = depsValid ? CHECKLIST_STATUS.VALIDATED : CHECKLIST_STATUS.IN_PROGRESS;
  item.evidence = evidence || item.evidence;
  item.updatedAt = new Date().toISOString();
}
