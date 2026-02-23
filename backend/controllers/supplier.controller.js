import { discoverManufacturers } from "../services/manufacturerDiscovery.service.js";
import { getProjectById, patchProject } from "../store/project.store.js";
import { setChecklistItem, setModuleStatus } from "../services/projectState.service.js";
import { CHECKLIST_KEYS } from "../services/checklist.service.js";

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
