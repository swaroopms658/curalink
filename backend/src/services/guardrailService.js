export const validateGroundedResponse = (payload) => {
  if (!payload.sources || payload.sources.length === 0) {
    const error = new Error("Guardrail validation failed: response has no sources");
    error.statusCode = 422;
    error.debug = {
      overviewPresent: Boolean(payload?.overview),
      insightsCount: Array.isArray(payload?.insights) ? payload.insights.length : null,
      trialsCount: Array.isArray(payload?.trials) ? payload.trials.length : null,
      sourceIds: []
    };
    throw error;
  }

  const sourceIds = new Set(payload.sources.map((source) => source.id));
  const sourcesById = new Map(payload.sources.map((source) => [source.id, source]));

  if (!payload.overview || !String(payload.overview).trim()) {
    const error = new Error("Guardrail validation failed: response overview is empty");
    error.statusCode = 422;
    error.debug = {
      overview: payload?.overview,
      insightsCount: Array.isArray(payload?.insights) ? payload.insights.length : null,
      trialsCount: Array.isArray(payload?.trials) ? payload.trials.length : null,
      sourceIds: [...sourceIds]
    };
    throw error;
  }

  if (!Array.isArray(payload.insights) || payload.insights.length === 0) {
    const error = new Error("Guardrail validation failed: response has no grounded insights");
    error.statusCode = 422;
    error.debug = {
      overview: payload?.overview,
      insights: payload?.insights,
      trialsCount: Array.isArray(payload?.trials) ? payload.trials.length : null,
      sourceIds: [...sourceIds]
    };
    throw error;
  }

  const invalidInsight = payload.insights.find(
    (item) =>
      !item?.sourceId ||
      !sourceIds.has(item.sourceId) ||
      !item?.summary ||
      sourcesById.get(item.sourceId)?.type !== "publication"
  );
  if (invalidInsight) {
    const error = new Error("Guardrail validation failed: insight citation mismatch");
    error.statusCode = 422;
    error.debug = {
      invalidInsight,
      sourceIds: [...sourceIds]
    };
    throw error;
  }

  const invalidTrial = (payload.trials || []).find(
    (item) =>
      !item?.sourceId ||
      !sourceIds.has(item.sourceId) ||
      !item?.summary ||
      !item?.url ||
      sourcesById.get(item.sourceId)?.type !== "trial"
  );
  if (invalidTrial) {
    const error = new Error("Guardrail validation failed: trial citation mismatch");
    error.statusCode = 422;
    error.debug = {
      invalidTrial,
      sourceIds: [...sourceIds]
    };
    throw error;
  }

  const duplicateInsightSource = payload.insights.find(
    (item, index, items) => items.findIndex((candidate) => candidate.sourceId === item.sourceId) !== index
  );
  if (duplicateInsightSource) {
    const error = new Error("Guardrail validation failed: duplicate insight source");
    error.statusCode = 422;
    error.debug = {
      duplicateInsightSource,
      sourceIds: [...sourceIds]
    };
    throw error;
  }

  const duplicateTrialSource = (payload.trials || []).find(
    (item, index, items) => items.findIndex((candidate) => candidate.sourceId === item.sourceId) !== index
  );
  if (duplicateTrialSource) {
    const error = new Error("Guardrail validation failed: duplicate trial source");
    error.statusCode = 422;
    error.debug = {
      duplicateTrialSource,
      sourceIds: [...sourceIds]
    };
    throw error;
  }

  return payload;
};
