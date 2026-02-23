import { discoverManufacturers } from "../services/manufacturerDiscovery.service.js";
import { getProjectById, patchProject } from "../store/project.store.js";
import { setChecklistItem, setModuleStatus } from "../services/projectState.service.js";
import { CHECKLIST_KEYS } from "../services/checklist.service.js";
import { createSupplierModel } from "../models/Supplier.js";
import { computeSupplierConfidence } from "../lib/scoring/supplierScore.js";

export async function discoverSuppliersHandler(req, res) {
  const { projectId } = req.params;
  const project = await getProjectById(projectId);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  try {
    const suppliers = await discoverManufacturers({ project });

    const updated = await patchProject(projectId, (draft) => {
      draft.suppliers = suppliers;
      setModuleStatus(draft, "discovery", "validated");
      setChecklistItem(
        draft,
        CHECKLIST_KEYS.SUPPLIER_DISCOVERY,
        "validated",
        `Shortlisted ${suppliers.length} suppliers with feasibility tags.`,
      );
      return draft;
    });

    return res.json(updated);
  } catch (error) {
    return res.status(500).json({
      error: "Supplier discovery failed",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export async function selectSupplierHandler(req, res) {
  const { projectId, supplierId } = req.params;
  const project = await getProjectById(projectId);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  const updated = await patchProject(projectId, (draft) => {
    draft.suppliers = draft.suppliers.map((supplier) => ({
      ...supplier,
      selected: supplier.id === supplierId,
      updatedAt: new Date().toISOString(),
    }));

    const selected = draft.suppliers.find((supplier) => supplier.id === supplierId);
    if (selected) {
      setChecklistItem(
        draft,
        CHECKLIST_KEYS.MANUFACTURER_SELECTION,
        "in_progress",
        `User selected ${selected.name} as current front-runner.`,
      );
    }

    return draft;
  });

  return res.json(updated);
}

export async function addSupplierHandler(req, res) {
  const { projectId } = req.params;
  const project = await getProjectById(projectId);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  const {
    name,
    email,
    location = "",
    country = "",
    website = "",
    contactPerson = "",
    exportCapability = "Unknown",
    distanceComplexity = "Unknown",
    importFeasibility = "Unknown",
    reasons = [],
  } = req.body || {};

  if (!name || !email) {
    return res.status(400).json({ error: "name and email are required" });
  }

  const supplier = createSupplierModel({
    name,
    email,
    location,
    country,
    website,
    contactPerson,
    exportCapability,
    distanceComplexity,
    importFeasibility,
    reasons: Array.isArray(reasons) ? reasons : [String(reasons)],
    status: "identified",
  });
  supplier.confidenceScore = computeSupplierConfidence(supplier);

  const updated = await patchProject(projectId, (draft) => {
    const exists = draft.suppliers.some(
      (entry) => String(entry.email || "").toLowerCase() === String(email).toLowerCase(),
    );
    if (!exists) {
      draft.suppliers.unshift(supplier);
    }

    setChecklistItem(
      draft,
      CHECKLIST_KEYS.SUPPLIER_DISCOVERY,
      "in_progress",
      "Manual supplier added.",
      "Add more suppliers or run live discovery.",
    );
    setModuleStatus(draft, "discovery", "in_progress");
    return draft;
  });

  return res.status(201).json(updated);
}
