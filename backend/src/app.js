import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { connectDb } from "./config/db.js";
import queryRoutes from "./routes/queryRoutes.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDistPath = path.resolve(__dirname, "../../frontend/dist");
const hasFrontendBuild = existsSync(frontendDistPath);

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/query", queryRoutes);

if (hasFrontendBuild) {
  app.use(express.static(frontendDistPath));

  app.get(/^\/(?!api).*/, (_req, res) => {
    res.sendFile(path.join(frontendDistPath, "index.html"));
  });
}

app.use((err, _req, res, _next) => {
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    error: err.message || "Internal server error"
  });
});

const startServer = async () => {
  await connectDb();

  app.listen(port, () => {
    console.log(`Backend listening on port ${port}`);
  });
};

startServer().catch((error) => {
  console.error("Failed to start backend", error);
  process.exit(1);
});
