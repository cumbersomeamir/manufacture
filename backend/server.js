import "dotenv/config";
import cors from "cors";
import express from "express";
import { fileURLToPath } from "url";

import {
  createProjectHandler,
  deleteProjectHandler,
  generateProjectImageHandler,
  getProjectHandler,
  listProjectsHandler,
} from "./controllers/project.controller.js";
import {
  addSupplierHandler,
  discoverSuppliersHandler,
  selectSupplierHandler,
} from "./controllers/supplier.controller.js";
import {
  ingestReplyHandler,
  prepareOutreachHandler,
  sendOutreachHandler,
  syncRepliesHandler,
} from "./controllers/outreach.controller.js";
import { generateNegotiationHandler } from "./controllers/negotiation.controller.js";
import {
  finalizeSupplierHandler,
  runAutopilotHandler,
} from "./controllers/workflow.controller.js";
import { closeMongoConnection, pingMongo } from "./lib/db/mongodb.js";
import { isImapConfigured } from "./lib/email/imapClient.js";
import { isSmtpConfigured } from "./lib/email/smtpClient.js";
import { getConfiguredLlmProvider, isLlmConfigured } from "./services/llm.service.js";
import { getStorageMode } from "./store/project.store.js";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "20mb" }));

  app.get("/api/health", async (req, res) => {
    const storage = await getStorageMode();
    const mongoConnected = storage === "mongodb" ? await pingMongo() : false;
    res.json({
      status: "ok",
      service: "manufacture-backend",
      storage,
      mongoConnected,
      integrations: {
        smtpConfigured: isSmtpConfigured(),
        imapConfigured: isImapConfigured(),
        serperConfigured: Boolean(process.env.SERPER_API_KEY),
        llmConfigured: isLlmConfigured(),
        llmProvider: getConfiguredLlmProvider(),
        imageConfigured: Boolean(process.env.GEMINI_API_KEY),
      },
    });
  });

  app.post("/api/projects", createProjectHandler);
  app.get("/api/projects", listProjectsHandler);
  app.get("/api/projects/:projectId", getProjectHandler);
  app.delete("/api/projects/:projectId", deleteProjectHandler);
  app.post("/api/projects/:projectId/generate-image", generateProjectImageHandler);

  app.post("/api/projects/:projectId/suppliers/discover", discoverSuppliersHandler);
  app.post("/api/projects/:projectId/suppliers", addSupplierHandler);
  app.patch("/api/projects/:projectId/suppliers/:supplierId/select", selectSupplierHandler);

  app.post("/api/projects/:projectId/outreach/prepare", prepareOutreachHandler);
  app.post("/api/projects/:projectId/outreach/send", sendOutreachHandler);
  app.post("/api/projects/:projectId/replies/sync", syncRepliesHandler);
  app.post("/api/projects/:projectId/replies/ingest", ingestReplyHandler);

  app.post("/api/projects/:projectId/negotiate", generateNegotiationHandler);
  app.post("/api/projects/:projectId/autopilot", runAutopilotHandler);
  app.patch("/api/projects/:projectId/finalize/:supplierId", finalizeSupplierHandler);

  app.use((req, res) => {
    res.status(404).json({ error: "Route not found" });
  });

  return app;
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  const port = Number(process.env.PORT || 8080);
  const app = createApp();
  const server = app.listen(port, () => {
    console.log(`Manufacture backend running at http://localhost:${port}`);
  });

  const gracefulShutdown = async () => {
    server.close(async () => {
      await closeMongoConnection();
      process.exit(0);
    });
  };

  process.on("SIGINT", gracefulShutdown);
  process.on("SIGTERM", gracefulShutdown);
}
