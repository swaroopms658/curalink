import { createHash } from "node:crypto";

import { buildRetrievalVariants } from "../services/queryExpansionService.js";
import { getSessionContext, storeSessionContext } from "../services/contextService.js";
import { retrieveResearch } from "../services/retrievalService.js";
import { chunkDocuments } from "../services/chunkingService.js";
import { rankResearch } from "../services/rankingService.js";
import { generateGroundedAnswer } from "../services/reasoningService.js";
import { validateGroundedResponse } from "../services/guardrailService.js";
import { ResearchCache } from "../models/ResearchCache.js";
import { isDatabaseConnected } from "../config/db.js";
import { logError, logInfo } from "../utils/logger.js";

const CACHE_TTL_MS = 1000 * 60 * 60 * 2; // 2 hours

const buildCacheKey = (disease, query) => {
  const normalized = `${disease.trim().toLowerCase()}::${query.trim().toLowerCase()}`;
  return createHash("sha256").update(normalized).digest("hex");
};

const readCache = async (cacheKey) => {
  if (!isDatabaseConnected()) {
    return null;
  }

  try {
    const cached = await ResearchCache.findOne({
      cacheKey,
      expiresAt: { $gt: new Date() }
    }).lean();

    return cached?.response || null;
  } catch (_error) {
    return null;
  }
};

const writeCache = async (cacheKey, response) => {
  if (!isDatabaseConnected()) {
    return;
  }

  try {
    await ResearchCache.findOneAndUpdate(
      { cacheKey },
      {
        $set: {
          response,
          expiresAt: new Date(Date.now() + CACHE_TTL_MS)
        }
      },
      { upsert: true }
    );
  } catch (_error) {
    // Cache write failures are non-critical
  }
};

export const handleQuery = async (req, res, next) => {
  try {
    const { disease, query, sessionId } = req.body;

    if (!disease || !query || !sessionId) {
      return res.status(400).json({
        error: "disease, query, and sessionId are required"
      });
    }

    logInfo("query", "received request", {
      disease,
      query,
      sessionId
    });

    // Check cache
    const cacheKey = buildCacheKey(disease, query);
    const cachedResponse = await readCache(cacheKey);

    if (cachedResponse) {
      logInfo("cache", "cache hit, returning cached response", {
        sessionId,
        cacheKey: cacheKey.slice(0, 12)
      });
      return res.json(cachedResponse);
    }

    const sessionContext = await getSessionContext(sessionId);
    logInfo("context", "loaded session context", {
      sessionId,
      recentQueries: sessionContext?.recentQueries?.length || 0,
      selectedSources: sessionContext?.selectedSources?.length || 0
    });
    const retrievalVariants = buildRetrievalVariants({ disease, query, sessionContext });
    logInfo("query-expansion", "built retrieval variants", {
      sessionId,
      variants: retrievalVariants.map((variant) => ({
        label: variant.label,
        expandedQuery: variant.expandedQuery
      }))
    });
    const retrievalResult = await retrieveResearch({
      disease,
      query,
      retrievalVariants,
      sessionContext
    });
    logInfo("retrieval", "completed retrieval", {
      sessionId,
      totalRetrieved: retrievalResult.totalRetrieved,
      passes: retrievalResult.retrievalPasses
    });
    const expandedQuery = retrievalVariants[0]?.expandedQuery || `${disease} ${query}`;
    const chunkedDocuments = chunkDocuments(retrievalResult.documents);
    logInfo("chunking", "chunked documents", {
      sessionId,
      documents: retrievalResult.documents.length,
      chunks: chunkedDocuments.length
    });
    const rankingResult = rankResearch({
      disease,
      query,
      expandedQuery,
      documents: retrievalResult.documents,
      chunks: chunkedDocuments
    });
    const resolvedRankingResult = await rankingResult;
    logInfo("ranking", "completed ranking", {
      sessionId,
      stageCounts: resolvedRankingResult.stageCounts,
      topPublications: resolvedRankingResult.selectedPublications.map((item) => ({
        id: item.id,
        title: item.title,
        score: item.scores?.weighted
      })),
      topTrials: resolvedRankingResult.selectedTrials.map((item) => ({
        id: item.id,
        title: item.title,
        score: item.scores?.weighted
      }))
    });

    const responsePayload = await generateGroundedAnswer({
      disease,
      query,
      sessionId,
      sessionContext,
      selectedPublications: resolvedRankingResult.selectedPublications,
      selectedTrials: resolvedRankingResult.selectedTrials
    });
    logInfo("reasoning", "generated grounded answer", {
      sessionId,
      insights: responsePayload.insights.length,
      trials: responsePayload.trials.length,
      sources: responsePayload.sources.length
    });

    const validatedResponse = validateGroundedResponse(responsePayload);
    logInfo("guardrails", "validated grounded response", {
      sessionId,
      insights: validatedResponse.insights.length,
      trials: validatedResponse.trials.length,
      sources: validatedResponse.sources.length
    });

    await storeSessionContext({
      sessionId,
      disease,
      query,
      expandedQuery,
      selectedSources: validatedResponse.sources
    });
    logInfo("context", "stored session context", {
      sessionId,
      selectedSources: validatedResponse.sources.length
    });

    // Write to cache
    await writeCache(cacheKey, validatedResponse);

    return res.json(validatedResponse);
  } catch (error) {
    if (error.statusCode === 422) {
      logError("guardrails", "query guardrail failure", {
        disease: req.body?.disease,
        query: req.body?.query,
        sessionId: req.body?.sessionId,
        error: error.message,
        debug: error.debug || null
      });
    } else {
      logError("query", "request failed", {
        disease: req.body?.disease,
        query: req.body?.query,
        sessionId: req.body?.sessionId,
        error: error.message,
        debug: error.debug || null
      });
    }

    return next(error);
  }
};
