import { Session } from "../models/Session.js";
import { isDatabaseConnected } from "../config/db.js";
import { logInfo, logWarn } from "../utils/logger.js";

const memoryStore = new Map();

export const getSessionContext = async (sessionId) => {
  const fallback = { recentQueries: [], selectedSources: [], location: "" };

  if (isDatabaseConnected()) {
    try {
      const session = await Session.findOne({ sessionId }).lean();

      if (session) {
        logInfo("context", "loaded session from database", { sessionId });
        return {
          disease: session.disease,
          location: session.location || "",
          recentQueries: session.recentQueries || [],
          expandedQuery: session.expandedQuery || "",
          selectedSources: session.selectedSources || []
        };
      }

      return fallback;
    } catch (error) {
      logWarn("context", "database read failed, using memory fallback", {
        sessionId,
        error: error.message
      });
    }
  }

  return memoryStore.get(sessionId) || fallback;
};

export const storeSessionContext = async ({
  sessionId,
  disease,
  location,
  query,
  expandedQuery,
  selectedSources
}) => {
  const contextPayload = {
    disease,
    location: location || "",
    recentQueries: [],
    expandedQuery,
    selectedSources
  };

  if (isDatabaseConnected()) {
    try {
      const existing = await Session.findOne({ sessionId }).lean();
      const previousQueries = existing?.recentQueries || [];

      contextPayload.recentQueries = [...previousQueries, query].slice(-5);

      await Session.findOneAndUpdate(
        { sessionId },
        {
          $set: {
            disease,
            location: location || "",
            expandedQuery,
            selectedSources,
            recentQueries: contextPayload.recentQueries
          }
        },
        { upsert: true, new: true }
      );

      logInfo("context", "stored session to database", {
        sessionId,
        recentQueries: contextPayload.recentQueries.length,
        selectedSources: selectedSources.length
      });
      return;
    } catch (error) {
      logWarn("context", "database write failed, using memory fallback", {
        sessionId,
        error: error.message
      });
    }
  }

  const existingMemory = memoryStore.get(sessionId) || { recentQueries: [] };
  contextPayload.recentQueries = [...existingMemory.recentQueries, query].slice(-5);

  memoryStore.set(sessionId, contextPayload);
};
