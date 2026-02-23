import { getDb, isMongoConfigured } from "../lib/db/mongodb.js";

const COLLECTION_NAME = "projects";
const memoryProjects = new Map();

let mongoReady = false;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stripMongoInternal(project) {
  if (!project) return null;
  const { _id, ...rest } = project;
  return rest;
}

async function getCollection() {
  const db = await getDb();
  const collection = db.collection(COLLECTION_NAME);

  if (!mongoReady) {
    await collection.createIndex({ id: 1 }, { unique: true });
    await collection.createIndex({ updatedAt: -1 });
    mongoReady = true;
  }

  return collection;
}

async function withMongoFallback(work) {
  if (!isMongoConfigured()) return null;
  try {
    return await work();
  } catch (error) {
    console.error("[project.store] Mongo operation failed; using in-memory fallback:", error.message);
    return null;
  }
}

export async function getStorageMode() {
  if (!isMongoConfigured()) return "memory";
  const collection = await withMongoFallback(() => getCollection());
  return collection ? "mongodb" : "memory";
}

export async function saveProject(project) {
  const doc = clone(project);

  const saved = await withMongoFallback(async () => {
    const collection = await getCollection();
    await collection.updateOne({ id: doc.id }, { $set: doc }, { upsert: true });
    const stored = await collection.findOne({ id: doc.id }, { projection: { _id: 0 } });
    return stored || doc;
  });

  if (saved) return stripMongoInternal(saved);

  memoryProjects.set(doc.id, clone(doc));
  return clone(doc);
}

export async function listProjects() {
  const listed = await withMongoFallback(async () => {
    const collection = await getCollection();
    return collection.find({}, { projection: { _id: 0 } }).sort({ updatedAt: -1 }).toArray();
  });

  if (listed) {
    return listed.map(stripMongoInternal).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  return Array.from(memoryProjects.values())
    .map((project) => clone(project))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export async function getProjectById(projectId) {
  const found = await withMongoFallback(async () => {
    const collection = await getCollection();
    return collection.findOne({ id: projectId }, { projection: { _id: 0 } });
  });

  if (found) return stripMongoInternal(found);

  const project = memoryProjects.get(projectId);
  return project ? clone(project) : null;
}

export async function patchProject(projectId, updater) {
  const existing = await getProjectById(projectId);
  if (!existing) return null;

  const draft = clone(existing);
  const next =
    typeof updater === "function"
      ? updater(draft) || draft
      : { ...draft, ...updater };

  next.updatedAt = new Date().toISOString();

  const updated = await withMongoFallback(async () => {
    const collection = await getCollection();
    await collection.updateOne({ id: projectId }, { $set: next }, { upsert: false });
    return collection.findOne({ id: projectId }, { projection: { _id: 0 } });
  });

  if (updated) return stripMongoInternal(updated);

  memoryProjects.set(projectId, clone(next));
  return clone(next);
}

export async function deleteProject(projectId) {
  const deleted = await withMongoFallback(async () => {
    const collection = await getCollection();
    const result = await collection.deleteOne({ id: projectId });
    return result.deletedCount > 0;
  });

  if (typeof deleted === "boolean") return deleted;

  return memoryProjects.delete(projectId);
}

export async function clearProjectStore() {
  await withMongoFallback(async () => {
    const collection = await getCollection();
    await collection.deleteMany({});
    return true;
  });
  memoryProjects.clear();
}
