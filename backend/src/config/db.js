import mongoose from "mongoose";

import { logInfo, logWarn, logError } from "../utils/logger.js";

let isConnected = false;

export const connectDb = async () => {
  if (!process.env.MONGODB_URI) {
    logWarn("db", "MONGODB_URI not set, continuing without database connection");
    return;
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: "curalink"
    });

    isConnected = true;
    logInfo("db", "connected to MongoDB Atlas", {
      host: mongoose.connection.host,
      dbName: mongoose.connection.db?.databaseName || "curalink"
    });

    mongoose.connection.on("error", (error) => {
      logError("db", "MongoDB connection error", { error: error.message });
    });

    mongoose.connection.on("disconnected", () => {
      isConnected = false;
      logWarn("db", "MongoDB disconnected");
    });
  } catch (error) {
    isConnected = false;
    logError("db", "failed to connect to MongoDB, continuing without database", {
      error: error.message
    });
  }
};

export const isDatabaseConnected = () => isConnected;
