"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createProject, deleteProject, loadProjects } from "@/store/project.store";

function StatusChip({ status }) {
  const normalized = String(status || "pending").toLowerCase();
  const className =
    normalized === "validated"
      ? "chip chip-ok"
      : normalized === "in_progress"
        ? "chip chip-progress"
        : "chip chip-muted";
  return <span className={className}>{normalized.replace("_", " ")}</span>;
}

export function DashboardClient() {
  const router = useRouter();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    name: "",
    idea: "",
    country: "United States",
    budgetRange: "",
    moqTolerance: "",
    materialsPreferences: "",
    complianceRequirements: "",
    ideaImagePrompt: "",
  });

  useEffect(() => {
    let cancelled = false;
    loadProjects()
      .then((data) => {
        if (!cancelled) setProjects(data || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Failed to load projects");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const sortedProjects = useMemo(
    () =>
      [...projects].sort(
        (a, b) =>
          new Date(b.updatedAt || b.createdAt || 0).getTime() -
          new Date(a.updatedAt || a.createdAt || 0).getTime(),
      ),
    [projects],
  );

  async function handleDelete(projectId) {
    if (!confirm("Delete this project permanently?")) return;
    setError("");
    try {
      await deleteProject(projectId);
      setProjects((current) => current.filter((project) => project.id !== projectId));
    } catch (err) {
      setError(err.message || "Failed to delete project");
    }
  }

  async function handleCreate(event) {
    event.preventDefault();
    setError("");

    if (!form.idea.trim()) {
      setError("Please provide a product idea.");
      return;
    }

    setCreating(true);
    try {
      const project = await createProject({
        name: form.name,
        idea: form.idea,
        ideaImagePrompt: form.ideaImagePrompt,
        constraints: {
          country: form.country,
          budgetRange: form.budgetRange,
          moqTolerance: form.moqTolerance,
          materialsPreferences: form.materialsPreferences,
          complianceRequirements: form.complianceRequirements,
        },
      });
      router.push(`/projects/${project.id}`);
    } catch (err) {
      setError(err.message || "Failed to create project");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="panel glow">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Inventor OS</h1>
            <p className="text-sm text-muted">Idea → factory-ready execution graph with AI agents.</p>
          </div>
          <StatusChip status="in_progress" />
        </div>

        <form onSubmit={handleCreate} className="grid gap-3 sm:grid-cols-2">
          <label className="field sm:col-span-2">
            <span>Product Idea *</span>
            <textarea
              rows={3}
              value={form.idea}
              onChange={(e) => setForm((prev) => ({ ...prev, idea: e.target.value }))}
              placeholder="Example: Spill-proof insulated shaker bottle with modular storage"
              required
            />
          </label>

          <label className="field">
            <span>Project Name</span>
            <input
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Optional"
            />
          </label>

          <label className="field">
            <span>Target Country</span>
            <input
              value={form.country}
              onChange={(e) => setForm((prev) => ({ ...prev, country: e.target.value }))}
              placeholder="United States"
            />
          </label>

          <label className="field">
            <span>Budget Range</span>
            <input
              value={form.budgetRange}
              onChange={(e) => setForm((prev) => ({ ...prev, budgetRange: e.target.value }))}
              placeholder="$8k-$20k"
            />
          </label>

          <label className="field">
            <span>MOQ Tolerance</span>
            <input
              value={form.moqTolerance}
              onChange={(e) => setForm((prev) => ({ ...prev, moqTolerance: e.target.value }))}
              placeholder="500-2000 units"
            />
          </label>

          <label className="field">
            <span>Materials Preference</span>
            <input
              value={form.materialsPreferences}
              onChange={(e) => setForm((prev) => ({ ...prev, materialsPreferences: e.target.value }))}
              placeholder="Stainless steel, silicone"
            />
          </label>

          <label className="field">
            <span>Compliance Requirements</span>
            <input
              value={form.complianceRequirements}
              onChange={(e) => setForm((prev) => ({ ...prev, complianceRequirements: e.target.value }))}
              placeholder="FDA food-contact, BPA-free"
            />
          </label>

          <label className="field sm:col-span-2">
            <span>Idea Image Prompt (Nano Banana)</span>
            <input
              value={form.ideaImagePrompt}
              onChange={(e) => setForm((prev) => ({ ...prev, ideaImagePrompt: e.target.value }))}
              placeholder="Render a polished hero shot of the product on neutral backdrop"
            />
          </label>

          {error ? <p className="text-sm text-danger sm:col-span-2">{error}</p> : null}

          <div className="sm:col-span-2 flex items-center justify-end">
            <button type="submit" className="btn-primary" disabled={creating}>
              {creating ? "Creating..." : "Start Project"}
            </button>
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight text-ink">Projects</h2>
          <span className="text-xs text-muted font-mono">{sortedProjects.length} total</span>
        </div>

        {loading ? (
          <p className="text-sm text-muted">Loading projects...</p>
        ) : sortedProjects.length === 0 ? (
          <p className="text-sm text-muted">No projects yet. Create your first one above.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {sortedProjects.map((project) => (
              <article key={project.id} className="project-card">
                <Link href={`/projects/${project.id}`} className="block">
                  <p className="text-xs text-muted font-mono">{new Date(project.updatedAt || project.createdAt).toLocaleString()}</p>
                  <h3 className="mt-1 text-lg font-semibold text-ink line-clamp-2">{project.name}</h3>
                  <p className="mt-2 text-sm text-muted line-clamp-2">{project.productDefinition?.summary || project.idea}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {Object.entries(project.moduleStatus || {}).slice(0, 4).map(([key, value]) => (
                      <span key={key} className="chip chip-muted">{key}: {String(value).replace("_", " ")}</span>
                    ))}
                  </div>
                </Link>
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => handleDelete(project.id)}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
