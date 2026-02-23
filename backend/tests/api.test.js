import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

import { createApp } from "../server.js";
import { closeMongoConnection } from "../lib/db/mongodb.js";
import { clearProjectStore } from "../store/project.store.js";

const app = createApp();

test.beforeEach(async () => {
  await clearProjectStore();
});

test.after(async () => {
  await closeMongoConnection();
});

test("GET /api/health returns service status", async () => {
  const response = await request(app).get("/api/health");
  assert.equal(response.status, 200);
  assert.equal(response.body.status, "ok");
});

test("POST /api/projects creates a structured project", async () => {
  const response = await request(app)
    .post("/api/projects")
    .send({
      name: "Insulated gym bottle",
      idea: "A leakproof insulated bottle with modular infuser and carry loop",
      constraints: {
        country: "United States",
        moqTolerance: "500-1000",
        materialsPreferences: "stainless steel, BPA-free polymer",
      },
    });

  assert.equal(response.status, 201);
  assert.ok(response.body.id);
  assert.equal(response.body.moduleStatus.ideation, "validated");
  assert.equal(response.body.moduleStatus.checklist, "validated");
  assert.equal(Array.isArray(response.body.checklist), true);
  assert.equal(response.body.checklist.length, 8);
});

test("end-to-end supplier workflow works without API keys", async () => {
  const create = await request(app)
    .post("/api/projects")
    .send({
      idea: "A compact USB-C fast charger with foldable prongs",
      constraints: { country: "United States" },
    });
  assert.equal(create.status, 201);
  const projectId = create.body.id;

  const discovered = await request(app)
    .post(`/api/projects/${projectId}/suppliers/discover`)
    .send({});
  assert.equal(discovered.status, 200);
  assert.ok(discovered.body.suppliers.length >= 3);

  const prepared = await request(app)
    .post(`/api/projects/${projectId}/outreach/prepare`)
    .send({});
  assert.equal(prepared.status, 200);
  assert.ok(prepared.body.outreachDrafts.length >= 1);

  const sent = await request(app)
    .post(`/api/projects/${projectId}/outreach/send`)
    .send({});
  assert.equal(sent.status, 200);
  assert.equal(sent.body.project.moduleStatus.outreach, "validated");

  const supplierId = sent.body.project.suppliers[0].id;
  const ingested = await request(app)
    .post(`/api/projects/${projectId}/replies/ingest`)
    .send({
      supplierId,
      replyText:
        "Thanks for the RFQ. Unit price is $12.40, MOQ 1200 units, lead time 5 weeks, tooling is $3200.",
    });

  assert.equal(ingested.status, 200);
  assert.equal(typeof ingested.body.parsed.confidence, "number");

  const negotiate = await request(app)
    .post(`/api/projects/${projectId}/negotiate`)
    .send({
      supplierId,
      target: { moq: 800, unitPrice: 10.5, leadTimeDays: 25 },
    });

  assert.equal(negotiate.status, 200);
  assert.ok(negotiate.body.draft.body.includes("MOQ") || negotiate.body.draft.body.includes("moq"));
});

test("autopilot and finalize complete project status flow", async () => {
  const created = await request(app)
    .post("/api/projects")
    .send({
      idea: "Portable travel cutlery set with magnetic case",
      constraints: { country: "United States" },
    });
  assert.equal(created.status, 201);

  const projectId = created.body.id;

  const autopilot = await request(app)
    .post(`/api/projects/${projectId}/autopilot`)
    .send({});
  assert.equal(autopilot.status, 200);
  assert.ok(Array.isArray(autopilot.body.summary));
  assert.ok(autopilot.body.project.suppliers.length >= 1);

  const selected = autopilot.body.project.suppliers.find((s) => s.selected) || autopilot.body.project.suppliers[0];
  const finalized = await request(app)
    .patch(`/api/projects/${projectId}/finalize/${selected.id}`)
    .send({});
  assert.equal(finalized.status, 200);
  assert.equal(finalized.body.moduleStatus.success, "validated");
});
