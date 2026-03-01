import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

process.env.SOURCING_DISCOVERY_MOCK = "true";
process.env.SOURCING_OUTREACH_MOCK_SEND = "true";
process.env.SOURCING_NEGOTIATION_MOCK_SEND = "true";
process.env.TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "AC_MOCK";
process.env.TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "AUTH_MOCK";
process.env.TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886";

import { createApp } from "../server.js";
import { closeMongoConnection } from "../lib/db/mongodb.js";
import { clearProjectStore } from "../store/project.store.js";
import { dedupeLocalSuppliers } from "../services/sourcing/discovery.service.js";
import { parseIngredientReply } from "../services/sourcing/parsing.service.js";

const app = createApp();

test.beforeEach(async () => {
  await clearProjectStore();
});

test.after(async () => {
  await closeMongoConnection();
});

test("unit: parsing and dedupe helpers work for ingredient sourcing", () => {
  const parsed = parseIngredientReply(
    "Quote INR 185/kg. MOQ 200 kg. Lead time 7 days. Payment terms 30% advance 70% before shipment. Food grade available.",
  );

  assert.equal(parsed.unitPriceInrPerKg, 185);
  assert.equal(parsed.moqKg, 200);
  assert.equal(parsed.leadTimeDays, 7);
  assert.match(parsed.paymentTerms || "", /30%/i);

  const deduped = dedupeLocalSuppliers([
    { phone: "+919100000001", email: "a@x.com", website: "https://x.com" },
    { phone: "+919100000001", email: "b@y.com", website: "https://y.com" },
    { phone: "", email: "a@x.com", website: "https://z.com" },
    { phone: "", email: "", website: "https://same.com/a" },
    { phone: "", email: "", website: "https://same.com/b" },
  ]);

  assert.equal(deduped.length, 3);
});

test("integration: sourcing discovery -> outreach -> reply -> negotiation -> metrics", async () => {
  const created = await request(app)
    .post("/api/projects")
    .send({
      idea: "Launch a masala snack brand",
      constraints: { country: "India" },
    });

  assert.equal(created.status, 201);
  const projectId = created.body.id;

  const brief = await request(app)
    .post(`/api/projects/${projectId}/sourcing/brief`)
    .send({
      searchTerm: "chilli powder for snack seasoning",
      ingredientSpec: "ASTA color 80+, moisture <10%, food grade",
      quantityTargetKg: 100,
      targetCity: "Lucknow",
      targetState: "Uttar Pradesh",
      maxBudgetInrPerKg: 220,
    });
  assert.equal(brief.status, 200);

  const discovery = await request(app)
    .post(`/api/projects/${projectId}/sourcing/discover`)
    .send({ platforms: ["indiamart", "tradeindia", "justdial"], limit: 30 });

  assert.equal(discovery.status, 200);
  assert.ok(discovery.body.suppliers.length >= 3);

  const prepared = await request(app)
    .post(`/api/projects/${projectId}/sourcing/outreach/prepare`)
    .send({ channels: ["email", "whatsapp"] });

  assert.equal(prepared.status, 200);
  assert.ok(prepared.body.drafts.length >= 3);
  assert.ok(prepared.body.drafts.some((entry) => entry.channel === "email"));
  assert.ok(prepared.body.drafts.some((entry) => entry.channel === "whatsapp"));

  const sent = await request(app)
    .post(`/api/projects/${projectId}/sourcing/outreach/send`)
    .send({ autoSend: true });

  assert.equal(sent.status, 200);
  assert.ok(sent.body.sentCount > 0);
  const sentConvos = sent.body.project?.sourcing?.conversations || [];
  assert.ok(sentConvos.some((entry) => entry.channel === "email" && entry.direction === "outbound"));
  assert.ok(sentConvos.some((entry) => entry.channel === "whatsapp" && entry.direction === "outbound"));

  const firstSupplier = sent.body.project.sourcing.suppliers[0];
  const ingested = await request(app)
    .post(`/api/projects/${projectId}/sourcing/replies/ingest`)
    .send({
      supplierId: firstSupplier.id,
      channel: "whatsapp",
      replyText: "Price INR 185/kg, MOQ 200kg, lead time 7 days, payment 30% advance and 70% before shipment, food grade available.",
    });

  assert.equal(ingested.status, 200);
  assert.equal(ingested.body.parsed.unitPriceInrPerKg, 185);

  const negotiation1 = await request(app)
    .post(`/api/projects/${projectId}/sourcing/negotiate`)
    .send({
      supplierId: firstSupplier.id,
      target: { unitPriceInrPerKg: 165, moqKg: 100, leadTimeDays: 7 },
      channel: "whatsapp",
      sendMessage: true,
    });
  assert.equal(negotiation1.status, 200);
  assert.equal(negotiation1.body.delivery.status, "sent");

  const negotiation2 = await request(app)
    .post(`/api/projects/${projectId}/sourcing/negotiate`)
    .send({
      supplierId: firstSupplier.id,
      target: { unitPriceInrPerKg: 160, moqKg: 80, leadTimeDays: 6 },
      channel: "whatsapp",
      sendMessage: true,
    });
  assert.equal(negotiation2.status, 200);

  const metrics = await request(app).get(`/api/projects/${projectId}/sourcing/metrics`);
  assert.equal(metrics.status, 200);
  assert.ok(metrics.body.metrics?.funnel?.suppliersIdentified >= 1);
  assert.ok(metrics.body.metrics?.funnel?.negotiationsSent >= 2);
});

test("integration: twilio webhook queues inbound and sync consumes it", async () => {
  const created = await request(app)
    .post("/api/projects")
    .send({
      idea: "Launch a snack seasoning blend",
      constraints: { country: "India" },
    });

  assert.equal(created.status, 201);
  const projectId = created.body.id;

  await request(app)
    .post(`/api/projects/${projectId}/sourcing/brief`)
    .send({
      searchTerm: "turmeric powder",
      ingredientSpec: "food grade",
      quantityTargetKg: 100,
      targetCity: "Lucknow",
      targetState: "Uttar Pradesh",
      maxBudgetInrPerKg: 210,
    });

  const discovery = await request(app)
    .post(`/api/projects/${projectId}/sourcing/discover`)
    .send({ platforms: ["indiamart"], limit: 5 });
  assert.equal(discovery.status, 200);

  const supplier = discovery.body.project.sourcing.suppliers[0];
  const from = `whatsapp:${supplier.whatsappNumber}`;

  const webhook = await request(app)
    .post("/api/webhooks/twilio/whatsapp")
    .type("form")
    .send({
      From: from,
      To: "whatsapp:+14155238886",
      Body: "INR 190/kg MOQ 150kg lead time 8 days food grade",
      MessageSid: "SM123456789",
    });

  assert.equal(webhook.status, 200);

  const synced = await request(app)
    .post(`/api/projects/${projectId}/sourcing/replies/sync`)
    .send({});

  assert.equal(synced.status, 200);
  assert.ok(synced.body.syncedCount >= 1);
  assert.ok((synced.body.project?.sourcing?.conversations || []).some((entry) => entry.direction === "inbound" && entry.channel === "whatsapp"));
});
