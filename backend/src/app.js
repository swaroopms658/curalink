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

const normalizeOriginPattern = (value) => value.trim().replace(/\*/g, ".*");

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const compileOriginMatcher = (value) => {
  if (!value.includes("*")) {
    return {
      type: "exact",
      value
    };
  }

  return {
    type: "pattern",
    value: new RegExp(`^${normalizeOriginPattern(escapeRegExp(value))}$`)
  };
};

const allowedOriginMatchers = (process.env.CORS_ORIGINS || "http://localhost:5173,http://127.0.0.1:5173")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean)
  .map(compileOriginMatcher);

const isAllowedOrigin = (origin) => allowedOriginMatchers.some((matcher) => {
  if (matcher.type === "exact") {
    return matcher.value === origin;
  }

  return matcher.value.test(origin);
});

app.use(cors({
  origin(origin, callback) {
    if (!origin || isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`Origin ${origin} is not allowed by CORS`));
  }
}));
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
