import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

import { createApp } from "../server.js";
import { closeMongoConnection } from "../lib/db/mongodb.js";
import { clearProjectStore, patchProject } from "../store/project.store.js";
import { createSupplierModel } from "../models/Supplier.js";

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

test("manual reply ingest and negotiation work with real-mode constraints", async () => {
  const create = await request(app)
    .post("/api/projects")
    .send({
      idea: "A compact USB-C fast charger with foldable prongs",
      constraints: { country: "United States" },
    });
  assert.equal(create.status, 201);
  const projectId = create.body.id;

  const seededSupplier = createSupplierModel({
    name: "Acme Manufacturing",
    email: "sales@acme-mfg.com",
    location: "United States",
    country: "United States",
    exportCapability: "High",
    distanceComplexity: "Low",
    reasons: ["Seeded for backend integration test"],
  });

  await patchProject(projectId, (draft) => {
    draft.suppliers = [seededSupplier];
    return draft;
  });

  const prepared = await request(app)
    .post(`/api/projects/${projectId}/outreach/prepare`)
    .send({});
  assert.equal(prepared.status, 200);
  assert.ok(prepared.body.outreachDrafts.length >= 1);

  const sent = await request(app)
    .post(`/api/projects/${projectId}/outreach/send`)
    .send({});
  assert.ok(sent.status === 200 || sent.status === 503);
  if (sent.status === 503) {
    assert.match(String(sent.body.message || sent.body.error), /SMTP/i);
  } else {
    assert.ok(sent.body.project);
  }

  const supplierId = seededSupplier.id;
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

  const seededSupplier = createSupplierModel({
    name: "Pilot Supplier",
    email: "hello@pilot-supplier.com",
    location: "United States",
    country: "United States",
    exportCapability: "High",
    distanceComplexity: "Low",
    status: "responded",
    pricing: { unitPrice: 11.3, currency: "USD" },
    moq: 850,
    leadTimeDays: 24,
    toolingCost: 1400,
    confidenceScore: 0.86,
    reasons: ["Seeded for autopilot integration test"],
  });

  await patchProject(projectId, (draft) => {
    draft.suppliers = [seededSupplier];
    return draft;
  });

  const autopilot = await request(app)
    .post(`/api/projects/${projectId}/autopilot`)
    .send({ sendEmails: false, forceDiscover: false, forceOutreach: true });
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

test("outcome engine endpoints generate plan, award decision, and metrics", async () => {
  const create = await request(app)
    .post("/api/projects")
    .send({
      idea: "A compact desk robot with voice output, mic input, arduino controller, and plastic cover",
      constraints: { country: "United States", moqTolerance: "300-800" },
    });
  assert.equal(create.status, 201);
  const projectId = create.body.id;

  const supplierA = createSupplierModel({
    name: "Low Cost Factory",
    email: "sales@lowcostfactory.com",
    country: "China",
    location: "Shenzhen",
    pricing: { unitPrice: 8.9, currency: "USD" },
    moq: 600,
    leadTimeDays: 28,
    toolingCost: 2300,
    confidenceScore: 0.72,
    status: "responded",
  });
  const supplierB = createSupplierModel({
    name: "Fast Turn Supplier",
    email: "hello@fastturn.com",
    country: "United States",
    location: "Texas",
    pricing: { unitPrice: 10.6, currency: "USD" },
    moq: 350,
    leadTimeDays: 16,
    toolingCost: 1400,
    confidenceScore: 0.81,
    status: "responded",
  });

  await patchProject(projectId, (draft) => {
    draft.suppliers = [supplierA, supplierB];
    return draft;
  });

  const plan = await request(app)
    .post(`/api/projects/${projectId}/outcome/plan`)
    .send({ variantKey: "pilot" });
  assert.equal(plan.status, 200);
  assert.ok(plan.body.project?.outcomeEngine?.shouldCost);
  assert.ok(Array.isArray(plan.body.project?.outcomeEngine?.variants));
  assert.ok(plan.body.project?.outcomeEngine?.structuredRfq);

  const award = await request(app)
    .post(`/api/projects/${projectId}/outcome/award`)
    .send({ autoSelect: true });
  assert.equal(award.status, 200);
  assert.ok(award.body.decision?.recommendedSupplierId);
  assert.ok(award.body.project?.suppliers?.some((entry) => entry.selected));

  const metrics = await request(app)
    .get(`/api/projects/${projectId}/outcome/metrics`);
  assert.equal(metrics.status, 200);
  assert.equal(typeof metrics.body.metrics?.funnel?.suppliersIdentified, "number");
});
