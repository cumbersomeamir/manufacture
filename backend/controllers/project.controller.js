import { createProjectModel } from "../models/Project.js";
import { buildChecklist } from "../services/checklist.service.js";
import { runIdeationAgent } from "../agents/ideation.agent.js";
import { generateProductConceptImage } from "../services/imageGeneration.service.js";
import {
  deleteProject,
  getProjectById,
  listProjects,
  patchProject,
  saveProject,
} from "../store/project.store.js";
import { setChecklistItem, setModuleStatus } from "../services/projectState.service.js";
import { CHECKLIST_KEYS } from "../services/checklist.service.js";

export async function createProjectHandler(req, res) {
  const { name, idea, ideaImagePrompt = "", constraints = {}, imageContext = "" } = req.body || {};
  if (!idea || typeof idea !== "string") {
    return res.status(400).json({ error: "idea is required" });
  }

  try {
    const productDefinition = await runIdeationAgent({
      idea,
      constraints,
      imageContext,
    });

    const checklist = await buildChecklist({
      productDefinition,
      constraints,
    });

    const project = createProjectModel({
      name,
      idea,
      ideaImagePrompt,
      constraints,
      productDefinition,
      checklist,
    });

    setModuleStatus(project, "ideation", "validated");
    setModuleStatus(project, "checklist", "validated");
    setChecklistItem(project, CHECKLIST_KEYS.DEFINE_PRODUCT, "validated", "Idea converted to structured manufacturing definition.");

    const saved = await saveProject(project);
    return res.status(201).json(saved);
  } catch (error) {
    return res.status(500).json({
      error: "Failed to create project",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export async function listProjectsHandler(req, res) {
  try {
    const projects = await listProjects();
    return res.json(projects);
  } catch (error) {
    return res.status(500).json({
      error: "Failed to list projects",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export async function getProjectHandler(req, res) {
  try {
    const project = await getProjectById(req.params.projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }
    return res.json(project);
  } catch (error) {
    return res.status(500).json({
      error: "Failed to fetch project",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export async function generateProjectImageHandler(req, res) {
  const { projectId } = req.params;
  const { prompt, referenceImageBase64, referenceImageMime, aspectRatio = "1:1" } = req.body || {};

  const project = await getProjectById(projectId);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  const resolvedPrompt = String(prompt || project.ideaImagePrompt || project.idea || "").trim();
  if (!resolvedPrompt) {
    return res.status(400).json({ error: "prompt is required" });
  }

  try {
    const result = await generateProductConceptImage({
      prompt: resolvedPrompt,
      referenceImageBase64,
      referenceImageMime,
      aspectRatio,
    });

    const updated = await patchProject(projectId, (draft) => {
      draft.generatedImages.unshift({
        prompt: resolvedPrompt,
        image: result.image,
        createdAt: new Date().toISOString(),
      });
      draft.generatedImages = draft.generatedImages.slice(0, 8);
      return draft;
    });

    return res.json({
      image: result.image,
      usage: result.usage,
      project: updated,
    });
  } catch (error) {
    return res.status(503).json({
      error: error instanceof Error ? error.message : "Image generation failed",
    });
  }
}

export async function deleteProjectHandler(req, res) {
  const { projectId } = req.params;
  try {
    const removed = await deleteProject(projectId);
    if (!removed) {
      return res.status(404).json({ error: "Project not found" });
    }
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to delete project",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
